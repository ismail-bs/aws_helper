/**
 * ═══════════════════════════════════════════════════════════════════
 *  AWS SQS UNIT TESTS - PER-METHOD TESTING
 * ═══════════════════════════════════════════════════════════════════
 * 
 * WHAT THIS TESTS:
 * ────────────────
 * Each SQS method individually with simple inputs/outputs
 * No complex workflows - just method validation
 * 
 * METHODS TESTED:
 * ───────────────
 * ✅ createQueue()
 * ✅ deleteQueue()
 * ✅ listQueues()
 * ✅ getQueueUrl()
 * ✅ getQueueAttributes()
 * ✅ setQueueAttributes()
 * ✅ sendMessage()
 * ✅ sendMessageBatch()
 * ✅ receiveMessages()
 * ✅ deleteMessage()
 * ✅ deleteMessageBatch()
 * ✅ purgeQueue()
 * ✅ changeMessageVisibility()
 * 
 * RUN: node test/sqs-unit-test.js
 * ═══════════════════════════════════════════════════════════════════
 */

import AwsSqs from "../aws/sqs.js";
import dotenv from "dotenv";

dotenv.config();

const TEST_QUEUE = `unit-test-queue-${Date.now()}`;
const TEST_MESSAGE = "Unit test message";

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

let testQueueUrl = null;

