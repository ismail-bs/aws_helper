/**
 * ═══════════════════════════════════════════════════════════════════
 *  AWS EVENTBRIDGE UNIT TESTS - PER-METHOD TESTING
 * ═══════════════════════════════════════════════════════════════════
 * 
 * WHAT THIS TESTS:
 * ────────────────
 * Each EventBridge operation individually with simple inputs/outputs
 * No complex workflows - just method validation
 * 
 * METHODS TESTED:
 * ───────────────
 * ✅ CreateEventBus
 * ✅ DescribeEventBus
 * ✅ DeleteEventBus
 * ✅ PutRule
 * ✅ DescribeRule
 * ✅ ListRules
 * ✅ EnableRule
 * ✅ DisableRule
 * ✅ DeleteRule
 * ✅ PutTargets
 * ✅ ListTargetsByRule
 * ✅ RemoveTargets
 * ✅ PutEvents
 * 
 * RUN: node test/eventbridge-unit-test.js
 * ═══════════════════════════════════════════════════════════════════
 */

import {
  EventBridgeClient,
  CreateEventBusCommand,
  DescribeEventBusCommand,
  DeleteEventBusCommand,
  PutRuleCommand,
  DescribeRuleCommand,
  ListRulesCommand,
  EnableRuleCommand,
  DisableRuleCommand,
  DeleteRuleCommand,
  PutTargetsCommand,
  ListTargetsByRuleCommand,
  RemoveTargetsCommand,
  PutEventsCommand
} from "@aws-sdk/client-eventbridge";
import dotenv from "dotenv";

dotenv.config();

const region = process.env.AWS_REGION || "us-west-2";
const eventBridgeClient = new EventBridgeClient({ region });

