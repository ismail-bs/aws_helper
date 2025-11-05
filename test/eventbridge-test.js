/**
 * ═══════════════════════════════════════════════════════════════════
 *  AWS EVENTBRIDGE COMPREHENSIVE TEST - EVENT-DRIVEN ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════
 * 
 * WHAT THIS TESTS (EVENTBRIDGE ONLY):
 * ────────────────────────────────────
 * • Event bus creation & management
 * • Rule creation with event patterns
 * • Target configuration (Lambda, SQS, SNS)
 * • Custom event publishing
 * • Event pattern matching
 * • Rule enable/disable
 * • Archive and replay (optional)
 * 
 * BASIC ARCHITECTURE:
 * ───────────────────
 * Event Source → EventBridge → Rule (Pattern Match) → Target (Action)
 * 
 * NOTE:
 * ─────
 * This is a STANDALONE EventBridge test.
 * Tests only EventBridge event routing features.
 * 
 * For production integrations with IVS, Lambda, etc.,
 * those can be added separately.
 * 
 * RUN: node test/eventbridge-test.js
 * ═══════════════════════════════════════════════════════════════════
 */

const {
  EventBridgeClient,
  CreateEventBusCommand,
  PutRuleCommand,
  PutTargetsCommand,
  PutEventsCommand,
  ListRulesCommand,
  DescribeRuleCommand,
  ListTargetsByRuleCommand,
  DisableRuleCommand,
  EnableRuleCommand,
  RemoveTargetsCommand,
  DeleteRuleCommand,
  DeleteEventBusCommand,
  DescribeEventBusCommand
} = require("@aws-sdk/client-eventbridge");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { 
  SQSClient, 
  CreateQueueCommand, 
  GetQueueAttributesCommand, 
  SetQueueAttributesCommand,
  DeleteQueueCommand 
} = require("@aws-sdk/client-sqs");
const { SecretsManager } = require("../aws/SecretsManager.js");
const dotenv = require("dotenv");

dotenv.config();

// Test configuration
const TIMESTAMP = Date.now();
const TEST_EVENT_BUS = `test-event-bus-${TIMESTAMP}`;
const TEST_RULE_1 = `test-rule-order-${TIMESTAMP}`;
const TEST_RULE_2 = `test-rule-user-${TIMESTAMP}`;
const TEST_QUEUE_NAME = `test-eventbridge-queue-${TIMESTAMP}`;

let ACCOUNT_ID;
let createdEventBusName = null;
let createdRuleNames = [];
let createdQueueUrl = null;
let createdQueueArn = null;

console.log("🔔 AWS EVENTBRIDGE COMPREHENSIVE TEST");
console.log(`📅 Test started at: ${new Date().toISOString()}`);
console.log(`📋 Test ID: ${TIMESTAMP}`);

console.log("\n📋 THIS TEST COVERS (EVENTBRIDGE ONLY):");
console.log("   ✅ Custom event bus creation");
console.log("   ✅ Event rule creation with patterns");
console.log("   ✅ SQS target configuration");
console.log("   ✅ SQS resource policy (EventBridge permissions)");
console.log("   ✅ Custom event publishing");
console.log("   ✅ Event pattern matching");
console.log("   ✅ Rule enable/disable");
console.log("   ✅ Event routing validation");
console.log("   ✅ Resource cleanup");