function logTest(methodName, passed, message = "") {
  const status = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${status} | ${methodName} | ${message}`);
  
  testResults.tests.push({ methodName, passed, message });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

console.log("🧪 AWS SQS UNIT TESTS - PER-METHOD TESTING");
console.log("═".repeat(60));
console.log(`Test Queue: ${TEST_QUEUE}`);
console.log(`Started: ${new Date().toISOString()}\n`);

async function runSqsUnitTests() {
  try {
    
    // ═══════════════════════════════════════════════════════════════
    // QUEUE OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    
    console.log("📬 QUEUE OPERATIONS\n");
    
    // Test 1: createQueue()
    try {
      const queueUrl = await AwsSqs.createQueue(TEST_QUEUE);
      testQueueUrl = queueUrl;
      const isValid = queueUrl && queueUrl.includes(TEST_QUEUE);
      logTest("createQueue()", isValid, `Queue URL: ${queueUrl}`);
    } catch (error) {
      logTest("createQueue()", false, error.message);
    }
    
    // Test 2: listQueues()
    try {
      const queues = await AwsSqs.listQueues();
      const found = queues.some(url => url.includes(TEST_QUEUE));
      logTest("listQueues()", found, `Found ${queues.length} queues, test queue exists: ${found}`);
    } catch (error) {
      logTest("listQueues()", false, error.message);
    }
    
    // Test 3: getQueueUrl()
    try {
      const queueUrl = await AwsSqs.getQueueUrl(TEST_QUEUE);
      const matches = queueUrl === testQueueUrl;
      logTest("getQueueUrl()", matches, `URL matches: ${matches}`);
    } catch (error) {
      logTest("getQueueUrl()", false, error.message);
    }
    
    // Test 4: getQueueAttributes()
    try {
      const attributes = await AwsSqs.getQueueAttributes(testQueueUrl);
      const hasArn = attributes && attributes.QueueArn;
      logTest("getQueueAttributes()", hasArn, `ARN: ${attributes?.QueueArn}`);
    } catch (error) {
      logTest("getQueueAttributes()", false, error.message);
    }
    
    // Test 5: setQueueAttributes()
    try {
      const result = await AwsSqs.setQueueAttributes(testQueueUrl, {
        VisibilityTimeout: "60",
        MessageRetentionPeriod: "86400"
      });
      logTest("setQueueAttributes()", result === true, "Attributes updated");
    } catch (error) {
      logTest("setQueueAttributes()", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // MESSAGE OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n📨 MESSAGE OPERATIONS\n");
    
    let messageId = null;
    let receiptHandle = null;
    
    // Test 6: sendMessage()
    try {
      const result = await AwsSqs.sendMessage(testQueueUrl, TEST_MESSAGE);
      messageId = result?.MessageId;
      const isValid = messageId && messageId.length > 0;
      logTest("sendMessage()", isValid, `Message ID: ${messageId}`);
    } catch (error) {
      logTest("sendMessage()", false, error.message);
    }
    
    // Test 7: sendMessageBatch()
    try {
      const messages = [
        { Id: "1", MessageBody: "Batch message 1" },
        { Id: "2", MessageBody: "Batch message 2" },
        { Id: "3", MessageBody: "Batch message 3" }
      ];
      const result = await AwsSqs.sendMessageBatch(testQueueUrl, messages);
      const allSucceeded = result?.Successful?.length === 3;
      logTest("sendMessageBatch()", allSucceeded, `Sent ${result?.Successful?.length || 0} messages`);
    } catch (error) {
      logTest("sendMessageBatch()", false, error.message);
    }
    
    // Wait a bit for messages to be available
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 8: receiveMessages()
    try {
      const messages = await AwsSqs.receiveMessages(testQueueUrl, 5);
      const hasMessages = messages && messages.length > 0;
      
      if (hasMessages) {
        receiptHandle = messages[0].ReceiptHandle;
      }
      
      logTest("receiveMessages()", hasMessages, `Received ${messages?.length || 0} messages`);
    } catch (error) {
      logTest("receiveMessages()", false, error.message);
    }
    
    // Test 9: changeMessageVisibility()
    if (receiptHandle) {
      try {
        const result = await AwsSqs.changeMessageVisibility(testQueueUrl, receiptHandle, 120);
        logTest("changeMessageVisibility()", result === true, "Visibility timeout changed to 120s");
      } catch (error) {
        logTest("changeMessageVisibility()", false, error.message);
      }
    } else {
      logTest("changeMessageVisibility()", false, "No receipt handle available");
    }
    
    // Test 10: deleteMessage()
    if (receiptHandle) {
      try {
        const result = await AwsSqs.deleteMessage(testQueueUrl, receiptHandle);
        logTest("deleteMessage()", result === true, "Message deleted");
      } catch (error) {
        logTest("deleteMessage()", false, error.message);
      }
    } else {
      logTest("deleteMessage()", false, "No receipt handle available");
    }
    
    // Test 11: deleteMessageBatch()
    try {
      // Receive more messages
      const messages = await AwsSqs.receiveMessages(testQueueUrl, 3);
      
      if (messages && messages.length > 0) {
        const entries = messages.map((msg, idx) => ({
          Id: `${idx}`,
          ReceiptHandle: msg.ReceiptHandle
        }));
        
        const result = await AwsSqs.deleteMessageBatch(testQueueUrl, entries);
        const allDeleted = result?.Successful?.length === entries.length;
        logTest("deleteMessageBatch()", allDeleted, `Deleted ${result?.Successful?.length || 0} messages`);
      } else {
        logTest("deleteMessageBatch()", false, "No messages to delete");
      }
    } catch (error) {
      logTest("deleteMessageBatch()", false, error.message);
    }
    
    // Test 12: purgeQueue()
    try {
      const result = await AwsSqs.purgeQueue(testQueueUrl);
      logTest("purgeQueue()", result === true, "Queue purged");
    } catch (error) {
      logTest("purgeQueue()", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n🧹 CLEANUP\n");
    
    // Test 13: deleteQueue()
    try {
      const result = await AwsSqs.deleteQueue(testQueueUrl);
      logTest("deleteQueue()", result === true, `Deleted: ${TEST_QUEUE}`);
    } catch (error) {
      logTest("deleteQueue()", false, error.message);
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
    
    console.log("\n✅ SQS UNIT TESTS COMPLETED!");
    
  } catch (error) {
    console.error("\n❌ Test suite failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

console.log("🚀 Starting SQS unit tests...\n");
runSqsUnitTests();
