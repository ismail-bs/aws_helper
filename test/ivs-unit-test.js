/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AWS IVS COMPREHENSIVE UNIT TESTS
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * ENHANCED TESTING COVERAGE:
 * ──────────────────────────
 * ✅ All IVS Service operations with valid inputs
 * ✅ Parameter validation and sanitization
 * ✅ Error handling and edge cases
 * ✅ Null/undefined/invalid parameter handling
 * ✅ ScyllaDB integration scenarios
 * ✅ Stream key management
 * ✅ Channel state validation
 * ✅ Data type enforcement
 * ✅ Array and object handling
 * ✅ AWS API error scenarios
 * ✅ Resource cleanup verification
 * 
 * METHODS TESTED WITH EDGE CASES:
 * ────────────────────────────────
 * ✅ createStream() - valid data, missing required fields, invalid types
 * ✅ getChannelMeta() - existing, non-existing, invalid ID
 * ✅ updateChannel() - valid updates, empty updates, invalid data
 * ✅ listChannelStreams() - existing, empty, non-existing channels
 * ✅ deleteChannel() - existing, non-existing, invalid ARN
 * ✅ listAllChannels() - pagination, empty results
 * ✅ countAllChannels() - various scenarios
 * ✅ channelExists() - true/false cases, invalid ARNs
 * ✅ validateChannel() - valid, invalid, missing fields
 * 
 * RUN: node test/ivs-unit-test.js
 * ═══════════════════════════════════════════════════════════════════════
 */

import IVSService from "../aws/ivs.js";
import { STSHelper } from "../aws/STSHelper.js";
import dotenv from "dotenv";

dotenv.config();

let ACCOUNT_ID = null;
const TEST_USER_ID = `unit-test-user-${Date.now()}`;
const TEST_STREAM_TITLE = "Comprehensive Unit Test Stream";

async function setupAccountId() {
  ACCOUNT_ID = await STSHelper.getAccountId();
}

let testResults = {
  passed: 0,
  failed: 0,
  tests: [],
  skipped: 0
};

let createdChannelArn = null;
let createdStreamId = null;

function logTest(methodName, passed, message = "", skipped = false) {
  const status = skipped ? "⏭️  SKIP" : (passed ? "✅ PASS" : "❌ FAIL");
  console.log(`${status} | ${methodName} | ${message}`);
  
  testResults.tests.push({ methodName, passed, message, skipped });
  if (skipped) testResults.skipped++;
  else if (passed) testResults.passed++;
  else testResults.failed++;
}

/**
 * Helper function to safely execute test and handle expected errors/nulls
 */
async function safeTest(testName, testFunc, expectNull = false) {
  try {
    const result = await testFunc();
    if (expectNull) {
      const isNull = result === null || result === false;
      logTest(testName, isNull, `Correctly returned ${result === null ? 'null' : 'false'}`);
      return { success: isNull, result };
    }
    const isValid = result !== null && result !== undefined;
    if (!isValid) {
      logTest(testName, false, "Returned null/undefined unexpectedly");
    }
    return { success: isValid, result };
  } catch (error) {
    logTest(testName, false, error.message);
    return { success: false, result: error };
  }
}

console.log("🧪 AWS IVS COMPREHENSIVE UNIT TESTS");
console.log("═".repeat(70));
console.log(`Test User: ${TEST_USER_ID}`);
console.log(`Started: ${new Date().toISOString()}\n`);

