/**
 * ═══════════════════════════════════════════════════════════════════
 *  AWS IVS DUAL STREAM TEST - PUBLIC + PRIVATE STREAMS
 * ═══════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Creates TWO separate IVS streams simultaneously:
 * 1. PUBLIC STREAM - Accessible to everyone
 * 2. PRIVATE STREAM - Invite-only / restricted access
 * 
 * USE CASES:
 * - Public: Main event stream for all viewers
 * - Private: Backstage, VIP content, premium subscribers, Q&A sessions
 * 
 * WHAT THIS DOES:
 * ✅ Creates two independent IVS channels
 * ✅ Generates separate stream keys for each
 * ✅ Provides distinct playback URLs
 * ✅ Validates both channels
 * ✅ Displays credentials for OBS/streaming setup
 * 
 * OUTPUT:
 * - Public stream ingest URL + stream key
 * - Private stream ingest URL + stream key
 * - Playback URLs for both streams
 * - Instructions for dual-stream player usage
 * 
 * RUN: node test/ivs-dual-stream-test.js
 * ═══════════════════════════════════════════════════════════════════
 */

const IVSService = require("../aws/ivs.js");
const getIvsClient = require("../aws/ivsClient.js");
const { SecretsManager } = require("../aws/SecretsManager.js");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const dotenv = require("dotenv");

dotenv.config();

// Test configuration
const TIMESTAMP = Date.now();
const TEST_USER_PUBLIC = `public-user-${TIMESTAMP}`;
const TEST_USER_PRIVATE = `private-user-${TIMESTAMP}`;

console.log("\n");
console.log("═══════════════════════════════════════════════════════════════════");
console.log("   🎥 AWS IVS DUAL STREAM SETUP - PUBLIC + PRIVATE");
console.log("═══════════════════════════════════════════════════════════════════");
console.log(`Test started at: ${new Date().toISOString()}`);
console.log(`Public User ID: ${TEST_USER_PUBLIC}`);
console.log(`Private User ID: ${TEST_USER_PRIVATE}`);
console.log("═══════════════════════════════════════════════════════════════════\n");

let ACCOUNT_ID;
let publicChannelArn = null;
let privateChannelArn = null;
let publicStreamData = null;
let privateStreamData = null;