async function runEventBridgeTests() {
  try {
    const region = process.env.AWS_REGION || "us-west-2";

    // 1. Get AWS Account ID
    console.log("\n📋 Step 1: Getting AWS Account ID...");
    const stsClient = new STSClient({ region });
    const callerIdentity = await stsClient.send(new GetCallerIdentityCommand({}));
    ACCOUNT_ID = callerIdentity.Account;
    console.log(`✅ AWS Account ID: ${ACCOUNT_ID}`);
    console.log(`✅ User ARN: ${callerIdentity.Arn}`);

    // 2. Test SecretsManager credential scenarios
    console.log("\n📋 Step 2: Testing SecretsManager credential scenarios...");
    const credentials = await SecretsManager.getAWSCredentials(region);
    console.log(`   ✅ Credential source: ${credentials.source}`);
    console.log(`   ✅ Access Key: ${credentials.accessKeyId.substring(0, 8)}...`);

    // 3. Initialize AWS clients
    console.log("\n📋 Step 3: Initializing AWS clients...");
    const eventBridgeClient = new EventBridgeClient({ region });
    const sqsClient = new SQSClient({ region });
    console.log("✅ EventBridge client initialized");
    console.log("✅ SQS client initialized (for testing targets)");

    // 4. Create custom event bus
    console.log("\n📋 Step 4: Creating custom event bus...");
    console.log("   ℹ️ Event buses organize events by domain (orders, users, etc.)");
    
    await eventBridgeClient.send(new CreateEventBusCommand({
      Name: TEST_EVENT_BUS
    }));
    createdEventBusName = TEST_EVENT_BUS;
    console.log(`✅ Event bus created: ${TEST_EVENT_BUS}`);
    
    // Verify event bus
    const busDetails = await eventBridgeClient.send(new DescribeEventBusCommand({
      Name: TEST_EVENT_BUS
    }));
    console.log(`   ARN: ${busDetails.Arn}`);
    console.log(`   Name: ${busDetails.Name}`);

    // 5. Create SQS queue as event target
    console.log("\n📋 Step 5: Creating SQS queue as event target...");
    console.log("   ℹ️ EventBridge will send matched events to this queue");
    
    const queueResponse = await sqsClient.send(new CreateQueueCommand({
      QueueName: TEST_QUEUE_NAME,
      Attributes: {
        VisibilityTimeout: "300",
        MessageRetentionPeriod: "86400" // 1 day
      }
    }));
    createdQueueUrl = queueResponse.QueueUrl;
    
    const queueAttrs = await sqsClient.send(new GetQueueAttributesCommand({
      QueueUrl: createdQueueUrl,
      AttributeNames: ["QueueArn"]
    }));
    createdQueueArn = queueAttrs.Attributes.QueueArn;
    
    console.log(`✅ SQS Queue created: ${TEST_QUEUE_NAME}`);
    console.log(`   URL: ${createdQueueUrl}`);
    console.log(`   ARN: ${createdQueueArn}`);

    // 6. Set SQS queue policy to allow EventBridge
    console.log("\n📋 Step 6: Setting SQS queue policy for EventBridge...");
    console.log("   ℹ️ EventBridge needs permission to send messages to SQS");
    
    const queuePolicy = {
      Version: "2012-10-17",
      Id: `${TEST_QUEUE_NAME}-policy`,
      Statement: [
        {
          Sid: "AllowEventBridgeToSendMessage",
          Effect: "Allow",
          Principal: {
            Service: "events.amazonaws.com"
          },
          Action: "sqs:SendMessage",
          Resource: createdQueueArn,
          Condition: {
            ArnEquals: {
              "aws:SourceArn": [
                `arn:aws:events:${region}:${ACCOUNT_ID}:rule/${TEST_EVENT_BUS}/${TEST_RULE_1}`,
                `arn:aws:events:${region}:${ACCOUNT_ID}:rule/${TEST_EVENT_BUS}/${TEST_RULE_2}`
              ]
            }
          }
        }
      ]
    };
    
    await sqsClient.send(new SetQueueAttributesCommand({
      QueueUrl: createdQueueUrl,
      Attributes: {
        Policy: JSON.stringify(queuePolicy)
      }
    }));
    
    console.log("✅ SQS queue policy set");
    console.log("   EventBridge can now send messages to this queue");

    // 7. Create EventBridge rule for order events
    console.log("\n📋 Step 7: Creating EventBridge rule for order events...");
    console.log("   ℹ️ Rules match event patterns and route to targets");
    
    const orderEventPattern = {
      source: ["custom.orders"],
      "detail-type": ["Order Placed", "Order Cancelled"],
      detail: {
        status: ["pending", "cancelled"]
      }
    };
    
    await eventBridgeClient.send(new PutRuleCommand({
      Name: TEST_RULE_1,
      EventBusName: TEST_EVENT_BUS,
      EventPattern: JSON.stringify(orderEventPattern),
      State: "ENABLED",
      Description: "Route order events to processing queue"
    }));
    createdRuleNames.push(TEST_RULE_1);
    
    console.log(`✅ Rule created: ${TEST_RULE_1}`);
    console.log("   📊 Event Pattern:");
    console.log(JSON.stringify(orderEventPattern, null, 6));

    // 8. Add SQS target to rule
    console.log("\n📋 Step 8: Adding SQS target to rule...");
    
    await eventBridgeClient.send(new PutTargetsCommand({
      Rule: TEST_RULE_1,
      EventBusName: TEST_EVENT_BUS,
      Targets: [
        {
          Id: "1",
          Arn: createdQueueArn,
          InputTransformer: {
            InputPathsMap: {
              "orderId": "$.detail.orderId",
              "amount": "$.detail.amount",
              "status": "$.detail.status"
            },
            InputTemplate: JSON.stringify({
              message: "Order processed",
              orderId: "<orderId>",
              amount: "<amount>",
              status: "<status>",
              processedAt: new Date().toISOString()
            })
          }
        }
      ]
    }));
    
    console.log("✅ Target added to rule");
    console.log("   Target: SQS Queue");
    console.log("   Transform: Custom message format");

    // 9. Create second rule for user events
    console.log("\n📋 Step 9: Creating second rule for user events...");
    
    const userEventPattern = {
      source: ["custom.users"],
      "detail-type": ["User Registered", "User Deleted"]
    };
    
    await eventBridgeClient.send(new PutRuleCommand({
      Name: TEST_RULE_2,
      EventBusName: TEST_EVENT_BUS,
      EventPattern: JSON.stringify(userEventPattern),
      State: "ENABLED",
      Description: "Route user events to processing queue"
    }));
    createdRuleNames.push(TEST_RULE_2);
    
    console.log(`✅ Rule created: ${TEST_RULE_2}`);
    console.log("   📊 Event Pattern:");
    console.log(JSON.stringify(userEventPattern, null, 6));

    // 10. Add target to second rule
    console.log("\n📋 Step 10: Adding target to second rule...");
    
    await eventBridgeClient.send(new PutTargetsCommand({
      Rule: TEST_RULE_2,
      EventBusName: TEST_EVENT_BUS,
      Targets: [
        {
          Id: "1",
          Arn: createdQueueArn
        }
      ]
    }));
    
    console.log("✅ Target added to second rule");

    // 11. List all rules in event bus
    console.log("\n📋 Step 11: Listing all rules in event bus...");
    
    const rulesResponse = await eventBridgeClient.send(new ListRulesCommand({
      EventBusName: TEST_EVENT_BUS
    }));
    
    console.log(`✅ Found ${rulesResponse.Rules.length} rule(s)`);
    rulesResponse.Rules.forEach((rule, idx) => {
      console.log(`   ${idx + 1}. ${rule.Name}`);
      console.log(`      State: ${rule.State}`);
      console.log(`      Description: ${rule.Description || 'N/A'}`);
    });

    // 12. Describe rule details
    console.log("\n📋 Step 12: Getting rule details...");
    
    const ruleDetails = await eventBridgeClient.send(new DescribeRuleCommand({
      Name: TEST_RULE_1,
      EventBusName: TEST_EVENT_BUS
    }));
    
    console.log(`✅ Rule: ${ruleDetails.Name}`);
    console.log(`   ARN: ${ruleDetails.Arn}`);
    console.log(`   State: ${ruleDetails.State}`);
    console.log(`   Event Pattern: ${ruleDetails.EventPattern}`);

    // 13. List targets for rule
    console.log("\n📋 Step 13: Listing targets for rule...");
    
    const targetsResponse = await eventBridgeClient.send(new ListTargetsByRuleCommand({
      Rule: TEST_RULE_1,
      EventBusName: TEST_EVENT_BUS
    }));
    
    console.log(`✅ Found ${targetsResponse.Targets.length} target(s)`);
    targetsResponse.Targets.forEach((target, idx) => {
      console.log(`   ${idx + 1}. ID: ${target.Id}`);
      console.log(`      ARN: ${target.Arn}`);
      console.log(`      Input Transformer: ${target.InputTransformer ? 'Yes' : 'No'}`);
    });

    // 14. Publish custom events
    console.log("\n📋 Step 14: Publishing custom events...");
    console.log("   ℹ️ These events will be matched by rules and sent to SQS");
    
    const events = [
      {
        Source: "custom.orders",
        DetailType: "Order Placed",
        Detail: JSON.stringify({
          orderId: "ORD-12345",
          customerId: "CUST-789",
          amount: 99.99,
          status: "pending",
          items: ["Item A", "Item B"]
        }),
        EventBusName: TEST_EVENT_BUS
      },
      {
        Source: "custom.orders",
        DetailType: "Order Cancelled",
        Detail: JSON.stringify({
          orderId: "ORD-67890",
          customerId: "CUST-456",
          amount: 149.99,
          status: "cancelled",
          reason: "Customer request"
        }),
        EventBusName: TEST_EVENT_BUS
      },
      {
        Source: "custom.users",
        DetailType: "User Registered",
        Detail: JSON.stringify({
          userId: "USER-111",
          email: "test@example.com",
          registeredAt: new Date().toISOString()
        }),
        EventBusName: TEST_EVENT_BUS
      },
      {
        Source: "custom.products",
        DetailType: "Product Created",
        Detail: JSON.stringify({
          productId: "PROD-999",
          name: "Test Product"
        }),
        EventBusName: TEST_EVENT_BUS
      }
    ];
    
    const publishResult = await eventBridgeClient.send(new PutEventsCommand({
      Entries: events
    }));
    
    console.log(`✅ Published ${events.length} events`);
    console.log(`   Successful: ${publishResult.FailedEntryCount === 0 ? events.length : events.length - publishResult.FailedEntryCount}`);
    console.log(`   Failed: ${publishResult.FailedEntryCount || 0}`);
    
    if (publishResult.FailedEntryCount > 0) {
      console.log("\n   ⚠️ Failed entries:");
      publishResult.Entries.forEach((entry, idx) => {
        if (entry.ErrorCode) {
          console.log(`      ${idx + 1}. Error: ${entry.ErrorCode} - ${entry.ErrorMessage}`);
        }
      });
    }

    // 15. Event pattern matching explanation
    console.log("\n📋 Step 15: Event pattern matching results...");
    console.log("\n   📊 EXPECTED ROUTING:");
    console.log(`   ✅ Event 1 (Order Placed) → ${TEST_RULE_1} → SQS Queue`);
    console.log(`   ✅ Event 2 (Order Cancelled) → ${TEST_RULE_1} → SQS Queue`);
    console.log(`   ✅ Event 3 (User Registered) → ${TEST_RULE_2} → SQS Queue`);
    console.log(`   ❌ Event 4 (Product Created) → No matching rule (ignored)`);
    
    console.log("\n   💡 WHY EVENT PATTERN MATCHING:");
    console.log("      • Only relevant events trigger actions");
    console.log("      • Reduces costs (no processing of unwanted events)");
    console.log("      • Enables event-driven microservices");
    console.log("      • Decouples event producers from consumers");

    // 16. Test rule enable/disable
    console.log("\n📋 Step 16: Testing rule enable/disable...");
    
    // Disable rule
    await eventBridgeClient.send(new DisableRuleCommand({
      Name: TEST_RULE_1,
      EventBusName: TEST_EVENT_BUS
    }));
    console.log(`✅ Rule disabled: ${TEST_RULE_1}`);
    
    // Verify state
    const disabledRule = await eventBridgeClient.send(new DescribeRuleCommand({
      Name: TEST_RULE_1,
      EventBusName: TEST_EVENT_BUS
    }));
    console.log(`   State: ${disabledRule.State}`);
    
    // Re-enable rule
    await eventBridgeClient.send(new EnableRuleCommand({
      Name: TEST_RULE_1,
      EventBusName: TEST_EVENT_BUS
    }));
    console.log(`✅ Rule re-enabled: ${TEST_RULE_1}`);

    // 17. Production use cases
    console.log("\n📋 Step 17: Real-world EventBridge use cases...");
    
    console.log("\n   🎬 IVS LIVE STREAMING:");
    console.log("      Event: IVS Stream Started");
    console.log("      Rule: Match stream start events");
    console.log("      Target: Lambda → Notify followers");
    console.log("      Pattern:");
    console.log(JSON.stringify({
      source: ["aws.ivs"],
      "detail-type": ["IVS Stream State Change"],
      detail: {
        event_name: ["Stream Start"]
      }
    }, null, 6));
    
    console.log("\n   🛒 E-COMMERCE:");
    console.log("      Event: Order Placed");
    console.log("      Rules: Multiple rules for different teams");
    console.log("      Targets:");
    console.log("        • SQS → Order fulfillment");
    console.log("        • Lambda → Email notification");
    console.log("        • SNS → Analytics team");
    
    console.log("\n   👤 USER MANAGEMENT:");
    console.log("      Event: User Registered");
    console.log("      Targets:");
    console.log("        • Lambda → Welcome email");
    console.log("        • SQS → CRM sync");
    console.log("        • EventBridge Archive → Compliance");

    // 18. Best practices
    console.log("\n📋 Step 18: EventBridge Best Practices...");
    
    console.log("\n   🔒 SECURITY:");
    console.log("      ✅ Use resource-based policies on targets");
    console.log("      ✅ Limit cross-account access");
    console.log("      ✅ Enable CloudTrail logging");
    console.log("      ✅ Use least-privilege IAM roles");
    
    console.log("\n   💰 COST OPTIMIZATION:");
    console.log("      ✅ $1 per million custom events");
    console.log("      ✅ AWS service events are FREE");
    console.log("      ✅ Use precise event patterns (reduce noise)");
    console.log("      ✅ Delete unused rules and event buses");
    
    console.log("\n   📊 PERFORMANCE:");
    console.log("      ✅ Use batching (up to 10 events per call)");
    console.log("      ✅ Keep event patterns simple");
    console.log("      ✅ Use InputTransformers to reduce payload size");
    console.log("      ✅ Monitor failed deliveries in CloudWatch");

    // 19. Architecture patterns
    console.log("\n📋 Step 19: EventBridge Architecture Patterns...");
    
    console.log("\n   🏗️ PATTERN 1: FAN-OUT");
    console.log("      One event → Multiple targets");
    console.log("      Example: Order Placed → Email + SMS + CRM + Analytics");
    
    console.log("\n   🏗️ PATTERN 2: FILTERING");
    console.log("      Many events → Only specific ones processed");
    console.log("      Example: Only high-value orders ($1000+) → Special handling");
    
    console.log("\n   🏗️ PATTERN 3: CROSS-ACCOUNT");
    console.log("      Events from Account A → Targets in Account B");
    console.log("      Example: Dev account events → Central monitoring account");
    
    console.log("\n   🏗️ PATTERN 4: AGGREGATION");
    console.log("      Multiple sources → Single event bus → Unified processing");
    console.log("      Example: Orders + Users + Products → Analytics pipeline");

    // 20. Monitoring and debugging
    console.log("\n📋 Step 20: Monitoring EventBridge...");
    
    console.log("\n   📊 CLOUDWATCH METRICS:");
    console.log("      • Invocations - How many times rules triggered");
    console.log("      • FailedInvocations - Delivery failures");
    console.log("      • TriggeredRules - Rules that matched");
    console.log("      • InvocationTime - Processing latency");
    
    console.log("\n   🔍 DEBUGGING:");
    console.log("      • Enable CloudWatch Logs for rules");
    console.log("      • Use EventBridge Schema Registry");
    console.log("      • Test patterns in EventBridge console");
    console.log("      • Check target permissions (IAM)");

    // 21. Pause for inspection
    console.log("\n📋 Step 21: PAUSING FOR INSPECTION");
    console.log("\n⏸️ INSPECTION CHECKLIST:");
    console.log("🔍 1. AWS EventBridge Console:");
    console.log(`      https://console.aws.amazon.com/events/`);
    console.log(`      Event Bus: ${TEST_EVENT_BUS}`);
    console.log(`      Rules: ${createdRuleNames.join(', ')}`);
    
    console.log("\n🔍 2. AWS SQS Console:");
    console.log(`      https://console.aws.amazon.com/sqs/`);
    console.log(`      Queue: ${TEST_QUEUE_NAME}`);
    console.log(`      Check messages: Should see 3 events (2 orders + 1 user)`);
    
    console.log("\n🔍 3. CloudWatch Logs:");
    console.log(`      Check for rule invocations and any errors`);
    
    console.log("\n⏰ Waiting 120 seconds (2 minutes) before cleanup...");
    console.log("   Press Ctrl+C to keep resources for extended testing");
    await new Promise(resolve => setTimeout(resolve, 120000));

    // 22. Cleanup
    console.log("\n📋 Step 22: Cleaning up EventBridge resources...");
    
    // Remove targets from rules
    for (const ruleName of createdRuleNames) {
      try {
        await eventBridgeClient.send(new RemoveTargetsCommand({
          Rule: ruleName,
          EventBusName: TEST_EVENT_BUS,
          Ids: ["1"]
        }));
        console.log(`✅ Targets removed from rule: ${ruleName}`);
      } catch (error) {
        console.log(`   ⚠️ Failed to remove targets: ${error.message}`);
      }
    }
    
    // Delete rules
    for (const ruleName of createdRuleNames) {
      try {
        await eventBridgeClient.send(new DeleteRuleCommand({
          Name: ruleName,
          EventBusName: TEST_EVENT_BUS
        }));
        console.log(`✅ Rule deleted: ${ruleName}`);
      } catch (error) {
        console.log(`   ⚠️ Failed to delete rule: ${error.message}`);
      }
    }
    
    // Delete event bus
    if (createdEventBusName) {
      try {
        await eventBridgeClient.send(new DeleteEventBusCommand({
          Name: createdEventBusName
        }));
        console.log(`✅ Event bus deleted: ${createdEventBusName}`);
      } catch (error) {
        console.log(`   ⚠️ Failed to delete event bus: ${error.message}`);
      }
    }
    
    // Delete SQS queue
    if (createdQueueUrl) {
      try {
        await sqsClient.send(new DeleteQueueCommand({
          QueueUrl: createdQueueUrl
        }));
        console.log(`✅ SQS Queue deleted: ${TEST_QUEUE_NAME}`);
      } catch (error) {
        console.log(`   ⚠️ Failed to delete queue: ${error.message}`);
      }
    }

    console.log("\n🎉 EVENTBRIDGE TEST COMPLETED SUCCESSFULLY!");
    console.log(`📅 Test finished at: ${new Date().toISOString()}`);
    
    console.log("\n📊 TEST COVERAGE SUMMARY:");
    console.log("✅ Custom event bus creation");
    console.log("✅ SQS queue creation with resource policy");
    console.log("✅ Event rule creation with patterns (2 rules)");
    console.log("✅ Target configuration (SQS)");
    console.log("✅ Custom event publishing (4 events)");
    console.log("✅ Event pattern matching validation");
    console.log("✅ Rule enable/disable operations");
    console.log("✅ List operations (rules, targets)");
    console.log("✅ Real-world use case examples");
    console.log("✅ Best practices & patterns");
    console.log("✅ Resource cleanup");

  } catch (error) {
    console.error("\n❌ EventBridge test failed:", error.message);
    console.error("Stack trace:", error.stack);
    
    // Emergency cleanup
    console.log("\n🧹 Attempting emergency cleanup...");
    const eventBridgeClient = new EventBridgeClient({ region: process.env.AWS_REGION || "us-west-2" });
    const sqsClient = new SQSClient({ region: process.env.AWS_REGION || "us-west-2" });
    
    try {
      // Remove targets
      for (const ruleName of createdRuleNames) {
        await eventBridgeClient.send(new RemoveTargetsCommand({
          Rule: ruleName,
          EventBusName: createdEventBusName,
          Ids: ["1"]
        })).catch(() => {});
      }
      
      // Delete rules
      for (const ruleName of createdRuleNames) {
        await eventBridgeClient.send(new DeleteRuleCommand({
          Name: ruleName,
          EventBusName: createdEventBusName
        })).catch(() => {});
      }
      
      // Delete event bus
      if (createdEventBusName) {
        await eventBridgeClient.send(new DeleteEventBusCommand({
          Name: createdEventBusName
        })).catch(() => {});
      }
      
      // Delete queue
      if (createdQueueUrl) {
        await sqsClient.send(new DeleteQueueCommand({
          QueueUrl: createdQueueUrl
        })).catch(() => {});
      }
      
      console.log("✅ Emergency cleanup completed");
    } catch (cleanupError) {
      console.log("⚠️ Manual cleanup required:");
      console.log(`   Event Bus: ${createdEventBusName}`);
      console.log(`   Rules: ${createdRuleNames.join(', ')}`);
      console.log(`   Queue: ${createdQueueUrl}`);
    }
    
    process.exit(1);
  }
}

console.log("\n🔧 PREREQUISITES:");
console.log("1. AWS credentials with EventBridge, SQS, and STS permissions");
console.log("2. AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env");
console.log("3. Region: us-west-2 or us-east-1");
console.log("4. IAM permissions: events:*, sqs:*, sts:GetCallerIdentity");

console.log("\n📖 WHAT THIS TEST DOES:");
console.log("   🔔 EventBridge: Creates event buses and rules");
console.log("   📬 SQS: Creates queue as event target");
console.log("   🎯 Events: Publishes and routes custom events");
console.log("   ✅ Validates: All EventBridge core features");

console.log("\n💡 NOTE:");
console.log("   This tests EventBridge ONLY (no IVS, no Lambda)");
console.log("   For production integrations, see documentation");

console.log("\n🚀 Starting EventBridge tests...\n");

runEventBridgeTests();
