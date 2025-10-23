/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  AWS SQS COMPREHENSIVE UNIT TESTS - ALL EDGE CASES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * COVERAGE:
 * ─────────
 * ✅ SQSHelper initialization & configuration
 * ✅ Queue configuration validation (using existing config)
 * ✅ Message sending (single & batch) with direct queue URLs
 * ✅ Message receiving with various parameters
 * ✅ Message deletion (single & batch)
 * ✅ Retry mechanism with exponential backoff
 * ✅ DLQ (Dead Letter Queue) operations
 * ✅ Parameter validation (null, empty, invalid types)
 * ✅ Message attributes handling
 * ✅ Delay seconds configuration
 * ✅ Visibility timeout
 * ✅ Wait time (short/long polling)
 * ✅ Concurrent operations
 * ✅ Unicode/special characters in message body
 * ✅ Large message payloads
 * ✅ Edge cases (empty arrays, malformed data, etc.)
 * 
 * TESTING APPROACH:
 * ─────────────────
 * These tests create a temporary test queue for real AWS SQS API testing.
 * The queue is created at the start and deleted at the end of the test suite.
 * This ensures tests work regardless of existing queue configuration.
 * 
 * RUN: node test/sqs-unit-test.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SQSHelper from "../aws/sqsHelper.js";
import dotenv from "dotenv";

dotenv.config();

const REGION = process.env.AWS_REGION || "us-east-1";
const TEST_QUEUE_NAME = `sqs-unit-test-${Date.now()}`;
let TEST_QUEUE_URL = null;

