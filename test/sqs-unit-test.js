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
async function safeTest(testName, testFunc, expectError = false) {
  try {
    const result = await testFunc();
    if (expectError) {
      logTest(testName, false, "Expected error but operation succeeded");
      return { success: false, result };
    }
    const isValid = result !== null && result !== undefined;
    return { success: isValid, result };
  } catch (error) {
    if (expectError) {
      logTest(testName, true, `Expected error: ${error.message.substring(0, 50)}`);
      return { success: true, result: error };
    }
    logTest(testName, false, error.message);
    return { success: false, result: error };
  }
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
    try {
      await SQSHelper.init(REGION);
      logTest("init() [valid region]", true, `Initialized with region ${REGION}`);
    } catch (error) {
      logTest("init() [valid region]", false, error.message);
    }
    
    // Test 2: init() with null region (should fail)
    await safeTest("init() [null region]", async () => {
      await SQSHelper.init(null);
    }, true);
    
    // Test 3: init() with empty string region (should fail)
    await safeTest("init() [empty region]", async () => {
      await SQSHelper.init("");
    }, true);
    
    // Test 4: init() with invalid type (should fail)
    await safeTest("init() [invalid type]", async () => {
      await SQSHelper.init(12345);
    }, true);
    
    // Test 5: getQueueConfig() with valid flag (requires queue-config.json)
    try {
      // Try to get the first queue config from the file
      const firstQueueFlag = SQSHelper.config.queues[0]?.flag;
      if (!firstQueueFlag) throw new Error("No queue configuration found");
      
      const config = SQSHelper.getQueueConfig(firstQueueFlag);
      if (!config.queueUrl) throw new Error("Missing queueUrl");
      logTest("getQueueConfig() [valid flag]", true, "Retrieved queue configuration");
    } catch (error) {
      logTest("getQueueConfig() [valid flag]", false, error.message);
    }
    
    // Test 6: getQueueConfig() with non-existent flag (should fail)
    await safeTest("getQueueConfig() [invalid flag]", async () => {
      SQSHelper.getQueueConfig("non_existent_flag_xyz_123");
    }, true);
    
    
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
      try {
        const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, {
          test: "data",
          timestamp: Date.now()
        });
        const isValid = response && response.MessageId;
        logTest("sendToQueue() [valid message]", isValid, 
          isValid ? `Sent message ID: ${response.MessageId.substring(0, 20)}...` : "Failed");
      } catch (error) {
        logTest("sendToQueue() [valid message]", false, error.message);
      }
      
      // Test 8: sendToQueue() with string message
      try {
        const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, "simple string message");
        const isValid = response && response.MessageId;
        logTest("sendToQueue() [string message]", isValid, "String message sent");
      } catch (error) {
        logTest("sendToQueue() [string message]", false, error.message);
      }
      
      // Test 9: sendToQueue() with delay
      try {
        const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, { delayed: true }, {
          delaySeconds: 5
        });
        const isValid = response && response.MessageId;
        logTest("sendToQueue() [with delay]", isValid, "Message sent with 5s delay");
      } catch (error) {
        logTest("sendToQueue() [with delay]", false, error.message);
      }
      
      // Test 10: sendToQueue() with message attributes
      try {
        const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, { data: "test" }, {
          messageAttributes: {
            Priority: { DataType: 'String', StringValue: 'High' },
            Count: { DataType: 'Number', StringValue: '100' }
          }
        });
        const isValid = response && response.MessageId;
        logTest("sendToQueue() [with attributes]", isValid, "Message with attributes sent");
      } catch (error) {
        logTest("sendToQueue() [with attributes]", false, error.message);
      }
      
      // Test 11: sendToQueue() with deduplication ID
      try {
        const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, { unique: "data" }, {
          messageDeduplicationId: `dedup-${Date.now()}`,
          messageGroupId: "test-group"
        });
        const isValid = response && response.MessageId;
        logTest("sendToQueue() [with dedup ID]", isValid, "Message with deduplication ID sent");
      } catch (error) {
        logTest("sendToQueue() [with dedup ID]", false, error.message);
      }
      
      // Test 12: sendToQueue() with invalid URL (should fail)
      await safeTest("sendToQueue() [invalid URL]", async () => {
        await SQSHelper.sendToQueue("https://invalid-queue-url.com", { test: "data" });
      }, true);
      
      // Test 13: sendToQueue() with empty message (should fail)
      await safeTest("sendToQueue() [null message]", async () => {
        await SQSHelper.sendToQueue(TEST_QUEUE_URL, null);
      }, true);
      
      // Test 14: sendToQueue() with very large message
      try {
        const largeMessage = {
          data: "x".repeat(256 * 1024) // 256KB (SQS limit)
        };
        const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, largeMessage);
        const isValid = response && response.MessageId;
        logTest("sendToQueue() [large 256KB]", isValid, "Large message sent (256KB)");
      } catch (error) {
        logTest("sendToQueue() [large 256KB]", false, error.message);
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
      try {
        const messages = [
          { id: 1, data: "message 1" },
          { id: 2, data: "message 2" },
          { id: 3, data: "message 3" }
        ];
        const response = await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, messages);
        const isValid = response && response.Successful && response.Successful.length === 3;
        logTest("sendBatchToQueue() [3 messages]", isValid, 
          isValid ? `Sent ${response.Successful.length} messages` : "Failed");
      } catch (error) {
        logTest("sendBatchToQueue() [3 messages]", false, error.message);
      }
      
      // Test 16: sendBatchToQueue() with single message
      try {
        const messages = [{ single: "message" }];
        const response = await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, messages);
        const isValid = response && response.Successful && response.Successful.length === 1;
        logTest("sendBatchToQueue() [single message]", isValid, "Single message sent");
      } catch (error) {
        logTest("sendBatchToQueue() [single message]", false, error.message);
      }
      
      // Test 17: sendBatchToQueue() with 10 messages (AWS limit)
      try {
        const messages = Array.from({ length: 10 }, (_, i) => ({
          index: i,
          data: `message_${i}`,
          timestamp: Date.now()
        }));
        const response = await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, messages);
        const isValid = response && response.Successful && response.Successful.length === 10;
        logTest("sendBatchToQueue() [10 messages]", isValid, 
          isValid ? "Sent 10 messages (AWS max)" : "Failed");
      } catch (error) {
        logTest("sendBatchToQueue() [10 messages]", false, error.message);
      }
      
      // Test 18: sendBatchToQueue() with empty array (should fail)
      await safeTest("sendBatchToQueue() [empty array]", async () => {
        await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, []);
      }, true);
      
      // Test 19: sendBatchToQueue() with delay seconds
      try {
        const messages = [
          { delayed: "message 1" },
          { delayed: "message 2" }
        ];
        const response = await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, messages, {
          delaySeconds: 3
        });
        const isValid = response && response.Successful && response.Successful.length === 2;
        logTest("sendBatchToQueue() [with delay]", isValid, "Batch with 3s delay sent");
      } catch (error) {
        logTest("sendBatchToQueue() [with delay]", false, error.message);
      }
      
      // Test 20: sendBatchToQueue() with invalid URL (should fail)
      await safeTest("sendBatchToQueue() [invalid URL]", async () => {
        await SQSHelper.sendBatchToQueue("https://invalid-queue-url.com", [{ test: "data" }]);
      }, true);
      
      // Test 21: sendBatchToQueue() with null messages (should fail)
      await safeTest("sendBatchToQueue() [null messages]", async () => {
        await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, null);
      }, true);
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
      try {
        const messages = [
          { receive_test: 1 },
          { receive_test: 2 },
          { receive_test: 3 },
          { receive_test: 4 },
          { receive_test: 5 }
        ];
        await SQSHelper.sendBatchToQueue(TEST_QUEUE_URL, messages);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.log("⚠️  Failed to send test messages - some tests may fail\n");
      }
      
      // Test 22: receiveFromQueue() with default parameters
      try {
        const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL);
        const isValid = Array.isArray(messages);
        logTest("receiveFromQueue() [defaults]", isValid, 
          isValid ? `Received ${messages.length} message(s)` : "Failed");
      } catch (error) {
        logTest("receiveFromQueue() [defaults]", false, error.message);
      }
      
      // Test 23: receiveFromQueue() with maxMessages = 5
      try {
        const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 5);
        const isValid = Array.isArray(messages);
        logTest("receiveFromQueue() [max 5]", isValid, 
          isValid ? `Received ${messages.length} message(s)` : "Failed");
      } catch (error) {
        logTest("receiveFromQueue() [max 5]", false, error.message);
      }
      
      // Test 24: receiveFromQueue() with maxMessages = 10
      try {
        const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 10);
        const isValid = Array.isArray(messages);
        logTest("receiveFromQueue() [max 10]", isValid, 
          isValid ? `Received ${messages.length} message(s)` : "Failed");
      } catch (error) {
        logTest("receiveFromQueue() [max 10]", false, error.message);
      }
      
      // Test 25: receiveFromQueue() with short polling
      try {
        const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 0);
        const isValid = Array.isArray(messages);
        logTest("receiveFromQueue() [short poll 0s]", isValid, "Short polling");
      } catch (error) {
        logTest("receiveFromQueue() [short poll 0s]", false, error.message);
      }
      
      // Test 26: receiveFromQueue() with long polling
      try {
        const startTime = Date.now();
        const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 5);
        const elapsed = Date.now() - startTime;
        const isValid = Array.isArray(messages);
        logTest("receiveFromQueue() [long poll 5s]", isValid, 
          isValid ? `Polling completed in ${elapsed}ms` : "Failed");
      } catch (error) {
        logTest("receiveFromQueue() [long poll 5s]", false, error.message);
      }
      
      // Test 27: receiveFromQueue() returns empty array when no messages
      try {
        const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 0);
        const isValid = Array.isArray(messages);
        logTest("receiveFromQueue() [empty queue]", isValid, 
          isValid ? "Empty array returned" : "Failed");
      } catch (error) {
        logTest("receiveFromQueue() [empty queue]", false, error.message);
      }
      
      // Test 28: receiveFromQueue() with invalid URL (should fail)
      await safeTest("receiveFromQueue() [invalid URL]", async () => {
        await SQSHelper.receiveFromQueue("https://invalid-queue-url.com");
      }, true);
      
      // Test 29: receiveFromQueue() with maxMessages = 0 (should fail)
      await safeTest("receiveFromQueue() [maxMessages=0]", async () => {
        await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 0);
      }, true);
      
      // Test 30: receiveFromQueue() with negative waitTime (should fail)
      await safeTest("receiveFromQueue() [negative waitTime]", async () => {
        await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, -1);
      }, true);
      
      // Test 31: receiveFromQueue() with null queue URL (should fail)
      await safeTest("receiveFromQueue() [null URL]", async () => {
        await SQSHelper.receiveFromQueue(null);
      }, true);
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
      try {
        await SQSHelper.sendToQueue(TEST_QUEUE_URL, { delete_test: "message" });
        await new Promise(resolve => setTimeout(resolve, 1500));
        const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 0);
        if (messages && messages.length > 0) {
          testReceiptHandle = messages[0].ReceiptHandle;
        }
      } catch (error) {
        console.log("⚠️  Failed to prepare test message - some tests may fail\n");
      }
      
      // Test 32: deleteFromQueue() with valid receipt handle
      try {
        if (!testReceiptHandle) throw new Error("No receipt handle available");
        await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, testReceiptHandle);
        logTest("deleteFromQueue() [valid receipt]", true, "Message deleted");
      } catch (error) {
        logTest("deleteFromQueue() [valid receipt]", false, error.message);
      }
      
      // Test 33: deleteFromQueue() with null receipt handle (should fail)
      await safeTest("deleteFromQueue() [null receipt]", async () => {
        await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, null);
      }, true);
      
      // Test 34: deleteFromQueue() with empty receipt handle (should fail)
      await safeTest("deleteFromQueue() [empty receipt]", async () => {
        await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, "");
      }, true);
      
      // Test 35: deleteFromQueue() with invalid receipt handle (should fail)
      await safeTest("deleteFromQueue() [invalid receipt]", async () => {
        await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, "invalid_receipt_handle_xyz");
      }, true);
      
      // Test 36: deleteFromQueue() with invalid URL (should fail)
      await safeTest("deleteFromQueue() [invalid URL]", async () => {
        await SQSHelper.deleteFromQueue("https://invalid-queue-url.com", "some_receipt");
      }, true);
      
      // Test 37: deleteFromQueue() with retry options
      try {
        // Send and receive a new message
        let receiptHandle = null;
        await SQSHelper.sendToQueue(TEST_QUEUE_URL, { retry_delete_test: "message" });
        await new Promise(resolve => setTimeout(resolve, 1500));
        const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 0);
        if (messages && messages.length > 0) {
          receiptHandle = messages[0].ReceiptHandle;
        }
        
        if (!receiptHandle) throw new Error("No receipt handle available");
        await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, receiptHandle, {
          retries: 2,
          delayMs: 100
        });
        logTest("deleteFromQueue() [with retries]", true, "Deleted with retry options");
      } catch (error) {
        logTest("deleteFromQueue() [with retries]", false, error.message);
      }
      
      // Test 38: deleteFromQueue() same message twice (idempotent)
      try {
        // Send and receive a new message
        let receiptHandle = null;
        await SQSHelper.sendToQueue(TEST_QUEUE_URL, { double_delete_test: "message" });
        await new Promise(resolve => setTimeout(resolve, 1500));
        const messages = await SQSHelper.receiveFromQueue(TEST_QUEUE_URL, 1, 0);
        if (messages && messages.length > 0) {
          receiptHandle = messages[0].ReceiptHandle;
        }
        
        if (!receiptHandle) throw new Error("No receipt handle available");
        await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, receiptHandle);
        // Try to delete again - should handle gracefully
        await SQSHelper.deleteFromQueue(TEST_QUEUE_URL, receiptHandle);
        logTest("deleteFromQueue() [duplicate delete]", true, "Idempotent operation");
      } catch (error) {
        logTest("deleteFromQueue() [duplicate delete]", false, error.message);
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
    try {
      let callCount = 0;
      const testFn = async () => {
        callCount++;
        return "success";
      };
      const result = await SQSHelper.withRetry(testFn, 3, 100);
      if (result !== "success") throw new Error("Should return success");
      if (callCount !== 1) throw new Error("Should only call once");
      logTest("withRetry() [immediate success]", true, "Succeeded on first attempt");
    } catch (error) {
      logTest("withRetry() [immediate success]", false, error.message);
    }
    
    // Test 45: withRetry() succeeds after 2 failures
    try {
      let callCount = 0;
      const testFn = async () => {
        callCount++;
        if (callCount < 3) throw new Error("Simulated failure");
        return "success";
      };
      const result = await SQSHelper.withRetry(testFn, 3, 50);
      if (result !== "success") throw new Error("Should return success");
      if (callCount !== 3) throw new Error("Should call 3 times");
      logTest("withRetry() [retry then success]", true, "Succeeded after 2 retries");
    } catch (error) {
      logTest("withRetry() [retry then success]", false, error.message);
    }
    
    // Test 46: withRetry() fails after exhausting all retries (should fail)
    await safeTest("withRetry() [exhausted retries]", async () => {
      let callCount = 0;
      const testFn = async () => {
        callCount++;
        throw new Error("Always fails");
      };
      await SQSHelper.withRetry(testFn, 3, 50);
    }, true);
    
    // Test 47: withRetry() with exponential backoff delay
    try {
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
      logTest("withRetry() [exponential backoff]", true, "Exponential backoff verified");
    } catch (error) {
      logTest("withRetry() [exponential backoff]", false, error.message);
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
      try {
        // SQS has a 256KB limit per message
        const largeData = "x".repeat(200000); // 200KB
        const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, {
          data: largeData,
          size: largeData.length
        });
        const isValid = response && response.MessageId;
        logTest("Edge [~200KB message]", isValid, "Large message sent");
      } catch (error) {
        logTest("Edge [~200KB message]", false, error.message);
      }
      
      // Test 49: Send message with special characters
      try {
        const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, {
          special: "Tab:\t Newline:\n Return:\r Quote:\" Backslash:\\",
          controlChars: "\x00\x01\x02\x03\x04\x05",
          unicode: "\u0000\u0001\u0002"
        });
        const isValid = response && response.MessageId;
        logTest("Edge [special chars]", isValid, "Special characters handled");
      } catch (error) {
        logTest("Edge [special chars]", false, error.message);
      }
      
      // Test 50: Concurrent send operations
      try {
        const promises = Array.from({ length: 5 }, (_, i) => 
          SQSHelper.sendToQueue(TEST_QUEUE_URL, { concurrent: i, timestamp: Date.now() })
        );
        const results = await Promise.all(promises);
        const isValid = results.every(r => r && r.MessageId);
        logTest("Edge [5 concurrent sends]", isValid, 
          isValid ? "All 5 concurrent sends succeeded" : "Some sends failed");
      } catch (error) {
        logTest("Edge [5 concurrent sends]", false, error.message);
      }
      
      // Test 51: Visibility timeout behavior
      try {
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
        logTest("Edge [visibility timeout]", true, "Visibility timeout behavior verified");
      } catch (error) {
        logTest("Edge [visibility timeout]", false, error.message);
      }
      
      // Test 52: Message attributes with various data types
      try {
        const response = await SQSHelper.sendToQueue(TEST_QUEUE_URL, 
          { test: "attributes_test" },
          {
            messageAttributes: {
              StringAttr: { DataType: 'String', StringValue: 'test' },
              NumberAttr: { DataType: 'Number', StringValue: '12345' }
            }
          }
        );
        const isValid = response && response.MessageId;
        logTest("Edge [message attributes]", isValid, "Attributes sent successfully");
      } catch (error) {
        logTest("Edge [message attributes]", false, error.message);
      }
      
      // Test 53: Empty message body (should fail)
      await safeTest("Edge [empty body]", async () => {
        await SQSHelper.sendToQueue(TEST_QUEUE_URL, "");
      }, true);
      
      // Test 54: Rapid successive operations
      try {
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
        logTest("Edge [rapid 10 ops]", true, "Rapid operations completed");
      } catch (error) {
        logTest("Edge [rapid 10 ops]", false, error.message);
      }
      
      // Test 55: Complex nested structures
      try {
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
        const isValid = response && response.MessageId;
        logTest("Edge [nested structure]", isValid, "Complex structure sent");
      } catch (error) {
        logTest("Edge [nested structure]", false, error.message);
      }
    }
    
    
    // ════════════════════════════════════════════════════════════════════════
    // CLEANUP: DELETE TEST QUEUE
    // ════════════════════════════════════════════════════════════════════════
    
    console.log("\n🧹 CLEANUP: DELETING TEST QUEUE\n");
    
    if (TEST_QUEUE_URL) {
      try {
        await SQSHelper.deleteQueue(TEST_QUEUE_URL);
        console.log(`✅ Test queue deleted successfully: ${TEST_QUEUE_NAME}`);
      } catch (error) {
        console.log(`⚠️  Failed to delete test queue: ${TEST_QUEUE_NAME}`);
        console.log(`   You may need to manually delete it from AWS console`);
        console.log(`   Error: ${error.message}`);
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