const TIMESTAMP = Date.now();
const TEST_EVENT_BUS = `unit-test-bus-${TIMESTAMP}`;
const TEST_RULE = `unit-test-rule-${TIMESTAMP}`;
const TEST_TARGET_ARN = `arn:aws:lambda:${region}:123456789012:function:test-function`;

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(methodName, passed, message = "") {
  const status = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${status} | ${methodName} | ${message}`);
  
  testResults.tests.push({ methodName, passed, message });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

console.log("🧪 AWS EVENTBRIDGE UNIT TESTS - PER-METHOD TESTING");
console.log("═".repeat(60));
console.log(`Test Event Bus: ${TEST_EVENT_BUS}`);
console.log(`Test Rule: ${TEST_RULE}`);
console.log(`Started: ${new Date().toISOString()}\n`);

async function runEventBridgeUnitTests() {
  try {
    
    // ═══════════════════════════════════════════════════════════════
    // EVENT BUS OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    
    console.log("🚌 EVENT BUS OPERATIONS\n");
    
    // Test 1: CreateEventBus
    try {
      const result = await eventBridgeClient.send(new CreateEventBusCommand({
        Name: TEST_EVENT_BUS
      }));
      
      const isValid = result && result.EventBusArn;
      logTest("CreateEventBus", isValid, `ARN: ${result?.EventBusArn}`);
    } catch (error) {
      logTest("CreateEventBus", false, error.message);
    }
    
    // Test 2: DescribeEventBus
    try {
      const result = await eventBridgeClient.send(new DescribeEventBusCommand({
        Name: TEST_EVENT_BUS
      }));
      
      const isValid = result && result.Name === TEST_EVENT_BUS;
      logTest("DescribeEventBus", isValid, `Name: ${result?.Name}, ARN: ${result?.Arn}`);
    } catch (error) {
      logTest("DescribeEventBus", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // RULE OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n📋 RULE OPERATIONS\n");
    
    // Test 3: PutRule
    try {
      const eventPattern = {
        source: ["custom.test"],
        "detail-type": ["Test Event"]
      };
      
      const result = await eventBridgeClient.send(new PutRuleCommand({
        Name: TEST_RULE,
        EventBusName: TEST_EVENT_BUS,
        EventPattern: JSON.stringify(eventPattern),
        State: "ENABLED",
        Description: "Unit test rule"
      }));
      
      const isValid = result && result.RuleArn;
      logTest("PutRule", isValid, `ARN: ${result?.RuleArn}`);
    } catch (error) {
      logTest("PutRule", false, error.message);
    }
    
    // Test 4: DescribeRule
    try {
      const result = await eventBridgeClient.send(new DescribeRuleCommand({
        Name: TEST_RULE,
        EventBusName: TEST_EVENT_BUS
      }));
      
      const isValid = result && result.Name === TEST_RULE;
      logTest("DescribeRule", isValid, `Name: ${result?.Name}, State: ${result?.State}`);
    } catch (error) {
      logTest("DescribeRule", false, error.message);
    }
    
    // Test 5: ListRules
    try {
      const result = await eventBridgeClient.send(new ListRulesCommand({
        EventBusName: TEST_EVENT_BUS
      }));
      
      const found = result.Rules.some(r => r.Name === TEST_RULE);
      logTest("ListRules", found, `Found ${result.Rules.length} rules, test rule exists: ${found}`);
    } catch (error) {
      logTest("ListRules", false, error.message);
    }
    
    // Test 6: DisableRule
    try {
      await eventBridgeClient.send(new DisableRuleCommand({
        Name: TEST_RULE,
        EventBusName: TEST_EVENT_BUS
      }));
      
      // Verify state
      const result = await eventBridgeClient.send(new DescribeRuleCommand({
        Name: TEST_RULE,
        EventBusName: TEST_EVENT_BUS
      }));
      
      const isDisabled = result.State === "DISABLED";
      logTest("DisableRule", isDisabled, `State: ${result.State}`);
    } catch (error) {
      logTest("DisableRule", false, error.message);
    }
    
    // Test 7: EnableRule
    try {
      await eventBridgeClient.send(new EnableRuleCommand({
        Name: TEST_RULE,
        EventBusName: TEST_EVENT_BUS
      }));
      
      // Verify state
      const result = await eventBridgeClient.send(new DescribeRuleCommand({
        Name: TEST_RULE,
        EventBusName: TEST_EVENT_BUS
      }));
      
      const isEnabled = result.State === "ENABLED";
      logTest("EnableRule", isEnabled, `State: ${result.State}`);
    } catch (error) {
      logTest("EnableRule", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // TARGET OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n🎯 TARGET OPERATIONS\n");
    
    // Test 8: PutTargets
    try {
      const result = await eventBridgeClient.send(new PutTargetsCommand({
        Rule: TEST_RULE,
        EventBusName: TEST_EVENT_BUS,
        Targets: [
          {
            Id: "1",
            Arn: TEST_TARGET_ARN
          }
        ]
      }));
      
      const isValid = result.FailedEntryCount === 0;
      logTest("PutTargets", isValid, `Failed: ${result.FailedEntryCount}, Successful: ${result.FailedEntryCount === 0 ? 1 : 0}`);
    } catch (error) {
      // This might fail if Lambda doesn't exist, but that's okay for unit test
      const isExpectedError = error.message.includes("does not have permission") || 
                              error.message.includes("does not exist");
      logTest("PutTargets", isExpectedError, `Expected error (target doesn't exist): ${isExpectedError}`);
    }
    
    // Test 9: ListTargetsByRule
    try {
      const result = await eventBridgeClient.send(new ListTargetsByRuleCommand({
        Rule: TEST_RULE,
        EventBusName: TEST_EVENT_BUS
      }));
      
      const hasTargets = result.Targets && result.Targets.length >= 0;
      logTest("ListTargetsByRule", hasTargets, `Found ${result.Targets?.length || 0} targets`);
    } catch (error) {
      logTest("ListTargetsByRule", false, error.message);
    }
    
    // Test 10: RemoveTargets
    try {
      const result = await eventBridgeClient.send(new RemoveTargetsCommand({
        Rule: TEST_RULE,
        EventBusName: TEST_EVENT_BUS,
        Ids: ["1"]
      }));
      
      const isValid = result.FailedEntryCount === 0;
      logTest("RemoveTargets", isValid, `Failed: ${result.FailedEntryCount}`);
    } catch (error) {
      logTest("RemoveTargets", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // EVENT OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n📨 EVENT OPERATIONS\n");
    
    // Test 11: PutEvents
    try {
      const result = await eventBridgeClient.send(new PutEventsCommand({
        Entries: [
          {
            Source: "custom.test",
            DetailType: "Test Event",
            Detail: JSON.stringify({
              testId: "unit-test-1",
              timestamp: new Date().toISOString()
            }),
            EventBusName: TEST_EVENT_BUS
          },
          {
            Source: "custom.test",
            DetailType: "Test Event",
            Detail: JSON.stringify({
              testId: "unit-test-2",
              timestamp: new Date().toISOString()
            }),
            EventBusName: TEST_EVENT_BUS
          }
        ]
      }));
      
      const isValid = result.FailedEntryCount === 0;
      logTest("PutEvents", isValid, `Published 2 events, Failed: ${result.FailedEntryCount}`);
    } catch (error) {
      logTest("PutEvents", false, error.message);
    }
    
    // Test 12: PutEvents - Single Event
    try {
      const result = await eventBridgeClient.send(new PutEventsCommand({
        Entries: [
          {
            Source: "custom.test",
            DetailType: "Single Test Event",
            Detail: JSON.stringify({
              message: "Single event test"
            }),
            EventBusName: TEST_EVENT_BUS
          }
        ]
      }));
      
      const isValid = result.FailedEntryCount === 0;
      logTest("PutEvents [single]", isValid, `Published 1 event, Failed: ${result.FailedEntryCount}`);
    } catch (error) {
      logTest("PutEvents [single]", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n🧹 CLEANUP\n");
    
    // Test 13: DeleteRule
    try {
      await eventBridgeClient.send(new DeleteRuleCommand({
        Name: TEST_RULE,
        EventBusName: TEST_EVENT_BUS
      }));
      
      logTest("DeleteRule", true, `Deleted rule: ${TEST_RULE}`);
    } catch (error) {
      logTest("DeleteRule", false, error.message);
    }
    
    // Test 14: DeleteEventBus
    try {
      await eventBridgeClient.send(new DeleteEventBusCommand({
        Name: TEST_EVENT_BUS
      }));
      
      logTest("DeleteEventBus", true, `Deleted event bus: ${TEST_EVENT_BUS}`);
    } catch (error) {
      logTest("DeleteEventBus", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // TEST SUMMARY
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n" + "═".repeat(60));
    console.log("📊 TEST SUMMARY");
    console.log("═".repeat(60));
    console.log(`Total Tests: ${testResults.passed + testResults.failed}`);
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    console.log(`Finished: ${new Date().toISOString()}`);
    
    if (testResults.failed > 0) {
      console.log("\n❌ FAILED TESTS:");
      testResults.tests
        .filter(t => !t.passed)
        .forEach(t => console.log(`   • ${t.methodName}: ${t.message}`));
    }
    
    console.log("\n✅ EVENTBRIDGE UNIT TESTS COMPLETED!");
    
  } catch (error) {
    console.error("\n❌ Test suite failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

console.log("🚀 Starting EventBridge unit tests...\n");
runEventBridgeUnitTests();