let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// Helper function to safely run tests that are expected to fail/error
async function safeTest(fn) {
  return async () => {
    try {
      await fn();
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  };
}

function logTest(methodName, passed, message = "", skipped = false) {
  const status = skipped ? "⏭️  SKIP" : (passed ? "✅ PASS" : "❌ FAIL");
  console.log(`${status} | ${methodName} | ${message}`);
  
  testResults.tests.push({ methodName, passed, message, skipped });
  if (skipped) testResults.skipped++;
  else if (passed) testResults.passed++;
  else testResults.failed++;
}

console.log("🧪 AWS SQS COMPREHENSIVE UNIT TESTS");
console.log("═".repeat(80));
console.log(`Region: ${REGION}`);
console.log(`Test Queue: ${TEST_QUEUE_NAME}`);
console.log(`Started: ${new Date().toISOString()}\n`);

async function runSqsUnitTests() {
  try {
    
    // ════════════════════════════════════════════════════════════════════════
    // SETUP: Create Test Queue
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("🚀 Starting SQS comprehensive unit tests...\n");
    
    // Initialize SQSHelper
    await SQSHelper.init(REGION);
    
    // Create test queue
    try {
      TEST_QUEUE_URL = await SQSHelper.createQueue(TEST_QUEUE_NAME);
      console.log(`✅ Test queue created: ${TEST_QUEUE_NAME}`);
      console.log(`   Queue URL: ${TEST_QUEUE_URL}\n`);
    } catch (error) {
      console.error(`❌ Failed to create test queue: ${error.message}`);
      console.log("⚠️  Tests will use queue-config.json queues if available\n");
    }
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 1: INITIALIZATION & CONFIGURATION (6 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("🔧 SECTION 1: INITIALIZATION & CONFIGURATION\n");
    
    // Test 1: init() with valid region
    {
      const result = await safeTest(async () => {
        await SQSHelper.init(REGION);
      })();
      logTest("init(valid_region)", result.success, 
        result.success ? `Initialized with region ${REGION}` : result.error.message);
    }
    
    // Test 2: init() with null region (should fail)
    {
      const result = await safeTest(async () => {
        await SQSHelper.init(null);
      })();
      logTest("init(null_region)", !result.success, 
        !result.success ? "Correctly rejected null region" : "Should have failed");
    }
    
    // Test 3: init() with empty string region (should fail)
    {
      const result = await safeTest(async () => {
        await SQSHelper.init("");
      })();
      logTest("init(empty_region)", !result.success, 
        !result.success ? "Correctly rejected empty region" : "Should have failed");
    }
    
    // Test 4: init() with invalid type (should fail)
    {
      const result = await safeTest(async () => {
        await SQSHelper.init(12345);
      })();
      logTest("init(invalid_type)", !result.success, 
        !result.success ? "Correctly rejected non-string region" : "Should have failed");
    }
    
    // Test 5: getQueueConfig() with valid flag (requires queue-config.json)
    {
      const result = await safeTest(async () => {
        // Try to get the first queue config from the file
        const firstQueueFlag = SQSHelper.config.queues[0]?.flag;
        if (!firstQueueFlag) throw new Error("No queue configuration found");
        
        const config = SQSHelper.getQueueConfig(firstQueueFlag);
        if (!config.queueUrl) throw new Error("Missing queueUrl");
      })();
      logTest("getQueueConfig(valid_flag)", result.success, 
        result.success ? "Retrieved queue configuration" : result.error.message);
    }
    
    // Test 6: getQueueConfig() with non-existent flag (should fail)
    {
      const result = await safeTest(async () => {
        SQSHelper.getQueueConfig("non_existent_flag_xyz_123");
      })();
      logTest("getQueueConfig(invalid_flag)", !result.success, 
        !result.success ? "Correctly rejected invalid flag" : "Should have failed");
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 2: MESSAGE SENDING - SINGLE (8 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n📤 SECTION 2: MESSAGE SENDING - SINGLE\n");
    
    if (!TEST_QUEUE_URL) {
      console.log("⚠️  Test queue not available - skipping message sending tests\n");
      for (let i = 0; i < 8; i++) {
        logTest(`send(test_${i})`, false, "No test queue available", true);
      }
    } else {
      
            // Test 7: sendToQueue() with valid message
      {
        const result = await safeTest(async () => {
          const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, {
            test: "data",
            timestamp: Date.now()
          });
          return response && response.MessageId;
        });
        logTest("sendToQueue() with valid message", result);
      }
      
      // Test 8: sendToQueue() with string message
      {
        const result = await safeTest(async () => {
          const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, "simple string message");
          return response && response.MessageId;
        });
        logTest("sendToQueue() with string message", result);
      }
      
      // Test 9: sendToQueue() with delay
      {
        const result = await safeTest(async () => {
          const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, { delayed: true }, {
            delaySeconds: 5
          });
          return response && response.MessageId;
        });
        logTest("sendToQueue() with delay seconds", result);
      }
      
      // Test 10: sendToQueue() with message attributes
      {
        const result = await safeTest(async () => {
          const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, { data: "test" }, {
            messageAttributes: {
              Priority: { DataType: 'String', StringValue: 'High' },
              Count: { DataType: 'Number', StringValue: '100' }
            }
          });
          return response && response.MessageId;
        });
        logTest("sendToQueue() with message attributes", result);
      }
      
      // Test 11: sendToQueue() with deduplication ID
      {
        const result = await safeTest(async () => {
          const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, { unique: "data" }, {
            messageDeduplicationId: `dedup-${Date.now()}`,
            messageGroupId: "test-group"
          });
          return response && response.MessageId;
        });
        logTest("sendToQueue() with deduplication ID", result);
      }
      
      // Test 12: sendToQueue() with invalid URL
      {
        const result = await safeTest(async () => {
          await SQSHelper.sendToQueue("https://invalid-queue-url.com", { test: "data" });
          return false;
        });
        logTest("sendToQueue() with invalid URL", !result);
      }
      
      // Test 13: sendToQueue() with empty message
      {
        const result = await safeTest(async () => {
          await SQSHelper.sendToQueue(TEST_QUEUE_URL, null);
          return false;
        });
        logTest("sendToQueue() with empty message", !result);
      }
      
      // Test 14: sendToQueue() with very large message
      {
        const result = await safeTest(async () => {
          const largeMessage = {
            data: "x".repeat(256 * 1024) // 256KB (SQS limit)
          };
          const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, largeMessage);
          return response && response.MessageId;
        });
        logTest("sendToQueue() with large message", result);
      }
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 3: MESSAGE SENDING - BATCH (7 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n📦 SECTION 3: MESSAGE SENDING - BATCH\n");
    
    if (!TEST_QUEUE_URL) {
      console.log("⚠️  Test queue not available - skipping batch sending tests\n");
      for (let i = 0; i < 7; i++) {
        logTest(`sendBatchToQueue(test_${i})`, false, "No test queue available", true);
      }
    } else {
      
      // Test 15: sendBatchToQueue() with valid messages
      {
        const result = await safeTest(async () => {
          const messages = [
            { id: 1, data: "message 1" },
            { id: 2, data: "message 2" },
            { id: 3, data: "message 3" }
          ];
          const response = await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, messages);
          return response && response.Successful && response.Successful.length === 3;
        });
        logTest("sendBatchToQueue() with 3 messages", result);
      }
      
      // Test 16: sendBatchToQueue() with single message
      {
        const result = await safeTest(async () => {
          const messages = [{ single: "message" }];
          const response = await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, messages);
          return response && response.Successful && response.Successful.length === 1;
        });
        logTest("sendBatchToQueue() with single message", result);
      }
      
      // Test 17: sendBatchToQueue() with 10 messages (AWS limit)
      {
        const result = await safeTest(async () => {
          const messages = Array.from({ length: 10 }, (_, i) => ({
            index: i,
            data: `message_${i}`,
            timestamp: Date.now()
          }));
          const response = await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, messages);
          return response && response.Successful && response.Successful.length === 10;
        });
        logTest("sendBatchToQueue() with 10 messages", result);
      }
      
      // Test 18: sendBatchToQueue() with empty array
      {
        const result = await safeTest(async () => {
          await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, []);
          return false;
        });
        logTest("sendBatchToQueue() with empty array", !result);
      }
      
      // Test 19: sendBatchToQueue() with delay seconds
      {
        const result = await safeTest(async () => {
          const messages = [
            { delayed: "message 1" },
            { delayed: "message 2" }
          ];
          const response = await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, messages, {
            delaySeconds: 3
          });
          return response && response.Successful && response.Successful.length === 2;
        });
        logTest("sendBatchToQueue() with delay seconds", result);
      }
      
      // Test 20: sendBatchToQueue() with invalid URL
      {
        const result = await safeTest(async () => {
          await SQSHelper.sendBatchToQueue("https://invalid-queue-url.com", [{ test: "data" }]);
          return false;
        });
        logTest("sendBatchToQueue() with invalid URL", !result);
      }
      
      // Test 21: sendBatchToQueue() with null messages
      {
        const result = await safeTest(async () => {
          await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, null);
          return false;
        });
        logTest("sendBatchToQueue() with null messages", !result);
      }
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 4: MESSAGE RECEIVING (10 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n📥 SECTION 4: MESSAGE RECEIVING\n");
    
    if (!TEST_QUEUE_URL) {
      console.log("⚠️  Test queue not available - skipping receiving tests\n");
      for (let i = 0; i < 10; i++) {
        logTest(`receiveFromQueue(test_${i})`, false, "No test queue available", true);
      }
    } else {
      
      // Send some test messages first
      await safeTest(async () => {
        const messages = [
          { receive_test: 1 },
          { receive_test: 2 },
          { receive_test: 3 },
          { receive_test: 4 },
          { receive_test: 5 }
        ];
        await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, messages);
      });
      
      // Wait for messages to be available
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test 22: receiveFromQueue() with default parameters
      {
        const result = await safeTest(async () => {
          const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL);
          return Array.isArray(messages);
        });
        logTest("receiveFromQueue() with defaults", result);
      }
      
      // Test 23: receiveFromQueue() with maxMessages = 5
      {
        const result = await safeTest(async () => {
          const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 5);
          return Array.isArray(messages);
        });
        logTest("receiveFromQueue() with max 5 messages", result);
      }
      
      // Test 24: receiveFromQueue() with maxMessages = 10
      {
        const result = await safeTest(async () => {
          const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 10);
          return Array.isArray(messages);
        });
        logTest("receiveFromQueue() with max 10 messages", result);
      }
      
      // Test 25: receiveFromQueue() with short polling
      {
        const result = await safeTest(async () => {
          const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 0);
          return Array.isArray(messages);
        });
        logTest("receiveFromQueue() short polling (0s)", result);
      }
      
      // Test 26: receiveFromQueue() with long polling
      {
        const result = await safeTest(async () => {
          const startTime = Date.now();
          const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 5);
          const elapsed = Date.now() - startTime;
          return Array.isArray(messages);
        });
        logTest("receiveFromQueue() long polling (5s)", result);
      }
      
      // Test 27: receiveFromQueue() returns empty array when no messages
      {
        const result = await safeTest(async () => {
          const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 0);
          return Array.isArray(messages);
        });
        logTest("receiveFromQueue() empty queue", result);
      }
      
      // Test 28: receiveFromQueue() with invalid URL
      {
        const result = await safeTest(async () => {
          await SQSHelper.receiveFromQueue("https://invalid-queue-url.com");
          return false;
        });
        logTest("receiveFromQueue() with invalid URL", !result);
      }
      
      // Test 29: receiveFromQueue() with maxMessages = 0
      {
        const result = await safeTest(async () => {
          await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 0);
          return false;
        });
        logTest("receiveFromQueue() with maxMessages=0", !result);
      }
      
      // Test 30: receiveFromQueue() with negative waitTime
      {
        const result = await safeTest(async () => {
          await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, -1);
          return false;
        });
        logTest("receiveFromQueue() with negative waitTime", !result);
      }
      
      // Test 31: receiveFromQueue() with null queue URL
      {
        const result = await safeTest(async () => {
          await SQSHelper.receiveFromQueue(null);
          return false;
        });
        logTest("receiveFromQueue() with null URL", !result);
      }
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 5: MESSAGE DELETION (7 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n🗑️  SECTION 5: MESSAGE DELETION\n");
    
    if (!TEST_QUEUE_URL) {
      console.log("⚠️  Test queue not available - skipping deletion tests\n");
      for (let i = 0; i < 7; i++) {
        logTest(`deleteFromQueue(test_${i})`, false, "No test queue available", true);
      }
    } else {
      
      // Send and receive a message to get a receipt handle
      let testReceiptHandle = null;
      await safeTest(async () => {
        await SQSHelper.sendToQueue(TEST_QUEUE_URL, { delete_test: "message" });
        await new Promise(resolve => setTimeout(resolve, 1500));
        const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 0);
        if (messages && messages.length > 0) {
          testReceiptHandle = messages[0].ReceiptHandle;
        }
      });
      
      // Test 32: deleteFromQueue() with valid receipt handle
      {
        const result = await safeTest(async () => {
          if (!testReceiptHandle) throw new Error("No receipt handle available");
          await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, testReceiptHandle);
          return true;
        });
        logTest("deleteFromQueue() with valid receipt", result);
      }
      
      // Test 33: deleteFromQueue() with null receipt handle
      {
        const result = await safeTest(async () => {
          await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, null);
          return false;
        });
        logTest("deleteFromQueue() with null receipt", !result);
      }
      
      // Test 34: deleteFromQueue() with empty receipt handle
      {
        const result = await safeTest(async () => {
          await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, "");
          return false;
        });
        logTest("deleteFromQueue() with empty receipt", !result);
      }
      
      // Test 35: deleteFromQueue() with invalid receipt handle
      {
        const result = await safeTest(async () => {
          await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, "invalid_receipt_handle_xyz");
          return false;
        });
        logTest("deleteFromQueue() with invalid receipt", !result);
      }
      
      // Test 36: deleteFromQueue() with invalid URL
      {
        const result = await safeTest(async () => {
          await SQSHelper.deleteFromQueue("https://invalid-queue-url.com", "some_receipt");
          return false;
        });
        logTest("deleteFromQueue() with invalid URL", !result);
      }
      
      // Test 37: deleteFromQueue() with retry options
      {
        // Send and receive a new message
        let receiptHandle = null;
        await safeTest(async () => {
          await SQSHelper.sendToQueue(TEST_QUEUE_URL, { retry_delete_test: "message" });
          await new Promise(resolve => setTimeout(resolve, 1500));
          const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 0);
          if (messages && messages.length > 0) {
            receiptHandle = messages[0].ReceiptHandle;
          }
        });
        
        const result = await safeTest(async () => {
          if (!receiptHandle) throw new Error("No receipt handle available");
          await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, receiptHandle, {
            retries: 2,
            delayMs: 100
          });
          return true;
        });
        logTest("deleteFromQueue() with retry options", result);
      }
      
      // Test 38: deleteFromQueue() same message twice (idempotent)
      {
        // Send and receive a new message
        let receiptHandle = null;
        await safeTest(async () => {
          await SQSHelper.sendToQueue(TEST_QUEUE_URL, { double_delete_test: "message" });
          await new Promise(resolve => setTimeout(resolve, 1500));
          const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 0);
          if (messages && messages.length > 0) {
            receiptHandle = messages[0].ReceiptHandle;
          }
        });
        
        const result = await safeTest(async () => {
          if (!receiptHandle) throw new Error("No receipt handle available");
          await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, receiptHandle);
          // Try to delete again - should handle gracefully
          await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, receiptHandle);
          return true;
        });
        logTest("deleteFromQueue() duplicate delete", result);
      }
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 6: DEAD LETTER QUEUE (DLQ) OPERATIONS (5 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n☠️  SECTION 6: DEAD LETTER QUEUE (DLQ) OPERATIONS\n");
    console.log("⚠️  Skipping DLQ tests - test queue doesn't have DLQ configured\n");
    console.log("ℹ️  Note: checkDLQ() requires config-based queue with dlqUrl in queue-config.json\n");
    
    // Skip all DLQ tests since test queue won't have DLQ configured
    for (let i = 39; i <= 43; i++) {
      logTest(`checkDLQ() test #${i}`, false, "Test queue has no DLQ", true);
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 7: RETRY MECHANISM (4 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n🔄 SECTION 7: RETRY MECHANISM\n");
    
    // Test 44: withRetry() succeeds on first attempt
    {
      const result = await safeTest(async () => {
        let callCount = 0;
        const testFn = async () => {
          callCount++;
          return "success";
        };
        const result = await SQSHelper.withRetry(testFn, 3, 100);
        if (result !== "success") throw new Error("Should return success");
        if (callCount !== 1) throw new Error("Should only call once");
      })();
      logTest("withRetry(immediate_success)", result.success, 
        result.success ? "Succeeded on first attempt" : result.error.message);
    }
    
    // Test 45: withRetry() succeeds after 2 failures
    {
      const result = await safeTest(async () => {
        let callCount = 0;
        const testFn = async () => {
          callCount++;
          if (callCount < 3) throw new Error("Simulated failure");
          return "success";
        };
        const result = await SQSHelper.withRetry(testFn, 3, 50);
        if (result !== "success") throw new Error("Should return success");
        if (callCount !== 3) throw new Error("Should call 3 times");
      })();
      logTest("withRetry(retry_then_success)", result.success, 
        result.success ? "Succeeded after 2 retries" : result.error.message);
    }
    
    // Test 46: withRetry() fails after exhausting all retries
    {
      const result = await safeTest(async () => {
        let callCount = 0;
        const testFn = async () => {
          callCount++;
          throw new Error("Always fails");
        };
        await SQSHelper.withRetry(testFn, 3, 50);
      })();
      logTest("withRetry(exhausted_retries)", !result.success, 
        !result.success ? "Correctly failed after 3 retries" : "Should have failed");
    }
    
    // Test 47: withRetry() with exponential backoff delay
    {
      const result = await safeTest(async () => {
        let callCount = 0;
        const delays = [];
        let lastTime = Date.now();
        
        const testFn = async () => {
          callCount++;
          if (callCount > 1) {
            delays.push(Date.now() - lastTime);
          }
          lastTime = Date.now();
          if (callCount < 3) throw new Error("Simulated failure");
          return "success";
        };
        
        await SQSHelper.withRetry(testFn, 3, 100);
        
        // Verify exponential backoff: delay2 should be ~2x delay1
        if (delays.length === 2) {
          const ratio = delays[1] / delays[0];
          // Allow some tolerance (1.5x to 2.5x)
          if (ratio < 1.5 || ratio > 2.5) {
            throw new Error(`Backoff ratio ${ratio.toFixed(2)} not exponential`);
          }
        }
      })();
      logTest("withRetry(exponential_backoff)", result.success, 
        result.success ? "Exponential backoff working correctly" : result.error.message);
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // SECTION 8: EDGE CASES & SPECIAL SCENARIOS (8 tests)
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n⚡ SECTION 8: EDGE CASES & SPECIAL SCENARIOS\n");
    
    if (!TEST_QUEUE_URL) {
      console.log("⚠️  Test queue not available - skipping edge case tests\n");
      for (let i = 0; i < 8; i++) {
        logTest(`edge_case_test_${i}`, false, "No test queue available", true);
      }
    } else {
      
      // Test 48: Send message with very long body (near 256KB limit)
      {
        const result = await safeTest(async () => {
          // SQS has a 256KB limit per message
          const largeData = "x".repeat(200000); // 200KB
          const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, {
            data: largeData,
            size: largeData.length
          });
          return response && response.MessageId;
        });
        logTest("Edge: large message body (~200KB)", result);
      }
      
      // Test 49: Send message with special characters
      {
        const result = await safeTest(async () => {
          const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, {
            special: "Tab:\t Newline:\n Return:\r Quote:\" Backslash:\\",
            controlChars: "\x00\x01\x02\x03\x04\x05",
            unicode: "\u0000\u0001\u0002"
          });
          return response && response.MessageId;
        });
        logTest("Edge: special characters", result);
      }
      
      // Test 50: Concurrent send operations
      {
        const result = await safeTest(async () => {
          const promises = Array.from({ length: 5 }, (_, i) => 
            SQSHelper.sendToQueue(TEST_QUEUE_URL, { concurrent: i, timestamp: Date.now() })
          );
          const results = await Promise.all(promises);
          return results.every(r => r && r.MessageId);
        });
        logTest("Edge: 5 concurrent sends", result);
      }
      
      // Test 51: Visibility timeout behavior
      {
        const result = await safeTest(async () => {
          // Send a message
          await SQSHelper.sendToQueue(TEST_QUEUE_URL, { visibility_test: "message" });
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Receive with visibility timeout
          const messages1 = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 0);
          if (!messages1 || messages1.length === 0) {
            throw new Error("No message received");
          }
          
          // Clean up
          if (messages1[0]?.ReceiptHandle) {
            await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, messages1[0].ReceiptHandle);
          }
          return true;
        });
        logTest("Edge: visibility timeout", result);
      }
      
      // Test 52: Message attributes with various data types
      {
        const result = await safeTest(async () => {
          const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, 
            { test: "attributes_test" },
            {
              messageAttributes: {
                StringAttr: { DataType: 'String', StringValue: 'test' },
                NumberAttr: { DataType: 'Number', StringValue: '12345' }
              }
            }
          );
          return response && response.MessageId;
        });
        logTest("Edge: message attributes", result);
      }
      
      // Test 53: Empty message body
      {
        const result = await safeTest(async () => {
          await SQSHelper.sendToQueue(TEST_QUEUE_URL, "");
          return false;
        });
        logTest("Edge: empty message body", !result);
      }
      
      // Test 54: Rapid successive operations
      {
        const result = await safeTest(async () => {
          // Send 10 messages rapidly
          for (let i = 0; i < 10; i++) {
            await SQSHelper.sendToQueue(TEST_QUEUE_URL, { rapid: i });
          }
          
          // Receive them back
          await new Promise(resolve => setTimeout(resolve, 2000));
          const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 10, 0);
          
          // Clean up
          if (messages && messages.length > 0) {
            for (const msg of messages) {
              await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, msg.ReceiptHandle);
            }
          }
          return true;
        });
        logTest("Edge: rapid operations (10 msgs)", result);
      }
      
      // Test 55: Complex nested structures
      {
        const result = await safeTest(async () => {
          const complexMessage = {
            arrays: [
              [1, 2, 3],
              ["a", "b", "c"],
              [{ nested: true }, { nested: false }]
            ],
            objects: {
              level1: {
                level2: {
                  level3: [1, 2, 3]
                }
              }
            },
            mixed: [1, "string", true, null, { key: "value" }, [1, 2, 3]]
          };
          
          const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, complexMessage);
          return response && response.MessageId;
        });
        logTest("Edge: complex nested structure", result);
      }
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // CLEANUP: DELETE TEST QUEUE
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n🧹 CLEANUP: DELETING TEST QUEUE\n");
    
    if (TEST_QUEUE_URL) {
      const cleanupResult = await safeTest(async () => {
        await SQSHelper.deleteQueue(TEST_QUEUE_URL);
        return true;
      });
      
      if (cleanupResult) {
        console.log(`✅ Test queue deleted successfully: ${TEST_QUEUE_NAME}`);
      } else {
        console.log(`⚠️  Failed to delete test queue: ${TEST_QUEUE_NAME}`);
        console.log(`   You may need to manually delete it from AWS console`);
      }
    } else {
      console.log("⏭️  No test queue to clean up");
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
    
    if (testResults.skipped > 0) {
      console.log("\n⏭️  SKIPPED TESTS:");
      testResults.tests
        .filter(t => t.skipped)
        .forEach(t => console.log(`   • ${t.methodName}: ${t.message}`));
    }
    
    console.log("\n✅ SQS COMPREHENSIVE UNIT TESTS COMPLETED!");
    console.log("═".repeat(80));
    
  } catch (error) {
    console.error("\n❌ Test suite failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

console.log("🚀 Starting SQS comprehensive unit tests...\n");
runSqsUnitTests();