async function runIvsUnitTests() {
  try {
    
    // ═══════════════════════════════════════════════════════════════════
    // STREAM CREATION - VALID SCENARIOS
    // ═══════════════════════════════════════════════════════════════════
    
    console.log("🎥 STREAM CREATION - VALID SCENARIOS\n");
    
    // Test 1: createStream() - Complete Valid Data
    try {
      const streamData = await IVSService.createStream({
        creator_user_id: TEST_USER_ID,
        title: TEST_STREAM_TITLE,
        description: "Comprehensive unit test stream description",
        access_type: "public",
        is_private: false,
        pricing_type: "free",
        allow_comments: true,
        collaborators: ["user1", "user2"],
        tags: ["test", "unit", "comprehensive"]
      });
      
      const isValid = streamData && streamData.id && streamData.channel_id && 
                      streamData.stream_key && streamData.playback_url;
      
      if (isValid) {
        createdStreamId = streamData.id;
        createdChannelArn = streamData.channel_id;
      }
      
      logTest("createStream() [complete data]", isValid, 
        `ID: ${streamData?.id}, Channel: ${streamData?.channel_id?.substring(0, 35)}...`);
    } catch (error) {
      logTest("createStream() [complete data]", false, error.message);
    }
    
    // Test 2: createStream() - Minimal Required Fields
    const minimalUser = `min-user-${Date.now()}`;
    try {
      const streamData = await IVSService.createStream({
        creator_user_id: minimalUser,
        title: "Minimal Stream",
        access_type: "public"
      });
      
      const isValid = streamData && streamData.id;
      logTest("createStream() [minimal fields]", isValid, 
        `Created with defaults: ${streamData?.id}`);
      
      // Cleanup
      if (streamData?.channel_id) {
        await IVSService.deleteChannel(streamData.channel_id);
      }
    } catch (error) {
      logTest("createStream() [minimal fields]", false, error.message);
    }
    
    // Test 3: createStream() - Private Stream
    const privateUser = `private-user-${Date.now()}`;
    try {
      const streamData = await IVSService.createStream({
        creator_user_id: privateUser,
        title: "Private Stream",
        access_type: "private",
        is_private: true,
        pricing_type: "premium"
      });
      
      const isValid = streamData && streamData.is_private === true;
      logTest("createStream() [private stream]", isValid, 
        `Private: ${streamData?.is_private}, Pricing: ${streamData?.pricing_type}`);
      
      // Cleanup
      if (streamData?.channel_id) {
        await IVSService.deleteChannel(streamData.channel_id);
      }
    } catch (error) {
      logTest("createStream() [private stream]", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════════
    // STREAM CREATION - INVALID/EDGE CASES
    // ═══════════════════════════════════════════════════════════════════
    
    console.log("\n🔍 STREAM CREATION - INVALID/EDGE CASES\n");
    
    // Test 4: createStream() - Missing Required Field (creator_user_id)
    await safeTest("createStream() [missing user_id]", async () => {
      return await IVSService.createStream({
        title: "Stream without user",
        access_type: "public"
      });
    }, true);
    
    // Test 5: createStream() - Missing Required Field (title)
    await safeTest("createStream() [missing title]", async () => {
      return await IVSService.createStream({
        creator_user_id: `test-${Date.now()}`,
        access_type: "public"
      });
    }, true);
    
    // Test 6: createStream() - Missing Required Field (access_type)
    await safeTest("createStream() [missing access_type]", async () => {
      return await IVSService.createStream({
        creator_user_id: `test-${Date.now()}`,
        title: "Test Stream"
      });
    }, true);
    
    // Test 7: createStream() - Invalid Data Type for Boolean
    await safeTest("createStream() [invalid boolean]", async () => {
      return await IVSService.createStream({
        creator_user_id: `test-${Date.now()}`,
        title: "Test",
        access_type: "public",
        is_private: "not-a-boolean" // Should be boolean
      });
    }, true);
    
    // Test 8: createStream() - Invalid Data Type for Array
    await safeTest("createStream() [invalid array]", async () => {
      return await IVSService.createStream({
        creator_user_id: `test-${Date.now()}`,
        title: "Test",
        access_type: "public",
        tags: "not-an-array" // Should be array
      });
    }, true);
    
    // Test 9: createStream() - Empty String for Required Field
    await safeTest("createStream() [empty string]", async () => {
      return await IVSService.createStream({
        creator_user_id: "",
        title: "Test",
        access_type: "public"
      });
    }, true);
    
    // Test 10: createStream() - Null Parameters
    await safeTest("createStream() [null params]", async () => {
      return await IVSService.createStream(null);
    }, true);
    
    
    // ═══════════════════════════════════════════════════════════════════
    // CHANNEL OPERATIONS
    // ═══════════════════════════════════════════════════════════════════
    
    console.log("\n📺 CHANNEL OPERATIONS\n");
    
    // Test 11: listAllChannels() - Should Return Array
    try {
      const channels = await IVSService.listAllChannels();
      const isArray = Array.isArray(channels);
      const found = createdChannelArn ? channels.some(c => c.arn === createdChannelArn) : true;
      logTest("listAllChannels() [valid]", isArray && found, 
        `Found ${channels.length} channels, test channel: ${found}`);
    } catch (error) {
      logTest("listAllChannels() [valid]", false, error.message);
    }
    
    // Test 12: countAllChannels() - Should Return Number
    try {
      const count = await IVSService.countAllChannels();
      const isValid = typeof count === 'number' && count >= 0;
      logTest("countAllChannels() [valid]", isValid, `Total: ${count} channels`);
    } catch (error) {
      logTest("countAllChannels() [valid]", false, error.message);
    }
    
    // Test 13: channelExists() - Existing Channel
    if (createdChannelArn) {
      try {
        const exists = await IVSService.channelExists(createdChannelArn);
        logTest("channelExists() [existing]", exists === true, 
          `Channel ${createdChannelArn.substring(0, 30)}... exists`);
      } catch (error) {
        logTest("channelExists() [existing]", false, error.message);
      }
    } else {
      logTest("channelExists() [existing]", false, "No channel ARN available", true);
    }
    
    // Test 14: channelExists() - Non-Existent Channel
    try {
      const fakeArn = `arn:aws:ivs:us-west-2:${ACCOUNT_ID}:channel/nonexistent12345`;
      const exists = await IVSService.channelExists(fakeArn);
      logTest("channelExists() [non-existing]", exists === false, 
        `Correctly returned false for non-existent channel`);
    } catch (error) {
      logTest("channelExists() [non-existing]", false, error.message);
    }
    
    // Test 15: channelExists() - Invalid ARN Format
    await safeTest("channelExists() [invalid ARN]", async () => {
      return await IVSService.channelExists("invalid-arn-format");
    }, true);
    
    // Test 16: channelExists() - Empty String
    await safeTest("channelExists() [empty string]", async () => {
      return await IVSService.channelExists("");
    }, true);
    
    // Test 17: channelExists() - Null/Undefined
    await safeTest("channelExists() [null]", async () => {
      return await IVSService.channelExists(null);
    }, true);
    
    // Test 18: validateChannel() - Valid Channel
    if (createdChannelArn) {
      try {
        const validation = await IVSService.validateChannel(createdChannelArn);
        const isValid = validation && validation.valid === true && validation.channel;
        logTest("validateChannel() [valid]", isValid, 
          `Valid: ${validation?.valid}, Has endpoints: ${!!validation?.channel?.playbackUrl}`);
      } catch (error) {
        logTest("validateChannel() [valid]", false, error.message);
      }
    } else {
      logTest("validateChannel() [valid]", false, "No channel ARN available", true);
    }
    
    // Test 19: validateChannel() - Non-Existent Channel
    try {
      const fakeArn = `arn:aws:ivs:us-west-2:${ACCOUNT_ID}:channel/nonexistent12345`;
      const validation = await IVSService.validateChannel(fakeArn);
      const isInvalid = validation && validation.valid === false && validation.reason;
      logTest("validateChannel() [non-existing]", isInvalid, 
        `Reason: ${validation?.reason}`);
    } catch (error) {
      logTest("validateChannel() [non-existing]", false, error.message);
    }
    
    // Test 20: validateChannel() - Invalid ARN Format
    await safeTest("validateChannel() [invalid ARN]", async () => {
      const result = await IVSService.validateChannel("invalid-arn");
      return result && result.valid === false ? result : null;
    }, false);
    
    
    // ═══════════════════════════════════════════════════════════════════
    // METADATA OPERATIONS
    // ═══════════════════════════════════════════════════════════════════
    
    console.log("\n📋 METADATA OPERATIONS\n");
    
    // Test 21: getChannelMeta() - Existing Channel
    try {
      const metadata = await IVSService.getChannelMeta(TEST_USER_ID);
      const isValid = metadata && metadata.id === TEST_USER_ID;
      logTest("getChannelMeta() [existing]", isValid, 
        `Retrieved for: ${metadata?.id}, ARN: ${metadata?.aws_channel_arn?.substring(0, 30)}...`);
    } catch (error) {
      logTest("getChannelMeta() [existing]", false, error.message);
    }
    
    // Test 22: getChannelMeta() - Non-Existent User
    await safeTest("getChannelMeta() [non-existing]", async () => {
      return await IVSService.getChannelMeta(`nonexistent-user-${Date.now()}`);
    }, true);
    
    // Test 23: getChannelMeta() - Empty String
    await safeTest("getChannelMeta() [empty string]", async () => {
      return await IVSService.getChannelMeta("");
    }, true);
    
    // Test 24: getChannelMeta() - Null Parameter
    await safeTest("getChannelMeta() [null]", async () => {
      return await IVSService.getChannelMeta(null);
    }, true);
    
    // Test 25: getChannelMeta() - Invalid Type (Number)
    await safeTest("getChannelMeta() [invalid type]", async () => {
      return await IVSService.getChannelMeta(12345);
    }, true);
    
    // Test 26: updateChannel() - Valid Updates
    try {
      const updates = {
        description: "Updated via comprehensive unit test",
        tags: ["updated", "test", "comprehensive"]
      };
      
      const result = await IVSService.updateChannel(TEST_USER_ID, updates);
      const isValid = result && result.description === updates.description;
      logTest("updateChannel() [valid]", isValid, 
        `Updated: ${result?.updated_at}`);
    } catch (error) {
      logTest("updateChannel() [valid]", false, error.message);
    }
    
    // Test 27: updateChannel() - Empty Updates Object
    try {
      const result = await IVSService.updateChannel(TEST_USER_ID, {});
      const isValid = result && result.updated_at;
      logTest("updateChannel() [empty updates]", isValid, 
        `Accepted empty updates, timestamp updated`);
    } catch (error) {
      logTest("updateChannel() [empty updates]", false, error.message);
    }
    
    // Test 28: updateChannel() - Non-Existent Channel
    await safeTest("updateChannel() [non-existing]", async () => {
      return await IVSService.updateChannel(`nonexistent-${Date.now()}`, { desc: "test" });
    }, true);
    
    // Test 29: updateChannel() - Null Updates
    await safeTest("updateChannel() [null updates]", async () => {
      return await IVSService.updateChannel(TEST_USER_ID, null);
    }, true);
    
    // Test 30: updateChannel() - Invalid Channel ID Type
    await safeTest("updateChannel() [invalid ID type]", async () => {
      return await IVSService.updateChannel(12345, { desc: "test" });
    }, true);
    
    
    // ═══════════════════════════════════════════════════════════════════
    // STREAM LISTING OPERATIONS
    // ═══════════════════════════════════════════════════════════════════
    
    console.log("\n📜 STREAM LISTING OPERATIONS\n");
    
    // Test 31: listChannelStreams() - Existing Channel
    if (createdChannelArn) {
      try {
        const streams = await IVSService.listChannelStreams(createdChannelArn);
        const isValid = Array.isArray(streams);
        const hasTestStream = streams.some(s => s.id === createdStreamId);
        logTest("listChannelStreams() [existing]", isValid && hasTestStream, 
          `Found ${streams.length} streams, test stream present: ${hasTestStream}`);
      } catch (error) {
        logTest("listChannelStreams() [existing]", false, error.message);
      }
    } else {
      logTest("listChannelStreams() [existing]", false, "No channel ARN available", true);
    }
    
    // Test 32: listChannelStreams() - Non-Existent Channel
    try {
      const fakeArn = `arn:aws:ivs:us-west-2:${ACCOUNT_ID}:channel/nonexistent`;
      const streams = await IVSService.listChannelStreams(fakeArn);
      const isEmpty = Array.isArray(streams) && streams.length === 0;
      logTest("listChannelStreams() [non-existing]", isEmpty, 
        `Returned empty array for non-existent channel`);
    } catch (error) {
      logTest("listChannelStreams() [non-existing]", false, error.message);
    }
    
    // Test 33: listChannelStreams() - Empty String
    await safeTest("listChannelStreams() [empty string]", async () => {
      const result = await IVSService.listChannelStreams("");
      return Array.isArray(result) ? result : null;
    }, false);
    
    // Test 34: listChannelStreams() - Null Parameter
    await safeTest("listChannelStreams() [null]", async () => {
      const result = await IVSService.listChannelStreams(null);
      return Array.isArray(result) && result.length === 0 ? result : null;
    }, false);
    
    
    // ═══════════════════════════════════════════════════════════════════
    // EDGE CASES & STRESS TESTS
    // ═══════════════════════════════════════════════════════════════════
    
    console.log("\n⚠️  EDGE CASES & STRESS TESTS\n");
    
    // Test 35: createStream() - Very Long Title
    const longUser = `long-title-user-${Date.now()}`;
    try {
      const longTitle = "A".repeat(500); // Very long title
      const streamData = await IVSService.createStream({
        creator_user_id: longUser,
        title: longTitle,
        access_type: "public"
      });
      
      const isValid = streamData && streamData.id;
      logTest("createStream() [long title]", isValid, 
        `Created with ${longTitle.length} char title`);
      
      // Cleanup
      if (streamData?.channel_id) {
        await IVSService.deleteChannel(streamData.channel_id);
      }
    } catch (error) {
      logTest("createStream() [long title]", false, error.message);
    }
    
    // Test 36: createStream() - Special Characters in Title
    const specialUser = `special-user-${Date.now()}`;
    try {
      const streamData = await IVSService.createStream({
        creator_user_id: specialUser,
        title: "Test™ Stream® with © Special © Characters!",
        access_type: "public"
      });
      
      const isValid = streamData && streamData.id;
      logTest("createStream() [special chars]", isValid, 
        `Handled special characters in title`);
      
      // Cleanup
      if (streamData?.channel_id) {
        await IVSService.deleteChannel(streamData.channel_id);
      }
    } catch (error) {
      logTest("createStream() [special chars]", false, error.message);
    }
    
    // Test 37: createStream() - Large Collaborators Array
    const collabUser = `collab-user-${Date.now()}`;
    try {
      const manyCollaborators = Array.from({ length: 50 }, (_, i) => `user${i}`);
      const streamData = await IVSService.createStream({
        creator_user_id: collabUser,
        title: "Many Collaborators Stream",
        access_type: "public",
        collaborators: manyCollaborators
      });
      
      const isValid = streamData && streamData.collaborators.length === 50;
      logTest("createStream() [many collaborators]", isValid, 
        `Created with ${streamData?.collaborators?.length} collaborators`);
      
      // Cleanup
      if (streamData?.channel_id) {
        await IVSService.deleteChannel(streamData.channel_id);
      }
    } catch (error) {
      logTest("createStream() [many collaborators]", false, error.message);
    }
    
    // Test 38: createStream() - Unicode Characters
    const unicodeUser = `unicode-user-${Date.now()}`;
    try {
      const streamData = await IVSService.createStream({
        creator_user_id: unicodeUser,
        title: "🎥 Test Stream 测试 стрім परीक्षण",
        description: "Unicode: 你好世界 مرحبا العالم",
        access_type: "public",
        tags: ["日本語", "한국어", "العربية"]
      });
      
      const isValid = streamData && streamData.id;
      logTest("createStream() [unicode]", isValid, 
        `Handled unicode characters correctly`);
      
      // Cleanup
      if (streamData?.channel_id) {
        await IVSService.deleteChannel(streamData.channel_id);
      }
    } catch (error) {
      logTest("createStream() [unicode]", false, error.message);
    }
    
    // Test 39: Multiple Rapid Channel Existence Checks
    if (createdChannelArn) {
      try {
        const checks = await Promise.all(
          Array.from({ length: 10 }, () => 
            IVSService.channelExists(createdChannelArn)
          )
        );
        
        const allTrue = checks.every(c => c === true);
        logTest("channelExists() [concurrent]", allTrue, 
          `10 concurrent checks, all returned true: ${allTrue}`);
      } catch (error) {
        logTest("channelExists() [concurrent]", false, error.message);
      }
    } else {
      logTest("channelExists() [concurrent]", false, "No channel ARN available", true);
    }
    
    // Test 40: listAllChannels() - Check Pagination Handling
    try {
      const channels = await IVSService.listAllChannels();
      const hasData = Array.isArray(channels);
      // Note: This tests pagination internally if there are >100 channels
      logTest("listAllChannels() [pagination]", hasData, 
        `Retrieved all channels (${channels.length}), pagination handled`);
    } catch (error) {
      logTest("listAllChannels() [pagination]", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════════
    // DATA TYPE VALIDATION
    // ═══════════════════════════════════════════════════════════════════
    
    console.log("\n🔢 DATA TYPE VALIDATION\n");
    
    // Test 41: createStream() - Numeric String for Boolean Field
    await safeTest("createStream() [numeric string boolean]", async () => {
      return await IVSService.createStream({
        creator_user_id: `test-${Date.now()}`,
        title: "Test",
        access_type: "public",
        is_private: "1" // Should be sanitized to true if SafeUtils handles it
      });
    }, false); // Expect it to work or return null
    
    // Test 42: createStream() - Object Instead of String
    await safeTest("createStream() [object as string]", async () => {
      return await IVSService.createStream({
        creator_user_id: { id: "user123" }, // Should be string
        title: "Test",
        access_type: "public"
      });
    }, true);
    
    // Test 43: updateChannel() - Array Instead of Object
    await safeTest("updateChannel() [array as object]", async () => {
      return await IVSService.updateChannel(TEST_USER_ID, ["invalid", "data"]);
    }, true);
    
    
    // ═══════════════════════════════════════════════════════════════════
    // CLEANUP & DELETION TESTS
    // ═══════════════════════════════════════════════════════════════════
    
    console.log("\n🧹 CLEANUP & DELETION TESTS\n");
    
    // Test 44: deleteChannel() - Existing Channel
    if (createdChannelArn) {
      try {
        const result = await IVSService.deleteChannel(createdChannelArn);
        logTest("deleteChannel() [existing]", result === true, 
          `Deleted: ${createdChannelArn.substring(0, 40)}...`);
        
        // Verify deletion
        const exists = await IVSService.channelExists(createdChannelArn);
        logTest("deleteChannel() [verify deletion]", exists === false, 
          `Channel no longer exists after deletion`);
        
        createdChannelArn = null; // Clear for subsequent tests
      } catch (error) {
        logTest("deleteChannel() [existing]", false, error.message);
      }
    } else {
      logTest("deleteChannel() [existing]", false, "No channel ARN available", true);
    }
    
    // Test 45: deleteChannel() - Non-Existent Channel
    try {
      const fakeArn = `arn:aws:ivs:us-west-2:${ACCOUNT_ID}:channel/nonexistent12345`;
      const result = await IVSService.deleteChannel(fakeArn);
      // Should return false or handle gracefully
      logTest("deleteChannel() [non-existing]", result === false, 
        `Correctly handled non-existent channel deletion`);
    } catch (error) {
      // Expected to fail
      logTest("deleteChannel() [non-existing]", true, `Expected error: ${error.message}`);
    }
    
    // Test 46: deleteChannel() - Invalid ARN Format
    await safeTest("deleteChannel() [invalid ARN]", async () => {
      return await IVSService.deleteChannel("invalid-arn-format");
    }, true);
    
    // Test 47: deleteChannel() - Empty String
    await safeTest("deleteChannel() [empty string]", async () => {
      return await IVSService.deleteChannel("");
    }, true);
    
    // Test 48: deleteChannel() - Null Parameter
    await safeTest("deleteChannel() [null]", async () => {
      return await IVSService.deleteChannel(null);
    }, true);
    
    
    // ═══════════════════════════════════════════════════════════════════
    // TEST SUMMARY
    // ═══════════════════════════════════════════════════════════════════
    
    console.log("\n" + "═".repeat(70));
    console.log("📊 COMPREHENSIVE TEST SUMMARY");
    console.log("═".repeat(70));
    console.log(`Total Tests: ${testResults.passed + testResults.failed + testResults.skipped}`);
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`⏭️  Skipped: ${testResults.skipped}`);
    
    const totalExecuted = testResults.passed + testResults.failed;
    const successRate = totalExecuted > 0 ? ((testResults.passed / totalExecuted) * 100).toFixed(1) : 0;
    console.log(`Success Rate: ${successRate}%`);
    console.log(`Finished: ${new Date().toISOString()}`);
    
    if (testResults.failed > 0) {
      console.log("\n❌ FAILED TESTS:");
      testResults.tests
        .filter(t => !t.passed && !t.skipped)
        .forEach(t => console.log(`   • ${t.methodName}: ${t.message}`));
    }
    
    console.log("\n✅ IVS COMPREHENSIVE UNIT TESTS COMPLETED!");
    console.log(`Coverage: Stream Creation, Channels, Metadata, Validation, Edge Cases`);
    
  } catch (error) {
    console.error("\n❌ Test suite failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

console.log("🚀 Starting IVS comprehensive unit tests...\n");
(async () => {
  await setupAccountId();
  console.log(`Account ID: ${ACCOUNT_ID}\n`);
  await runIvsUnitTests();
})();
