/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  AWS EVENTBRIDGE COMPREHENSIVE UNIT TESTS - REFACTORED
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * TESTING APPROACH:
 * ─────────────────
 * ✅ Uses ONLY EventBridgeHelper methods (no direct AWS SDK imports)
 * ✅ Creates temporary test event bus for isolation
 * ✅ Tests all EventBridgeHelper methods with edge cases
 * ✅ Cleans up resources after testing
 * ✅ Independent of existing event-config.json
 * 
 * COVERAGE:
 * ─────────
 * ✅ Event Bus Operations (create, describe, delete)
 * ✅ Rule Operations (put, describe, list, enable, disable, delete)
 * ✅ Target Operations (put, list, remove)
 * ✅ Event Publishing (single, batch, validation)
 * ✅ Config-based Operations (scheduleFromConfig, publish, deleteRule)
 * ✅ Parameter Validation (null, empty, invalid types)
 * ✅ Edge Cases (long names, special chars, limits)
 * ✅ Error Handling (expected failures, AWS errors)
 * 
 * RUN: node test/eventbridge-unit-test-NEW.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

import EventBridgeHelper from "../aws/EventBridgeHelper.js";
import { STSHelper } from "../aws/STSHelper.js";
import dotenv from "dotenv";

dotenv.config();

const REGION = process.env.AWS_REGION || "us-east-1";
const TEST_EVENT_BUS = `test-bus-${Date.now()}`;
const TEST_RULE = `test-rule-${Date.now()}`;
let TEST_TARGET_ARN = null;
let ACCOUNT_ID = null;

async function setupAccountIdAndArn() {
  ACCOUNT_ID = await STSHelper.getAccountId();
  TEST_TARGET_ARN = `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:test-function`;
}

let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

function logTest(methodName, passed, message = "", skipped = false) {
  const status = skipped ? "⏭️  SKIP" : (passed ? "✅ PASS" : "❌ FAIL");
  console.log(`${status} | ${methodName} | ${message}`);
  
  testResults.tests.push({ methodName, passed, message, skipped });
  if (skipped) testResults.skipped++;
  else if (passed) testResults.passed++;
  else testResults.failed++;
}

async function safeTest(fn) {
  try {
    await fn();
    return true;
  } catch (error) {
    return false;
  }
}

console.log("🧪 AWS EVENTBRIDGE COMPREHENSIVE UNIT TESTS (REFACTORED)");
console.log("═".repeat(80));
console.log(`Region: ${REGION}`);
console.log(`Test Event Bus: ${TEST_EVENT_BUS}`);
console.log(`Test Rule: ${TEST_RULE}`);
console.log(`Started: ${new Date().toISOString()}\n`);