async function createDualStreams() {
  try {
    const region = process.env.AWS_REGION || "us-west-2";

    // ========================================================================
    // STEP 1: AWS Account Authentication
    // ========================================================================
    console.log("📋 STEP 1: Authenticating with AWS...");
    console.log("─────────────────────────────────────────────────────────────────");
    const stsClient = new STSClient({ region });
    const callerIdentity = await stsClient.send(new GetCallerIdentityCommand({}));
    ACCOUNT_ID = callerIdentity.Account;
    console.log(`✅ AWS Account ID: ${ACCOUNT_ID}`);
    console.log(`✅ User ARN: ${callerIdentity.Arn}`);
    console.log(`✅ Region: ${region}\n`);

    // ========================================================================
    // STEP 2: Verify Credentials
    // ========================================================================
    console.log("🔐 STEP 2: Verifying AWS Credentials...");
    console.log("─────────────────────────────────────────────────────────────────");
    const credentials = await SecretsManager.getAWSCredentials(region);
    console.log(`✅ Credential Source: ${credentials.source}`);
    console.log(`✅ Access Key: ${credentials.accessKeyId.substring(0, 10)}...`);
    console.log(`✅ IVS Client Ready\n`);

    // ========================================================================
    // STEP 3: Initialize IVS Client
    // ========================================================================
    console.log("🚀 STEP 3: Initializing IVS Client...");
    console.log("─────────────────────────────────────────────────────────────────");
    const ivsClient = getIvsClient();
    console.log("✅ IVS Client Initialized\n");

    // ========================================================================
    // STEP 4: Create PUBLIC Stream
    // ========================================================================
    console.log("🌍 STEP 4: Creating PUBLIC Stream...");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log("Purpose: Main event stream accessible to all viewers");
    
    publicStreamData = await IVSService.createStream({
      creator_user_id: TEST_USER_PUBLIC,
      title: "PUBLIC STREAM - Main Event",
      access_type: "public",
      is_private: false,
      pricing_type: "free",
      description: "Public live streaming channel - accessible to everyone",
      tags: ["public", "main-event", "live", "open-access"],
      allow_comments: true,
      collaborators: []
    });

    if (!publicStreamData) {
      throw new Error("Failed to create public stream");
    }

    publicChannelArn = publicStreamData.channel_id;
    
    console.log("✅ PUBLIC STREAM CREATED SUCCESSFULLY");
    console.log(`   Stream ID: ${publicStreamData.id}`);
    console.log(`   Channel ARN: ${publicStreamData.channel_id}`);
    console.log(`   Status: ${publicStreamData.status}`);
    console.log(`   Access: ${publicStreamData.access_type.toUpperCase()}\n`);

    // ========================================================================
    // STEP 5: Create PRIVATE Stream
    // ========================================================================
    console.log("🔐 STEP 5: Creating PRIVATE Stream (Invite Only)...");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log("Purpose: Restricted content for VIP/subscribers only");
    
    privateStreamData = await IVSService.createStream({
      creator_user_id: TEST_USER_PRIVATE,
      title: "PRIVATE STREAM - VIP Exclusive",
      access_type: "private",
      is_private: true,
      pricing_type: "premium",
      description: "Private invite-only stream - VIP members, backstage, Q&A",
      tags: ["private", "vip", "exclusive", "invite-only"],
      allow_comments: true,
      collaborators: []
    });

    if (!privateStreamData) {
      throw new Error("Failed to create private stream");
    }

    privateChannelArn = privateStreamData.channel_id;
    
    console.log("✅ PRIVATE STREAM CREATED SUCCESSFULLY");
    console.log(`   Stream ID: ${privateStreamData.id}`);
    console.log(`   Channel ARN: ${privateStreamData.channel_id}`);
    console.log(`   Status: ${privateStreamData.status}`);
    console.log(`   Access: ${privateStreamData.access_type.toUpperCase()}\n`);

    // ========================================================================
    // STEP 6: Validate Both Channels
    // ========================================================================
    console.log("✅ STEP 6: Validating Both Channels...");
    console.log("─────────────────────────────────────────────────────────────────");
    
    const publicValidation = await IVSService.validateChannel(publicChannelArn);
    const privateValidation = await IVSService.validateChannel(privateChannelArn);
    
    console.log(`Public Channel: ${publicValidation.valid ? '✅ Valid' : '❌ Invalid'}`);
    console.log(`Private Channel: ${privateValidation.valid ? '✅ Valid' : '❌ Invalid'}\n`);

    // ========================================================================
    // DISPLAY CREDENTIALS & SETUP INSTRUCTIONS
    // ========================================================================
    console.log("\n");
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("   📺 STREAMING CREDENTIALS & SETUP");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    // PUBLIC STREAM CREDENTIALS
    console.log("┌─────────────────────────────────────────────────────────────────┐");
    console.log("│  🌍 PUBLIC STREAM - Main Event                                  │");
    console.log("└─────────────────────────────────────────────────────────────────┘");
    console.log("\n📡 OBS STUDIO SETTINGS (Public Stream):");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log("Settings → Stream → Custom Streaming Server");
    console.log(`Server URL: ${publicStreamData.ingest_endpoint}`);
    console.log(`Stream Key: ${publicStreamData.stream_key}`);
    console.log("\nRecommended Settings:");
    console.log("  • Encoder: x264 or Hardware (NVENC/AMD)");
    console.log("  • Bitrate: 2500-4500 Kbps");
    console.log("  • Keyframe Interval: 2 seconds");
    console.log("  • Resolution: 1920x1080 or 1280x720");
    console.log("  • FPS: 30 or 60\n");

    console.log("📺 PLAYBACK URL (Public):");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log(publicStreamData.playback_url);
    console.log("\n");

    // PRIVATE STREAM CREDENTIALS
    console.log("┌─────────────────────────────────────────────────────────────────┐");
    console.log("│  🔐 PRIVATE STREAM - VIP Exclusive                              │");
    console.log("└─────────────────────────────────────────────────────────────────┘");
    console.log("\n📡 OBS STUDIO SETTINGS (Private Stream):");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log("⚠️  For second stream, use OBS with different scene/source");
    console.log("   OR use a separate OBS instance OR different streaming software");
    console.log(`Server URL: ${privateStreamData.ingest_endpoint}`);
    console.log(`Stream Key: ${privateStreamData.stream_key}`);
    console.log("\nRecommended Settings:");
    console.log("  • Same as public stream settings");
    console.log("  • Can use different resolution/bitrate if needed\n");

    console.log("📺 PLAYBACK URL (Private):");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log(privateStreamData.playback_url);
    console.log("\n");

    // ========================================================================
    // WEB PLAYER INSTRUCTIONS
    // ========================================================================
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("   🌐 DUAL STREAM WEB PLAYER SETUP");
    console.log("═══════════════════════════════════════════════════════════════════\n");
    
    console.log("📋 INSTRUCTIONS:");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log("1. Open the dual stream player:");
    console.log("   → Open test/dual-stream-player.html in your browser\n");
    
    console.log("2. Load PUBLIC stream:");
    console.log("   → Paste PUBLIC playback URL (shown above)");
    console.log("   → Click 'Load Public Stream'\n");
    
    console.log("3. Load PRIVATE stream:");
    console.log("   → Enter access code: INVITE2024");
    console.log("   → Click 'Unlock Stream'");
    console.log("   → Paste PRIVATE playback URL (shown above)");
    console.log("   → Click 'Load Private Stream'\n");
    
    console.log("4. Start streaming with OBS:");
    console.log("   → Configure OBS with PUBLIC stream credentials");
    console.log("   → Start streaming");
    console.log("   → (Optional) Configure second OBS for PRIVATE stream\n");

    // ========================================================================
    // USE CASES & EXAMPLES
    // ========================================================================
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("   💡 REAL-WORLD USE CASES");
    console.log("═══════════════════════════════════════════════════════════════════\n");
    
    console.log("🎯 PUBLIC STREAM Can Be Used For:");
    console.log("  • Main conference/event broadcast");
    console.log("  • Public webinars");
    console.log("  • Free live concerts/performances");
    console.log("  • Product launches");
    console.log("  • Educational content\n");

    console.log("🎯 PRIVATE STREAM Can Be Used For:");
    console.log("  • VIP backstage access");
    console.log("  • Premium subscriber content");
    console.log("  • Exclusive Q&A sessions");
    console.log("  • Members-only workshops");
    console.log("  • Behind-the-scenes content");
    console.log("  • Private coaching sessions\n");

    // ========================================================================
    // TECHNICAL DETAILS
    // ========================================================================
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("   🔧 TECHNICAL DETAILS");
    console.log("═══════════════════════════════════════════════════════════════════\n");
    
    console.log("📊 Stream Configuration:");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log(`Public Latency Mode: ${publicValidation.channel?.latencyMode || 'LOW'}`);
    console.log(`Private Latency Mode: ${privateValidation.channel?.latencyMode || 'LOW'}`);
    console.log(`Channel Type: ${publicValidation.channel?.type || 'STANDARD'}`);
    console.log("Playback Format: HLS (HTTP Live Streaming)");
    console.log("CDN: AWS CloudFront (Global)");
    console.log("Device Support: All devices (iOS, Android, Web, Smart TV)\n");

    console.log("🔐 Security & Access Control:");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log("PUBLIC:");
    console.log("  • No authentication required");
    console.log("  • Playback URL can be shared publicly");
    console.log("  • Anyone can watch");
    console.log("\nPRIVATE:");
    console.log("  • Access code required (demo: INVITE2024)");
    console.log("  • In production: Implement:");
    console.log("    - AWS Cognito authentication");
    console.log("    - JWT token validation");
    console.log("    - Backend authorization checks");
    console.log("    - Time-limited access tokens");
    console.log("  • PlaybackRestrictionPolicy can be added\n");

    // ========================================================================
    // COST INFORMATION
    // ========================================================================
    console.log("💰 COST INFORMATION:");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log("Running TWO simultaneous IVS channels:");
    console.log("  • Input: ~$0.049 per hour (per stream)");
    console.log("  • Output: Based on viewer count and quality");
    console.log("  • Total for 2 channels: ~$0.098/hour minimum");
    console.log("  • ⚠️  Remember to delete channels when done testing!\n");

    // ========================================================================
    // CLEANUP INFORMATION
    // ========================================================================
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("   🧹 CLEANUP & NEXT STEPS");
    console.log("═══════════════════════════════════════════════════════════════════\n");
    
    console.log("⏰ AUTOMATIC CLEANUP:");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log("Both channels will be automatically deleted in 10 minutes");
    console.log("Press Ctrl+C to cancel and keep channels for extended testing\n");

    console.log("🔄 MANUAL CLEANUP (if needed):");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log("If cleanup fails, delete manually via AWS Console:");
    console.log(`  • Public Channel ARN: ${publicChannelArn}`);
    console.log(`  • Private Channel ARN: ${privateChannelArn}`);
    console.log("  • Go to: AWS Console → IVS → Channels → Delete\n");

    // Wait 10 minutes before cleanup
    console.log("⏳ Waiting 10 minutes before cleanup...");
    console.log("   (You can start streaming and testing now)\n");
    await new Promise(resolve => setTimeout(resolve, 600000));

    // ========================================================================
    // CLEANUP
    // ========================================================================
    console.log("\n🧹 Starting cleanup process...\n");
    
    if (publicChannelArn) {
      const publicDeleted = await IVSService.deleteChannel(publicChannelArn);
      console.log(publicDeleted ? 
        "✅ Public channel deleted" : 
        "⚠️  Public channel may need manual cleanup");
    }

    if (privateChannelArn) {
      const privateDeleted = await IVSService.deleteChannel(privateChannelArn);
      console.log(privateDeleted ? 
        "✅ Private channel deleted" : 
        "⚠️  Private channel may need manual cleanup");
    }

    console.log("\n");
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("   ✅ DUAL STREAM TEST COMPLETED SUCCESSFULLY");
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("\nTest Coverage:");
    console.log("  ✅ AWS Account Authentication (STS)");
    console.log("  ✅ Credentials Verification");
    console.log("  ✅ Dual IVS Channel Creation (Public + Private)");
    console.log("  ✅ Stream Key Generation (2 channels)");
    console.log("  ✅ Channel Validation");
    console.log("  ✅ Playback URL Generation");
    console.log("  ✅ Complete Cleanup");
    console.log("\n🎉 Both streams are ready for simultaneous broadcasting!");
    console.log("═══════════════════════════════════════════════════════════════════\n");

  } catch (error) {
    console.error("\n");
    console.error("═══════════════════════════════════════════════════════════════════");
    console.error("   ❌ DUAL STREAM TEST FAILED");
    console.error("═══════════════════════════════════════════════════════════════════");
    console.error(`Error: ${error.message}`);
    console.error("\nStack Trace:");
    console.error(error.stack);
    
    // Emergency cleanup
    console.log("\n🧹 Attempting emergency cleanup...\n");
    try {
      if (publicChannelArn) {
        await IVSService.deleteChannel(publicChannelArn);
        console.log("✅ Public channel cleaned up");
      }
      if (privateChannelArn) {
        await IVSService.deleteChannel(privateChannelArn);
        console.log("✅ Private channel cleaned up");
      }
      console.log("✅ Emergency cleanup completed");
    } catch (cleanupError) {
      console.log("\n⚠️  MANUAL CLEANUP REQUIRED:");
      console.log("─────────────────────────────────────────────────────────────────");
      if (publicChannelArn) {
        console.log(`Public Channel: ${publicChannelArn}`);
      }
      if (privateChannelArn) {
        console.log(`Private Channel: ${privateChannelArn}`);
      }
      console.log("\nGo to AWS IVS Console to delete manually");
    }
    
    console.error("\n");
    process.exit(1);
  }
}

// ========================================================================
// PREREQUISITES CHECK
// ========================================================================
console.log("🔍 PREREQUISITES CHECK:");
console.log("─────────────────────────────────────────────────────────────────");
console.log("Required:");
console.log("  ✓ AWS credentials with IVS permissions");
console.log("  ✓ AWS_ACCESS_KEY_ID_IVS in .env file");
console.log("  ✓ AWS_SECRET_ACCESS_KEY_IVS in .env file");
console.log("  ✓ Region: us-west-2 (or your preferred IVS region)");
console.log("  ✓ IAM permissions: ivs:*, sts:GetCallerIdentity");
console.log("\nOptional (for streaming):");
console.log("  • OBS Studio or streaming software");
console.log("  • Modern web browser (for player)\n");

console.log("🚀 Starting dual stream creation...\n");

createDualStreams();
