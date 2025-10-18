import SQSHelper from "../aws/sqsHelper.js";
import { CreateQueueCommand, DeleteQueueCommand } from "@aws-sdk/client-sqs";
import dotenv from "dotenv";

dotenv.config();

// Test configuration
const TEST_QUEUE_NAME = `aws-helper-test-queue-${Date.now()}`;
const TEST_QUEUE_URL = `https://sqs.us-east-1.amazonaws.com/381492122108/${TEST_QUEUE_NAME}`;

console.log("🚀 Starting AWS SQS Comprehensive Test");
console.log(`📅 Test started at: ${new Date().toISOString()}`);
console.log(`📬 Test queue: ${TEST_QUEUE_NAME}`);
console.log("=" * 50);

async function runSQSTests() {
  try {
    // 1. Initialize SQS client
    console.log("\n📋 Step 1: Initializing SQS client...");
    await SQSHelper.init(process.env.AWS_REGION || "us-east-1");
    console.log("✅ SQS client initialized successfully");

    // 2. Create a test queue directly using AWS SDK
    console.log("\n📋 Step 2: Creating test queue...");
    const createQueueCommand = new CreateQueueCommand({
      QueueName: TEST_QUEUE_NAME,
      Attributes: {
        MessageRetentionPeriod: "345600", // 4 days
        VisibilityTimeout: "30"
      }
    });
    
    await SQSHelper.client.send(createQueueCommand);
    console.log(`✅ Test queue '${TEST_QUEUE_NAME}' created successfully`);

    // Add the test queue to config temporarily for testing
    SQSHelper.config.queues.push({
      flag: "test_queue_temp",
      queueUrl: TEST_QUEUE_URL,
      defaultDelaySeconds: 0
    });

    // 3. Send a single message
    console.log("\n📋 Step 3: Sending single message...");
    const testMessage = {
      type: "test",
      content: "Hello SQS! This is a test message.",
      timestamp: new Date().toISOString(),
      messageId: Math.random().toString(36).substring(7)
    };
    
    const sendResult = await SQSHelper.send("test_queue_temp", testMessage);
    console.log(`✅ Message sent successfully. MessageId: ${sendResult.MessageId}`);

    // 4. Send batch messages
    console.log("\n📋 Step 4: Sending batch messages...");
    const batchMessages = [
      { type: "batch", content: "Batch message 1", index: 1 },
      { type: "batch", content: "Batch message 2", index: 2 },
      { type: "batch", content: "Batch message 3", index: 3 }
    ];
    
    const batchResult = await SQSHelper.sendBatch("test_queue_temp", batchMessages);
    console.log(`✅ Batch sent successfully. ${batchResult.Successful.length} messages sent`);

    // 5. Receive messages
    console.log("\n📋 Step 5: Receiving messages...");
    const messages = await SQSHelper.receive("test_queue_temp", 5, 2); // Get up to 5 messages, wait 2 seconds
    console.log(`✅ Received ${messages.length} messages`);
    
    messages.forEach((message, index) => {
      try {
        const body = JSON.parse(message.Body);
        console.log(`   ${index + 1}. ${body.type}: ${body.content} (ID: ${message.MessageId})`);
      } catch (e) {
        console.log(`   ${index + 1}. Raw: ${message.Body} (ID: ${message.MessageId})`);
      }
    });

    // 6. Delete received messages
    console.log("\n📋 Step 6: Deleting messages...");
    for (const message of messages) {
      await SQSHelper.delete("test_queue_temp", message.ReceiptHandle);
    }
    console.log(`✅ Deleted ${messages.length} messages`);

    // 7. Test message attributes
    console.log("\n📋 Step 7: Testing message attributes...");
    const messageWithAttributes = {
      type: "attributed",
      content: "Message with custom attributes"
    };
    
    const attributedResult = await SQSHelper.send("test_queue_temp", messageWithAttributes, {
      messageAttributes: {
        Priority: "High",
        Source: "TestSuite",
        Environment: "Development"
      }
    });
    console.log(`✅ Message with attributes sent. MessageId: ${attributedResult.MessageId}`);

    // 8. Receive and inspect message attributes
    console.log("\n📋 Step 8: Receiving message with attributes...");
    const attributedMessages = await SQSHelper.receive("test_queue_temp", 1, 2);
    if (attributedMessages.length > 0) {
      const msg = attributedMessages[0];
      console.log(`✅ Received attributed message: ${JSON.parse(msg.Body).content}`);
      if (msg.MessageAttributes) {
        console.log("   Attributes:");
        Object.entries(msg.MessageAttributes).forEach(([key, value]) => {
          console.log(`     ${key}: ${value.StringValue}`);
        });
      }
      
      // Clean up the attributed message
      await SQSHelper.delete("test_queue_temp", msg.ReceiptHandle);
    }

    // 9. Test retry mechanism with delay
    console.log("\n📋 Step 9: Testing retry mechanism...");
    const delayedMessage = { type: "delayed", content: "Message with 5 second delay" };
    await SQSHelper.send("test_queue_temp", delayedMessage, { 
      delaySeconds: 5,
      retries: 2 
    });
    console.log("✅ Delayed message sent successfully");

    // 10. Test empty queue receive
    console.log("\n📋 Step 10: Testing empty queue receive...");
    const emptyResult = await SQSHelper.receive("test_queue_temp", 1, 1); // Wait only 1 second
    console.log(`✅ Empty queue test completed. Received ${emptyResult.length} messages`);

    // 11. Send one more message for DLQ test (if DLQ exists)
    console.log("\n📋 Step 11: Testing Dead Letter Queue check...");
    await SQSHelper.checkDLQ("test_queue_temp");
    console.log("✅ DLQ check completed");

    // 12. Clean up - delete the test queue
    console.log("\n📋 Step 12: Cleaning up test queue...");
    const deleteQueueCommand = new DeleteQueueCommand({
      QueueUrl: TEST_QUEUE_URL
    });
    
    await SQSHelper.client.send(deleteQueueCommand);
    console.log(`✅ Test queue '${TEST_QUEUE_NAME}' deleted successfully`);

    console.log("\n🎉 All SQS tests completed successfully!");
    console.log(`📅 Test finished at: ${new Date().toISOString()}`);

  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
    
    // Emergency cleanup
    console.log("\n🧹 Attempting emergency cleanup...");
    try {
      const deleteQueueCommand = new DeleteQueueCommand({
        QueueUrl: TEST_QUEUE_URL
      });
      await SQSHelper.client.send(deleteQueueCommand);
      console.log("✅ Emergency cleanup completed");
    } catch (cleanupError) {
      console.error("❌ Emergency cleanup failed:", cleanupError.message);
      console.log(`ℹ️ You may need to manually delete queue: ${TEST_QUEUE_NAME}`);
    }
    
    process.exit(1);
  }
}

// Run the tests
runSQSTests();