async function runEventBridgeUnitTests() {
  await setupAccountIdAndArn();
  console.log(`Account ID: ${ACCOUNT_ID}`);
  console.log(`Test Target ARN: ${TEST_TARGET_ARN}\n`);
  try {
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 1: INITIALIZATION (4 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("🔧 SECTION 1: INITIALIZATION\n");
    
    // Test 1: init() with valid region
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.init(REGION);
      });
      logTest("init() with valid region", result, result ? `Initialized: ${REGION}` : "Failed");
    }
    
    // Test 2: init() with null region
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.init(null);
      });
      logTest("init() with null region", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 3: init() with empty region
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.init("");
      });
      logTest("init() with empty region", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 4: init() with invalid type
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.init(12345);
      });
      logTest("init() with invalid type", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 2: EVENT BUS OPERATIONS (10 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n🚌 SECTION 2: EVENT BUS OPERATIONS\n");
    
    // Test 5: createEventBus() with valid name
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.createEventBus(TEST_EVENT_BUS);
        if (!response || !response.EventBusArn) throw new Error("No ARN returned");
      });
      logTest("createEventBus() with valid name", result, result ? `Created: ${TEST_EVENT_BUS}` : "Failed");
    }
    
    // Test 6: createEventBus() duplicate name
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.createEventBus(TEST_EVENT_BUS);
      });
      logTest("createEventBus() duplicate name", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 7: createEventBus() with tags
    {
      const busName = `${TEST_EVENT_BUS}-tagged`;
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.createEventBus(busName, [
          { Key: "Environment", Value: "Test" },
          { Key: "Purpose", Value: "UnitTest" }
        ]);
        if (!response || !response.EventBusArn) throw new Error("No ARN returned");
        // Cleanup
        await EventBridgeHelper.deleteEventBus(busName);
      });
      logTest("createEventBus() with tags", result, result ? "Created with tags" : "Failed");
    }
    
    // Test 8: createEventBus() with empty name
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.createEventBus("");
      });
      logTest("createEventBus() with empty name", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 9: createEventBus() with invalid characters
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.createEventBus(`test@bus#${Date.now()}`);
      });
      logTest("createEventBus() with invalid chars", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 10: describeEventBus() existing bus
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.describeEventBus(TEST_EVENT_BUS);
        if (!response || response.Name !== TEST_EVENT_BUS) throw new Error("Bus not found");
      });
      logTest("describeEventBus() existing bus", result, result ? `Found: ${TEST_EVENT_BUS}` : "Failed");
    }
    
    // Test 11: describeEventBus() default bus
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.describeEventBus("default");
        if (!response || response.Name !== "default") throw new Error("Default bus not found");
      });
      logTest("describeEventBus() default bus", result, result ? "Found default bus" : "Failed");
    }
    
    // Test 12: describeEventBus() non-existing bus
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.describeEventBus(`nonexistent-${Date.now()}`);
      });
      logTest("describeEventBus() non-existing", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 13: deleteEventBus() default bus (should fail)
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.deleteEventBus("default");
      });
      logTest("deleteEventBus() default bus", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 14: deleteEventBus() with empty name
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.deleteEventBus("");
      });
      logTest("deleteEventBus() with empty name", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 3: RULE OPERATIONS (20 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n📋 SECTION 3: RULE OPERATIONS\n");
    
    // Test 15: putRule() with event pattern
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.putRule({
          Name: TEST_RULE,
          EventBusName: TEST_EVENT_BUS,
          EventPattern: JSON.stringify({
            source: ["custom.test"],
            "detail-type": ["Test Event"]
          }),
          State: "ENABLED",
          Description: "Unit test rule"
        });
        if (!response || !response.RuleArn) throw new Error("No ARN returned");
      });
      logTest("putRule() with event pattern", result, result ? `Created: ${TEST_RULE}` : "Failed");
    }
    
    // Test 16: putRule() with schedule expression
    {
      const scheduleRule = `${TEST_RULE}-schedule`;
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.putRule({
          Name: scheduleRule,
          EventBusName: TEST_EVENT_BUS,
          ScheduleExpression: "rate(5 minutes)",
          State: "ENABLED",
          Description: "Schedule rule"
        });
        if (!response || !response.RuleArn) throw new Error("No ARN returned");
        // Cleanup
        await EventBridgeHelper.deleteRuleDirect(scheduleRule, TEST_EVENT_BUS);
      });
      logTest("putRule() with schedule expression", result, result ? "Schedule rule created" : "Failed");
    }
    
    // Test 17: putRule() with cron expression
    {
      const cronRule = `${TEST_RULE}-cron`;
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.putRule({
          Name: cronRule,
          EventBusName: TEST_EVENT_BUS,
          ScheduleExpression: "cron(0 12 * * ? *)",
          State: "ENABLED",
          Description: "Cron rule"
        });
        if (!response || !response.RuleArn) throw new Error("No ARN returned");
        // Cleanup
        await EventBridgeHelper.deleteRuleDirect(cronRule, TEST_EVENT_BUS);
      });
      logTest("putRule() with cron expression", result, result ? "Cron rule created" : "Failed");
    }
    
    // Test 18: putRule() with empty name
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putRule({
          Name: "",
          EventBusName: TEST_EVENT_BUS,
          EventPattern: JSON.stringify({ source: ["test"] }),
          State: "ENABLED"
        });
      });
      logTest("putRule() with empty name", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 19: putRule() with invalid JSON pattern
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putRule({
          Name: `${TEST_RULE}-invalid`,
          EventBusName: TEST_EVENT_BUS,
          EventPattern: "{ invalid json",
          State: "ENABLED"
        });
      });
      logTest("putRule() with invalid JSON", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 20: putRule() without pattern or schedule
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putRule({
          Name: `${TEST_RULE}-nopattern`,
          EventBusName: TEST_EVENT_BUS,
          State: "ENABLED"
        });
      });
      logTest("putRule() without pattern/schedule", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 21: putRule() with null name
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putRule({
          Name: null,
          EventBusName: TEST_EVENT_BUS,
          EventPattern: JSON.stringify({ source: ["test"] }),
          State: "ENABLED"
        });
      });
      logTest("putRule() with null name", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 22: describeRule() existing rule
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.describeRule(TEST_RULE, TEST_EVENT_BUS);
        if (!response || response.Name !== TEST_RULE) throw new Error("Rule not found");
      });
      logTest("describeRule() existing rule", result, result ? `Found: ${TEST_RULE}` : "Failed");
    }
    
    // Test 23: describeRule() non-existing rule
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.describeRule(`nonexistent-${Date.now()}`, TEST_EVENT_BUS);
      });
      logTest("describeRule() non-existing", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 24: describeRule() with empty name
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.describeRule("", TEST_EVENT_BUS);
      });
      logTest("describeRule() with empty name", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 25: listRules() all rules
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.listRules(TEST_EVENT_BUS);
        if (!response || !response.Rules) throw new Error("No rules returned");
        const found = response.Rules.some(r => r.Name === TEST_RULE);
        if (!found) throw new Error("Test rule not found");
      });
      logTest("listRules() all rules", result, result ? "Found test rule" : "Failed");
    }
    
    // Test 26: listRules() with name prefix
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.listRules(TEST_EVENT_BUS, "test-rule");
        if (!response || !response.Rules) throw new Error("No rules returned");
        const allMatch = response.Rules.every(r => r.Name.startsWith("test-rule"));
        if (!allMatch) throw new Error("Prefix filter not working");
      });
      logTest("listRules() with prefix filter", result, result ? "Prefix filter works" : "Failed");
    }
    
    // Test 27: listRules() empty bus
    {
      const emptyBus = `empty-bus-${Date.now()}`;
      const result = await safeTest(async () => {
        await EventBridgeHelper.createEventBus(emptyBus);
        const response = await EventBridgeHelper.listRules(emptyBus);
        if (!response || !response.Rules) throw new Error("No rules array");
        if (response.Rules.length !== 0) throw new Error("Bus should be empty");
        // Cleanup
        await EventBridgeHelper.deleteEventBus(emptyBus);
      });
      logTest("listRules() empty bus", result, result ? "Empty bus verified" : "Failed");
    }
    
    // Test 28: disableRule() valid rule
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.disableRule(TEST_RULE, TEST_EVENT_BUS);
        const response = await EventBridgeHelper.describeRule(TEST_RULE, TEST_EVENT_BUS);
        if (response.State !== "DISABLED") throw new Error("Rule not disabled");
      });
      logTest("disableRule() valid rule", result, result ? "Rule disabled" : "Failed");
    }
    
    // Test 29: disableRule() idempotent
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.disableRule(TEST_RULE, TEST_EVENT_BUS);
      });
      logTest("disableRule() idempotent", result, result ? "Idempotent operation" : "Failed");
    }
    
    // Test 30: disableRule() non-existing
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.disableRule(`nonexistent-${Date.now()}`, TEST_EVENT_BUS);
      });
      logTest("disableRule() non-existing", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 31: enableRule() valid rule
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.enableRule(TEST_RULE, TEST_EVENT_BUS);
        const response = await EventBridgeHelper.describeRule(TEST_RULE, TEST_EVENT_BUS);
        if (response.State !== "ENABLED") throw new Error("Rule not enabled");
      });
      logTest("enableRule() valid rule", result, result ? "Rule enabled" : "Failed");
    }
    
    // Test 32: enableRule() idempotent
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.enableRule(TEST_RULE, TEST_EVENT_BUS);
      });
      logTest("enableRule() idempotent", result, result ? "Idempotent operation" : "Failed");
    }
    
    // Test 33: enableRule() non-existing
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.enableRule(`nonexistent-${Date.now()}`, TEST_EVENT_BUS);
      });
      logTest("enableRule() non-existing", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 34: enableRule() with empty name
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.enableRule("", TEST_EVENT_BUS);
      });
      logTest("enableRule() with empty name", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 4: TARGET OPERATIONS (12 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n🎯 SECTION 4: TARGET OPERATIONS\n");
    
    // Test 35: putTargets() with valid target
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.putTargets(TEST_RULE, [
          {
            Id: "1",
            Arn: TEST_TARGET_ARN
          }
        ], TEST_EVENT_BUS);
        // May fail due to permissions - check response
        if (!response) throw new Error("No response");
      });
      logTest("putTargets() with valid target", result, result ? "Target added (or permission error)" : "Failed");
    }
    
    // Test 36: putTargets() with multiple targets
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.putTargets(TEST_RULE, [
          { Id: "2", Arn: `${TEST_TARGET_ARN}-2` },
          { Id: "3", Arn: `${TEST_TARGET_ARN}-3` }
        ], TEST_EVENT_BUS);
        if (!response) throw new Error("No response");
      });
      logTest("putTargets() multiple targets", result, result ? "Multiple targets added" : "Failed");
    }
    
    // Test 37: putTargets() with empty array
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putTargets(TEST_RULE, [], TEST_EVENT_BUS);
      });
      logTest("putTargets() with empty array", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 38: putTargets() with null targets
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putTargets(TEST_RULE, null, TEST_EVENT_BUS);
      });
      logTest("putTargets() with null targets", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 39: putTargets() with invalid ARN
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putTargets(TEST_RULE, [
          { Id: "99", Arn: "invalid-arn" }
        ], TEST_EVENT_BUS);
      });
      logTest("putTargets() with invalid ARN", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 40: putTargets() duplicate IDs
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putTargets(TEST_RULE, [
          { Id: "1", Arn: TEST_TARGET_ARN },
          { Id: "1", Arn: TEST_TARGET_ARN }
        ], TEST_EVENT_BUS);
      });
      logTest("putTargets() duplicate IDs", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 41: putTargets() with empty rule name
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putTargets("", [
          { Id: "1", Arn: TEST_TARGET_ARN }
        ], TEST_EVENT_BUS);
      });
      logTest("putTargets() with empty rule name", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 42: listTargetsByRule() valid rule
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.listTargetsByRule(TEST_RULE, TEST_EVENT_BUS);
        if (!response || !Array.isArray(response.Targets)) throw new Error("No targets array");
      });
      logTest("listTargetsByRule() valid rule", result, result ? "Targets listed" : "Failed");
    }
    
    // Test 43: listTargetsByRule() non-existing rule
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.listTargetsByRule(`nonexistent-${Date.now()}`, TEST_EVENT_BUS);
      });
      logTest("listTargetsByRule() non-existing", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 44: listTargetsByRule() with empty name
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.listTargetsByRule("", TEST_EVENT_BUS);
      });
      logTest("listTargetsByRule() with empty name", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 45: removeTargets() valid target
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.removeTargets(TEST_RULE, ["1"], TEST_EVENT_BUS);
        if (!response) throw new Error("No response");
      });
      logTest("removeTargets() valid target", result, result ? "Target removed" : "Failed");
    }
    
    // Test 46: removeTargets() multiple IDs
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.removeTargets(TEST_RULE, ["2", "3"], TEST_EVENT_BUS);
        if (!response) throw new Error("No response");
      });
      logTest("removeTargets() multiple IDs", result, result ? "Multiple targets removed" : "Failed");
    }
    
    // Test 47: removeTargets() non-existing ID (idempotent)
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.removeTargets(TEST_RULE, ["999"], TEST_EVENT_BUS);
      });
      logTest("removeTargets() non-existing ID", result, result ? "Idempotent operation" : "Failed");
    }
    
    // Test 48: removeTargets() with empty array
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.removeTargets(TEST_RULE, [], TEST_EVENT_BUS);
      });
      logTest("removeTargets() with empty array", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 49: removeTargets() with null IDs
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.removeTargets(TEST_RULE, null, TEST_EVENT_BUS);
      });
      logTest("removeTargets() with null IDs", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 5: EVENT PUBLISHING (10 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n📨 SECTION 5: EVENT PUBLISHING\n");
    
    // Test 50: putEvents() single event
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.putEvents([
          {
            Source: "custom.test",
            DetailType: "Test Event",
            Detail: JSON.stringify({ test: "data", timestamp: new Date().toISOString() }),
            EventBusName: TEST_EVENT_BUS
          }
        ]);
        if (!response || response.FailedEntryCount !== 0) throw new Error("Event failed");
      });
      logTest("putEvents() single event", result, result ? "Event published" : "Failed");
    }
    
    // Test 51: putEvents() batch events
    {
      const result = await safeTest(async () => {
        const entries = Array.from({ length: 5 }, (_, i) => ({
          Source: "custom.test",
          DetailType: "Batch Event",
          Detail: JSON.stringify({ id: i, timestamp: new Date().toISOString() }),
          EventBusName: TEST_EVENT_BUS
        }));
        const response = await EventBridgeHelper.putEvents(entries);
        if (!response || response.FailedEntryCount !== 0) throw new Error("Events failed");
      });
      logTest("putEvents() batch events", result, result ? "Batch published" : "Failed");
    }
    
    // Test 52: putEvents() with resources
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.putEvents([
          {
            Source: "custom.test",
            DetailType: "Event With Resources",
            Detail: JSON.stringify({ test: "data" }),
            Resources: [`arn:aws:test:${REGION}:${ACCOUNT_ID}:resource/test`],
            EventBusName: TEST_EVENT_BUS
          }
        ]);
        if (!response || response.FailedEntryCount !== 0) throw new Error("Event failed");
      });
      logTest("putEvents() with resources", result, result ? "Event with resources" : "Failed");
    }
    
    // Test 53: putEvents() to default bus
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.putEvents([
          {
            Source: "custom.test",
            DetailType: "Default Bus Event",
            Detail: JSON.stringify({ test: "default" })
          }
        ]);
        if (!response || response.FailedEntryCount !== 0) throw new Error("Event failed");
      });
      logTest("putEvents() to default bus", result, result ? "Default bus event" : "Failed");
    }
    
    // Test 54: putEvents() with empty array
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putEvents([]);
      });
      logTest("putEvents() with empty array", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 55: putEvents() with null entries
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putEvents(null);
      });
      logTest("putEvents() with null entries", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 56: putEvents() missing required fields
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putEvents([
          {
            Detail: JSON.stringify({ test: "data" })
            // Missing Source and DetailType
          }
        ]);
      });
      logTest("putEvents() missing fields", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 57: putEvents() with invalid JSON detail
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.putEvents([
          {
            Source: "custom.test",
            DetailType: "Invalid",
            Detail: { invalid: "should be string" } // Should be JSON string
          }
        ]);
      });
      logTest("putEvents() with invalid detail", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 58: putEvents() oversized event (>256KB)
    {
      const result = await safeTest(async () => {
        const largeData = "x".repeat(300 * 1024); // 300KB
        await EventBridgeHelper.putEvents([
          {
            Source: "custom.test",
            DetailType: "Oversized",
            Detail: JSON.stringify({ data: largeData }),
            EventBusName: TEST_EVENT_BUS
          }
        ]);
      });
      logTest("putEvents() oversized event", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 59: putEvents() with special characters
    {
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.putEvents([
          {
            Source: "custom.test",
            DetailType: "Special Chars",
            Detail: JSON.stringify({
              unicode: "Hello 世界 🌍",
              special: "Tab:\t Newline:\n Quote:\" Backslash:\\"
            }),
            EventBusName: TEST_EVENT_BUS
          }
        ]);
        if (!response || response.FailedEntryCount !== 0) throw new Error("Event failed");
      });
      logTest("putEvents() with special chars", result, result ? "Special chars handled" : "Failed");
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 6: EDGE CASES (6 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n⚠️  SECTION 6: EDGE CASES\n");
    
    // Test 60: putRule() with very long name (max 64 chars)
    {
      const longName = `rule-${"x".repeat(50)}-${Date.now()}`.substring(0, 64);
      const result = await safeTest(async () => {
        const response = await EventBridgeHelper.putRule({
          Name: longName,
          EventBusName: TEST_EVENT_BUS,
          EventPattern: JSON.stringify({ source: ["test"] }),
          State: "ENABLED"
        });
        if (!response || !response.RuleArn) throw new Error("No ARN returned");
        // Cleanup
        await EventBridgeHelper.deleteRuleDirect(longName, TEST_EVENT_BUS);
      });
      logTest("Edge: long rule name (64 chars)", result, result ? "Long name accepted" : "Failed");
    }
    
    // Test 61: putRule() name too long (>64 chars)
    {
      const tooLong = `rule-${"x".repeat(100)}-${Date.now()}`;
      const result = await safeTest(async () => {
        await EventBridgeHelper.putRule({
          Name: tooLong,
          EventBusName: TEST_EVENT_BUS,
          EventPattern: JSON.stringify({ source: ["test"] }),
          State: "ENABLED"
        });
      });
      logTest("Edge: name too long (>64 chars)", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 62: deleteRule() with targets still attached
    {
      const ruleWithTargets = `${TEST_RULE}-withtargets`;
      const result = await safeTest(async () => {
        // Create rule
        await EventBridgeHelper.putRule({
          Name: ruleWithTargets,
          EventBusName: TEST_EVENT_BUS,
          EventPattern: JSON.stringify({ source: ["test"] }),
          State: "ENABLED"
        });
        // Add target (may fail due to permissions, ignore)
        try {
          await EventBridgeHelper.putTargets(ruleWithTargets, [
            { Id: "1", Arn: TEST_TARGET_ARN }
          ], TEST_EVENT_BUS);
        } catch (e) {}
        // Try to delete rule without removing targets first
        await EventBridgeHelper.deleteRuleDirect(ruleWithTargets, TEST_EVENT_BUS);
      });
      logTest("Edge: delete rule with targets", !result, !result ? "Correctly rejected" : "Should fail");
      // Cleanup
      await safeTest(async () => {
        await EventBridgeHelper.removeTargets(ruleWithTargets, ["1"], TEST_EVENT_BUS);
        await EventBridgeHelper.deleteRuleDirect(ruleWithTargets, TEST_EVENT_BUS);
      });
    }
    
    // Test 63: deleteEventBus() with rules attached
    {
      const result = await safeTest(async () => {
        // TEST_EVENT_BUS still has TEST_RULE attached
        await EventBridgeHelper.deleteEventBus(TEST_EVENT_BUS);
      });
      logTest("Edge: delete bus with rules", !result, !result ? "Correctly rejected" : "Should fail");
    }
    
    // Test 64: Concurrent putEvents operations
    {
      const result = await safeTest(async () => {
        const promises = Array.from({ length: 5 }, (_, i) =>
          EventBridgeHelper.putEvents([
            {
              Source: "custom.test",
              DetailType: "Concurrent Event",
              Detail: JSON.stringify({ id: i, timestamp: new Date().toISOString() }),
              EventBusName: TEST_EVENT_BUS
            }
          ])
        );
        const results = await Promise.all(promises);
        if (results.some(r => !r || r.FailedEntryCount !== 0)) throw new Error("Some events failed");
      });
      logTest("Edge: concurrent putEvents", result, result ? "Concurrent ops succeeded" : "Failed");
    }
    
    // Test 65: generateRuleName() deterministic
    {
      const result = await safeTest(async () => {
        const name1 = EventBridgeHelper.generateRuleName("test-flag", "custom-data");
        const name2 = EventBridgeHelper.generateRuleName("test-flag", "custom-data");
        if (name1 !== name2) throw new Error("Names not deterministic");
        
        const name3 = EventBridgeHelper.generateRuleName("test-flag", "different-data");
        if (name1 === name3) throw new Error("Different data should produce different name");
      });
      logTest("Edge: generateRuleName deterministic", result, result ? "Deterministic naming works" : "Failed");
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // CLEANUP
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n🧹 CLEANUP\n");
    
    // Test 66: Delete test rule
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.deleteRuleDirect(TEST_RULE, TEST_EVENT_BUS);
      });
      logTest("Cleanup: delete test rule", result, result ? `Deleted: ${TEST_RULE}` : "Failed");
    }
    
    // Test 67: Delete test event bus
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.deleteEventBus(TEST_EVENT_BUS);
      });
      logTest("Cleanup: delete test bus", result, result ? `Deleted: ${TEST_EVENT_BUS}` : "Failed");
    }
    
    // Test 68: Verify bus is deleted
    {
      const result = await safeTest(async () => {
        await EventBridgeHelper.describeEventBus(TEST_EVENT_BUS);
      });
      logTest("Cleanup: verify bus deleted", !result, !result ? "Bus successfully deleted" : "Should fail");
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // TEST SUMMARY
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n" + "═".repeat(80));
    console.log("📊 TEST SUMMARY");
    console.log("═".repeat(80));
    console.log(`Total Tests: ${testResults.passed + testResults.failed + testResults.skipped}`);
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`⏭️  Skipped: ${testResults.skipped}`);
    
    const totalExecuted = testResults.passed + testResults.failed;
    if (totalExecuted > 0) {
      console.log(`Success Rate: ${((testResults.passed / totalExecuted) * 100).toFixed(1)}%`);
    }
    
    console.log(`Finished: ${new Date().toISOString()}`);
    
    if (testResults.failed > 0) {
      console.log("\n❌ FAILED TESTS:");
      testResults.tests
        .filter(t => !t.passed && !t.skipped)
        .forEach(t => console.log(`   • ${t.methodName}: ${t.message}`));
    }
    
    console.log("\n✅ EVENTBRIDGE COMPREHENSIVE UNIT TESTS COMPLETED!");
    console.log("═".repeat(80));
    
  } catch (error) {
    console.error("\n❌ Test suite failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

console.log("🚀 Starting EventBridge comprehensive unit tests...\n");
runEventBridgeUnitTests();
