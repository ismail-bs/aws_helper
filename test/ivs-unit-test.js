/**
 * ═══════════════════════════════════════════════════════════════════
 *  AWS IVS UNIT TESTS - PER-METHOD TESTING
 * ═══════════════════════════════════════════════════════════════════
 * 
 * WHAT THIS TESTS:
 * ────────────────
 * Each IVS method individually with simple inputs/outputs
 * No complex workflows - just method validation
 * 
 * METHODS TESTED:
 * ───────────────
 * ✅ createStream()
 * ✅ getChannelMeta()
 * ✅ updateChannel()
 * ✅ listChannelStreams()
 * ✅ deleteChannel()
 * ✅ listAllChannels()
 * ✅ countAllChannels()
 * ✅ channelExists()
 * ✅ validateChannel()
 * 
 * RUN: node test/ivs-unit-test.js
 * ═══════════════════════════════════════════════════════════════════
 */

import IVSService from "../aws/ivs.js";
import dotenv from "dotenv";

dotenv.config();

const TEST_USER_ID = `unit-test-user-${Date.now()}`;
const TEST_STREAM_TITLE = "Unit Test Stream";

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

let createdChannelArn = null;
let createdStreamId = null;

function logTest(methodName, passed, message = "") {
  const status = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${status} | ${methodName} | ${message}`);
  
  testResults.tests.push({ methodName, passed, message });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

console.log("🧪 AWS IVS UNIT TESTS - PER-METHOD TESTING");
console.log("═".repeat(60));
console.log(`Test User: ${TEST_USER_ID}`);
console.log(`Started: ${new Date().toISOString()}\n`);

async function runIvsUnitTests() {
  try {
    
    // ═══════════════════════════════════════════════════════════════
    // STREAM & CHANNEL CREATION
    // ═══════════════════════════════════════════════════════════════
    
    console.log("🎥 STREAM & CHANNEL OPERATIONS\n");
    
    // Test 1: createStream()
    try {
      const streamData = await IVSService.createStream({
        creator_user_id: TEST_USER_ID,
        title: TEST_STREAM_TITLE,
        description: "Unit test stream description",
        access_type: "public",
        is_private: false,
        pricing_type: "free",
        allow_comments: true,
        collaborators: [],
        tags: ["test", "unit"]
      });
      
      const isValid = streamData && streamData.id && streamData.channel_id;
      
      if (isValid) {
        createdStreamId = streamData.id;
        createdChannelArn = streamData.channel_id;
      }
      
      logTest("createStream()", isValid, `Stream ID: ${streamData?.id}, Channel: ${streamData?.channel_id?.substring(0, 40)}...`);
    } catch (error) {
      logTest("createStream()", false, error.message);
    }
    
    // Test 2: listAllChannels()
    try {
      const channels = await IVSService.listAllChannels();
      const found = channels.some(c => c.arn === createdChannelArn);
      logTest("listAllChannels()", found, `Found ${channels.length} channels, test channel exists: ${found}`);
    } catch (error) {
      logTest("listAllChannels()", false, error.message);
    }
    
    // Test 3: countAllChannels()
    try {
      const count = await IVSService.countAllChannels();
      const isValid = count > 0;
      logTest("countAllChannels()", isValid, `Total channels: ${count}`);
    } catch (error) {
      logTest("countAllChannels()", false, error.message);
    }
    
    // Test 4: channelExists()
    if (createdChannelArn) {
      try {
        const exists = await IVSService.channelExists(createdChannelArn);
        logTest("channelExists()", exists === true, `Channel exists: ${exists}`);
      } catch (error) {
        logTest("channelExists()", false, error.message);
      }
    } else {
      logTest("channelExists()", false, "No channel ARN available");
    }
    
    // Test 5: validateChannel()
    if (createdChannelArn) {
      try {
        const validation = await IVSService.validateChannel(createdChannelArn);
        const isValid = validation && validation.valid === true;
        logTest("validateChannel()", isValid, `Valid: ${validation?.valid}, Reason: ${validation?.reason || 'N/A'}`);
      } catch (error) {
        logTest("validateChannel()", false, error.message);
      }
    } else {
      logTest("validateChannel()", false, "No channel ARN available");
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // METADATA OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n📋 METADATA OPERATIONS\n");
    
    // Test 6: getChannelMeta()
    try {
      const metadata = await IVSService.getChannelMeta(TEST_USER_ID);
      const isValid = metadata && metadata.id === TEST_USER_ID;
      logTest("getChannelMeta()", isValid, `Retrieved metadata for: ${metadata?.id}`);
    } catch (error) {
      logTest("getChannelMeta()", false, error.message);
    }
    
    // Test 7: updateChannel()
    try {
      const updates = {
        description: "Updated description for unit test",
        tags: ["updated", "test"]
      };
      
      const result = await IVSService.updateChannel(TEST_USER_ID, updates);
      const isValid = result && result.description === updates.description;
      logTest("updateChannel()", isValid, `Updated channel metadata`);
    } catch (error) {
      logTest("updateChannel()", false, error.message);
    }
    
    // Test 8: listChannelStreams()
    if (createdChannelArn) {
      try {
        const streams = await IVSService.listChannelStreams(createdChannelArn);
        const isValid = Array.isArray(streams);
        logTest("listChannelStreams()", isValid, `Found ${streams?.length || 0} streams for channel`);
      } catch (error) {
        logTest("listChannelStreams()", false, error.message);
      }
    } else {
      logTest("listChannelStreams()", false, "No channel ARN available");
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // VALIDATION & ERROR HANDLING
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n🔍 VALIDATION & ERROR HANDLING\n");
    
    // Test 9: channelExists() with non-existent channel
    try {
      const fakeArn = "arn:aws:ivs:us-west-2:123456789:channel/nonexistent";
      const exists = await IVSService.channelExists(fakeArn);
      logTest("channelExists() [non-existent]", exists === false, `Non-existent channel returns false: ${!exists}`);
    } catch (error) {
      logTest("channelExists() [non-existent]", false, error.message);
    }
    
    // Test 10: validateChannel() with non-existent channel
    try {
      const fakeArn = "arn:aws:ivs:us-west-2:123456789:channel/nonexistent";
      const validation = await IVSService.validateChannel(fakeArn);
      const isInvalid = validation && validation.valid === false;
      logTest("validateChannel() [non-existent]", isInvalid, `Invalid channel detected: ${validation?.reason}`);
    } catch (error) {
      logTest("validateChannel() [non-existent]", false, error.message);
    }
    
    // Test 11: getChannelMeta() with non-existent user
    try {
      const metadata = await IVSService.getChannelMeta("nonexistent-user-id");
      const isNull = metadata === null;
      logTest("getChannelMeta() [non-existent]", isNull, `Non-existent user returns null: ${isNull}`);
    } catch (error) {
      logTest("getChannelMeta() [non-existent]", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n🧹 CLEANUP\n");
    
    // Test 12: deleteChannel()
    if (createdChannelArn) {
      try {
        const result = await IVSService.deleteChannel(createdChannelArn);
        logTest("deleteChannel()", result === true, `Deleted channel: ${createdChannelArn.substring(0, 40)}...`);
      } catch (error) {
        logTest("deleteChannel()", false, error.message);
      }
    } else {
      logTest("deleteChannel()", false, "No channel ARN available");
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
    
    console.log("\n✅ IVS UNIT TESTS COMPLETED!");
    
  } catch (error) {
    console.error("\n❌ Test suite failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

console.log("🚀 Starting IVS unit tests...\n");
runIvsUnitTests();
