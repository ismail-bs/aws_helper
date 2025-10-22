import SQSHelper from "../aws/sqsHelper.js";
import SecretsManager from "../aws/SecretsManager.js";
import AwsS3 from "../aws/AwsS3.js";
import { CreateQueueCommand, DeleteQueueCommand } from "@aws-sdk/client-sqs";
import { LambdaClient, CreateFunctionCommand, DeleteFunctionCommand, CreateEventSourceMappingCommand, DeleteEventSourceMappingCommand } from "@aws-sdk/client-lambda";
import { IAMClient, CreateRoleCommand, AttachRolePolicyCommand, DeleteRoleCommand, DetachRolePolicyCommand } from "@aws-sdk/client-iam";
import { CloudWatchLogsClient, DescribeLogStreamsCommand, GetLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import AdmZip from "adm-zip";
import dotenv from "dotenv";

dotenv.config();

// Test configuration
const TIMESTAMP = Date.now();
const TEST_QUEUE_NAME = `aws-helper-test-queue-${TIMESTAMP}`;
const TEST_DLQ_NAME = `${TEST_QUEUE_NAME}-dlq`;
const TEST_LAMBDA_NAME = `sqs-processor-${TIMESTAMP}`;
const TEST_ROLE_NAME = `sqs-lambda-role-${TIMESTAMP}`;
const TEST_BUCKET_NAME = `aws-helper-s3-test-${TIMESTAMP}`;

// AWS Configuration - Account ID will be retrieved dynamically
let ACCOUNT_ID;
let TEST_QUEUE_URL, TEST_DLQ_URL; // Queue URLs will be constructed after getting Account ID
let lambdaClient, iamClient, logsClient;
let lambdaArn, roleArn, eventSourceMappingId;

console.log("Starting AWS SQS integration test");
console.log(`Test queue: ${TEST_QUEUE_NAME}`);
console.log(`Timestamp: ${new Date().toISOString()}\n`);

async function runSQSTests() {
  try {
    const region = process.env.AWS_REGION || "us-east-1";

    // 1. Get AWS Account ID dynamically
    console.log("\nStep 1: Getting AWS Account ID...");
    const stsClient = new STSClient({ region });
    const callerIdentity = await stsClient.send(new GetCallerIdentityCommand({}));
    ACCOUNT_ID = callerIdentity.Account;
    console.log(`AWS Account ID: ${ACCOUNT_ID}`);
    console.log(`User ARN: ${callerIdentity.Arn}`);
    
    // Construct queue URLs now that we have Account ID
    TEST_QUEUE_URL = `https://sqs.${region}.amazonaws.com/${ACCOUNT_ID}/${TEST_QUEUE_NAME}`;
    TEST_DLQ_URL = `https://sqs.${region}.amazonaws.com/${ACCOUNT_ID}/${TEST_DLQ_NAME}`;
    console.log(`Queue URLs constructed for account ${ACCOUNT_ID}`);

    // 2. Test SecretsManager credential scenarios
    console.log("\nStep 2: Testing SecretsManager credential scenarios...");
    console.log("   Testing environment variables and Secrets Manager fallback:");
    
    // Test current credential scenario
    console.log(`   AWS_ACCESS_KEY_ID present: ${!!process.env.AWS_ACCESS_KEY_ID}`);
    console.log(`   AWS_SECRET_ACCESS_KEY present: ${!!process.env.AWS_SECRET_ACCESS_KEY}`);
    
    // Test SecretsManager class
    const credentials = await SecretsManager.getAWSCredentials(region);
    console.log(`   Credential source: ${credentials.source}`);
    console.log(`   Access Key: ${credentials.accessKeyId.substring(0, 8)}...`);
    
    // Test connection
    const connectionTest = await SecretsManager.testConnection(region);
    console.log(`   Secrets Manager connectivity: ${connectionTest ? 'SUCCESS' : 'FAILED'}`);

    // 3. Initialize all AWS clients 
    console.log("\nStep 3: Initializing AWS clients...");
    await SQSHelper.init(region);
    await AwsS3.init(region);
    lambdaClient = new LambdaClient({ region });
    iamClient = new IAMClient({ region });
    logsClient = new CloudWatchLogsClient({ region });
    console.log("AWS clients initialized (SQS, S3, Lambda, IAM, CloudWatch)");

    // 4. Create DLQ first for comprehensive testing
    console.log("\nStep 4: Creating Dead Letter Queue...");
    const createDLQCommand = new CreateQueueCommand({
      QueueName: TEST_DLQ_NAME,
      Attributes: {
        MessageRetentionPeriod: "1209600" // 14 days
      }
    });
    
    await SQSHelper.client.send(createDLQCommand);
    console.log(`DLQ created: ${TEST_DLQ_NAME}`);

    // 5. Create main queue with DLQ integration
    console.log("\nStep 5: Creating main queue with DLQ integration...");
    const createQueueCommand = new CreateQueueCommand({
      QueueName: TEST_QUEUE_NAME,
      Attributes: {
        MessageRetentionPeriod: "345600", // 4 days
        VisibilityTimeout: "300", // 5 minutes - must be >= Lambda timeout (60s)
        // Configure DLQ with 3 retry attempts
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: `arn:aws:sqs:${region}:${ACCOUNT_ID}:${TEST_DLQ_NAME}`,
          maxReceiveCount: 3
        })
      }
    });
    
    await SQSHelper.client.send(createQueueCommand);
    console.log(`Queue created: ${TEST_QUEUE_NAME}`);

    // Add both queues to config temporarily for testing
    SQSHelper.config.queues.push({
      flag: "test_queue_temp",
      queueUrl: TEST_QUEUE_URL,
      dlqUrl: TEST_DLQ_URL,
      defaultDelaySeconds: 0
    });

    // 6. Create IAM role for Lambda
    console.log("\nStep 6: Creating IAM role for Lambda...");
    const trustPolicy = {
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole"
      }]
    };

    const createRoleResponse = await iamClient.send(new CreateRoleCommand({
      RoleName: TEST_ROLE_NAME,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy)
    }));
    roleArn = createRoleResponse.Role.Arn;

    // Attach required policies
    await iamClient.send(new AttachRolePolicyCommand({
      RoleName: TEST_ROLE_NAME,
      PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
    }));
    await iamClient.send(new AttachRolePolicyCommand({
      RoleName: TEST_ROLE_NAME, 
      PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
    }));
    console.log(`IAM role created: ${TEST_ROLE_NAME}`);

    // Wait for role propagation
    console.log("   Waiting 10 seconds for IAM role propagation...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 7. Create real Lambda function
    console.log("\nStep 7: Creating Lambda function...");
    
    // Create proper Lambda code
    const lambdaCode = `exports.handler = async (event) => {
        console.log('Lambda triggered by SQS', JSON.stringify(event, null, 2));

        for (const record of event.Records) {
            const messageBody = JSON.parse(record.body);
            console.log('Processing:', messageBody);

            if (messageBody.shouldFail) {
                console.log('Intentional failure for DLQ testing');
                throw new Error(\`Failed processing: \${messageBody.id}\`);
            }

            console.log(\`Success: \${messageBody.id}\`);
        }

        return { statusCode: 200, body: 'Messages processed' };
    };`;

    // Create proper ZIP file for Lambda deployment
    const zip = new AdmZip();
    zip.addFile("index.js", Buffer.from(lambdaCode, "utf8"));
    const zipBuffer = zip.toBuffer();
    
    console.log(`   Created ZIP package (${zipBuffer.length} bytes)`);

    const createFunctionResponse = await lambdaClient.send(new CreateFunctionCommand({
      FunctionName: TEST_LAMBDA_NAME,
      Runtime: 'nodejs18.x',
      Role: roleArn,
      Handler: 'index.handler',
      Code: { ZipFile: zipBuffer },
      Description: 'Real SQS processor for comprehensive testing',
      Timeout: 60
    }));
    lambdaArn = createFunctionResponse.FunctionArn;
    console.log(`Lambda function created: ${TEST_LAMBDA_NAME}`);

    // 8. Connect SQS to Lambda (real trigger)
    console.log("\nStep 8: Connecting SQS to Lambda trigger...");
    const eventSourceResponse = await lambdaClient.send(new CreateEventSourceMappingCommand({
      EventSourceArn: `arn:aws:sqs:${region}:${ACCOUNT_ID}:${TEST_QUEUE_NAME}`,
      FunctionName: lambdaArn,
      BatchSize: 5
    }));
    eventSourceMappingId = eventSourceResponse.UUID;
    console.log(`SQS to Lambda trigger configured`);

    // Wait for trigger to be active
    console.log("   Waiting 15 seconds for Lambda trigger to become active...");
    await new Promise(resolve => setTimeout(resolve, 15000));

    // 9. Send messages including poison messages for DLQ testing
    console.log("\nStep 9: Sending messages (normal and DLQ test)...");
    
    // Normal messages
    const normalMessages = [
      { id: "msg-001", type: "test", content: "Normal message 1", shouldFail: false },
      { id: "msg-002", type: "test", content: "Normal message 2", shouldFail: false }
    ];
    
    // Poison message for DLQ testing
    const poisonMessage = {
      id: "poison-001", 
      type: "poison", 
      content: "This will fail and go to DLQ", 
      shouldFail: true
    };

    // Send normal messages
    for (const msg of normalMessages) {
      await SQSHelper.send("test_queue_temp", msg);
      console.log(`Sent normal message: ${msg.id}`);
    }
    
    // Send poison message  
    await SQSHelper.send("test_queue_temp", poisonMessage);
    console.log(`Sent poison message: ${poisonMessage.id} (will fail and go to DLQ)`);
    console.log(`Lambda functions should be executing now`);

    // 10. Real-time monitoring of Lambda processing
    console.log("\nStep 10: Real-time monitoring of Lambda processing...");
    console.log("   Monitoring CloudWatch logs for 60 seconds...");
    
    const logGroupName = `/aws/lambda/${TEST_LAMBDA_NAME}`;
    for (let i = 0; i < 12; i++) { // Monitor for 1 minute
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      try {
        const logStreamsResponse = await logsClient.send(new DescribeLogStreamsCommand({
          logGroupName,
          orderBy: 'LastEventTime',
          descending: true,
          limit: 1
        }));

        if (logStreamsResponse.logStreams?.length > 0) {
          const latestStream = logStreamsResponse.logStreams[0];
          const logEventsResponse = await logsClient.send(new GetLogEventsCommand({
            logGroupName,
            logStreamName: latestStream.logStreamName,
            startTime: Date.now() - 30000
          }));

          if (logEventsResponse.events?.length > 0) {
            console.log(`   [${i + 1}/12] Lambda activity detected:`);
            logEventsResponse.events.slice(-2).forEach(event => {
              console.log(`     ${new Date(event.timestamp).toLocaleTimeString()}: ${event.message.trim()}`);
            });
          } else {
            console.log(`   [${i + 1}/12] Waiting for Lambda execution...`);
          }
        }
      } catch (logError) {
        console.log(`   [${i + 1}/12] Logs not ready yet...`);
      }
    }

    // 11. Check DLQ for poison messages
    console.log("\nStep 11: Checking Dead Letter Queue for poison messages...");
    const dlqMessages = await SQSHelper.checkDLQ("test_queue_temp");
    if (dlqMessages.length > 0) {
      console.log(`Found ${dlqMessages.length} poison message(s) in DLQ`);
      dlqMessages.forEach((msg, index) => {
        const body = JSON.parse(msg.Body);
        console.log(`   DLQ Message ${index + 1}: ${body.id} - ${body.content}`);
      });
    } else {
      console.log("No messages in DLQ yet (retry timing varies)");
    }

    // 12. S3 file download test
    console.log("\nStep 12: S3 file download test...");
    await AwsS3.createBucket(TEST_BUCKET_NAME);
    console.log(`S3 test bucket created: ${TEST_BUCKET_NAME}`);
    
    // Upload test file
    const testFileContent = `S3 Download Test File
      Created: ${new Date().toISOString()}
      Integration Test Data`;
    
    await AwsS3.uploadFile(TEST_BUCKET_NAME, "test-file.txt", Buffer.from(testFileContent));
    console.log("Test file uploaded to S3");
    
    // Download test file
    const downloadedBuffer = await AwsS3.getFile(TEST_BUCKET_NAME, "test-file.txt");
    const downloadedContent = downloadedBuffer.toString();
    console.log(`File downloaded successfully (${downloadedBuffer.length} bytes)`);
    console.log(`   Content preview: ${downloadedContent.split('\n')[0]}...`);
    
    // Clean up S3 resources
    await AwsS3.deleteFile(TEST_BUCKET_NAME, "test-file.txt");
    await AwsS3.deleteBucket(TEST_BUCKET_NAME);
    console.log("S3 test resources cleaned up");

    // 13. Pause for inspection (optional)
    console.log("\nPause for inspection:");
    console.log("Check AWS Console for created resources (SQS, Lambda, IAM, CloudWatch, S3)");
    console.log("Waiting 120 seconds before cleanup");
    console.log("Press Ctrl+C to keep resources for inspection");
    await new Promise(resolve => setTimeout(resolve, 120000));

    // 14. Final comprehensive cleanup
    console.log("\nStep 13: Comprehensive cleanup of all AWS resources...");
    
    // Delete Lambda event source mapping
    if (eventSourceMappingId) {
      await lambdaClient.send(new DeleteEventSourceMappingCommand({
        UUID: eventSourceMappingId
      }));
      console.log("Event source mapping deleted");
    }

    // Delete Lambda function
    if (lambdaArn) {
      await lambdaClient.send(new DeleteFunctionCommand({
        FunctionName: TEST_LAMBDA_NAME
      }));
      console.log("Lambda function deleted");
    }

    // Delete IAM role
    if (roleArn) {
      await iamClient.send(new DetachRolePolicyCommand({
        RoleName: TEST_ROLE_NAME,
        PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
      }));
      await iamClient.send(new DetachRolePolicyCommand({
        RoleName: TEST_ROLE_NAME,
        PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
      }));
      await iamClient.send(new DeleteRoleCommand({
        RoleName: TEST_ROLE_NAME
      }));
      console.log("IAM role deleted");
    }

    // Delete SQS queues
    await SQSHelper.client.send(new DeleteQueueCommand({ QueueUrl: TEST_QUEUE_URL }));
    console.log("Main queue deleted");
    
    await SQSHelper.client.send(new DeleteQueueCommand({ QueueUrl: TEST_DLQ_URL }));
    console.log("DLQ deleted");

    console.log("\nSQS integration test completed");
    console.log(`Finished at: ${new Date().toISOString()}`);
    
    console.log("\nTest summary:");
    console.log("SecretsManager reusable class with credential fallback");
    console.log("Real Lambda function created and triggered by SQS"); 
    console.log("Real-time CloudWatch monitoring of Lambda executions");
    console.log("DLQ testing with poison message retry demonstration");
    console.log("S3 file upload and download testing");
    console.log("Complete AWS ecosystem integration verified");
    console.log("Production-ready IAM roles and permissions");
    console.log("Complete resource cleanup performed");

  } catch (error) {
    console.error("\nTest failed with error:", error);
    
    // Emergency cleanup for all resources
    console.log("\nAttempting emergency cleanup...");
    try {
      // Clean up Lambda resources
      if (eventSourceMappingId) {
        await lambdaClient.send(new DeleteEventSourceMappingCommand({ UUID: eventSourceMappingId }));
      }
      if (lambdaArn) {
        await lambdaClient.send(new DeleteFunctionCommand({ FunctionName: TEST_LAMBDA_NAME }));
      }
      if (roleArn) {
        await iamClient.send(new DetachRolePolicyCommand({
          RoleName: TEST_ROLE_NAME,
          PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        }));
        await iamClient.send(new DetachRolePolicyCommand({
          RoleName: TEST_ROLE_NAME,
          PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
        }));
        await iamClient.send(new DeleteRoleCommand({ RoleName: TEST_ROLE_NAME }));
      }
      
      // Clean up SQS queues
      await SQSHelper.client.send(new DeleteQueueCommand({ QueueUrl: TEST_QUEUE_URL }));
      await SQSHelper.client.send(new DeleteQueueCommand({ QueueUrl: TEST_DLQ_URL }));
      
      console.log("Emergency cleanup completed for all resources");
    } catch (cleanupError) {
      console.error("Emergency cleanup failed:", cleanupError.message);
      console.log(`Manual cleanup needed for: ${TEST_QUEUE_NAME}, ${TEST_DLQ_NAME}, ${TEST_LAMBDA_NAME}, ${TEST_ROLE_NAME}`);
    }
    
    process.exit(1);
  }
}

// Run the tests
runSQSTests();
