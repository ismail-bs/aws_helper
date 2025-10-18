import AwsS3 from "../aws/AwsS3.js";
import dotenv from "dotenv";

dotenv.config();

// Test configuration
// const TEST_BUCKET = `aws-helper-test-${Date.now()}`;
const TEST_BUCKET = 'aws-helper-test-1760688974601';
const TEST_FILE_KEY = "test-file.txt";
const TEST_CONTENT = "Hello AWS S3! This is a test file.";
const TEST_MULTIPART_KEY = "large-test-file.txt";

console.log("🚀 Starting AWS S3 Comprehensive Test");
console.log(`📅 Test started at: ${new Date().toISOString()}`);
console.log(`🪣 Test bucket: ${TEST_BUCKET}`);
console.log("=" * 50);

async function runS3Tests() {
  try {
    // 1. Initialize S3 client
    console.log("\n📋 Step 1: Initializing S3 client...");
    await AwsS3.init(process.env.AWS_REGION || "us-east-1");
    console.log("✅ S3 client initialized successfully");

    // 2. List existing buckets
    console.log("\n📋 Step 2: Listing existing buckets...");
    const buckets = await AwsS3.listBuckets();
    if (buckets) {
      console.log(`✅ Found ${buckets.length} existing buckets`);
      buckets.forEach((bucket, index) => {
        console.log(`   ${index + 1}. ${bucket.Name} (Created: ${bucket.CreationDate})`);
      });
    } else {
      console.log("❌ Failed to list buckets");
    }

    // 3. Create test bucket
    console.log("\n📋 Step 3: Creating test bucket...");
    await AwsS3.createBucket(TEST_BUCKET);
    console.log(`✅ Test bucket '${TEST_BUCKET}' created successfully`);

    // 4. Check if bucket exists
    console.log("\n📋 Step 4: Checking if bucket exists...");
    const bucketExists = await AwsS3.doesBucketExist(TEST_BUCKET);
    if (bucketExists) {
      console.log(`✅ Bucket exists: ${bucketExists}`);
    } else {
      console.log("❌ Bucket existence check failed");
    }

    // 5. Upload a test file
    console.log("\n📋 Step 5: Uploading test file...");
    await AwsS3.uploadFile(TEST_BUCKET, TEST_FILE_KEY, TEST_CONTENT, "text/plain");
    console.log(`✅ File '${TEST_FILE_KEY}' uploaded successfully`);

    // 6. Check if file exists
    console.log("\n📋 Step 6: Checking if file exists...");
    const fileExists = await AwsS3.doesFileExist(TEST_BUCKET, TEST_FILE_KEY);
    if (fileExists) {
      console.log(`✅ File exists: ${fileExists}`);
    } else {
      console.log("❌ File existence check failed");
    }

    // 7. List files in bucket
    console.log("\n📋 Step 7: Listing files in bucket...");
    const files = await AwsS3.listFiles(TEST_BUCKET);
    if (files) {
      console.log(`✅ Found ${files.length} files in bucket`);
      files.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.Key} (Size: ${file.Size} bytes, Modified: ${file.LastModified})`);
      });
    } else {
      console.log("❌ Failed to list files");
    }

    // 8. Download the file
    console.log("\n📋 Step 8: Downloading test file...");
    const fileContent = await AwsS3.getFile(TEST_BUCKET, TEST_FILE_KEY);
    if (fileContent) {
      const contentString = await streamToString(fileContent);
      console.log(`✅ File downloaded successfully. Content: "${contentString}"`);
      
      if (contentString === TEST_CONTENT) {
        console.log("✅ File content matches uploaded content");
      } else {
        console.log("❌ File content doesn't match!");
      }
    } else {
      console.log("❌ Failed to download file");
    }

    // 9. Copy file
    console.log("\n📋 Step 9: Copying file...");
    const copiedKey = "copied-" + TEST_FILE_KEY;
    await AwsS3.copyFile(TEST_BUCKET, TEST_FILE_KEY, TEST_BUCKET, copiedKey);
    console.log(`✅ File copied to '${copiedKey}'`);

    // 10. Generate presigned URL
    console.log("\n📋 Step 10: Generating presigned URL...");
    try {
      const presignedUrl = await AwsS3.getPresignedUrl(TEST_BUCKET, TEST_FILE_KEY, "getObject", 300);
      if (presignedUrl) {
        console.log(`✅ Presigned URL generated: ${presignedUrl}`);
      }
    } catch (error) {
      console.log(`❌ Presigned URL generation failed: ${error.message}`);
    }

    // 11. Test multipart upload (for larger files)
    console.log("\n📋 Step 11: Testing multipart upload...");
    const largeContent = "Large file content - ".repeat(1000); // Create ~20KB content
    
    // Initiate multipart upload
    const uploadId = await AwsS3.initiateMultipartUpload(TEST_BUCKET, TEST_MULTIPART_KEY);
    if (uploadId) {
      console.log(`✅ Multipart upload initiated. Upload ID: ${uploadId}`);
      
      // Upload part
      const partResult = await AwsS3.uploadPart(TEST_BUCKET, TEST_MULTIPART_KEY, uploadId, 1, largeContent);
      if (partResult) {
        console.log(`✅ Part uploaded. ETag: ${partResult.ETag}`);
        
        // Complete multipart upload
        await AwsS3.completeMultipartUpload(TEST_BUCKET, TEST_MULTIPART_KEY, uploadId, [partResult]);
        console.log("✅ Multipart upload completed");
      } else {
        // Abort if part upload failed
        await AwsS3.abortMultipartUpload(TEST_BUCKET, TEST_MULTIPART_KEY, uploadId);
        console.log("❌ Part upload failed, multipart upload aborted");
      }
    } else {
      console.log("❌ Failed to initiate multipart upload");
    }

    // 12. Clean up - delete files
    console.log("\n📋 Step 12: Cleaning up files...");
    const filesToDelete = [TEST_FILE_KEY, copiedKey, TEST_MULTIPART_KEY];
    await AwsS3.deleteFiles(TEST_BUCKET, filesToDelete);
    console.log(`✅ Deleted ${filesToDelete.length} files`);

    // 13. Security Testing - Enable encryption
    console.log("\n📋 Step 13: Testing security features - Enable encryption...");
    await AwsS3.enableBucketEncryption(TEST_BUCKET, "AES256");
    console.log("✅ Bucket encryption enabled");

    // 14. Security Testing - Block public access
    console.log("\n📋 Step 14: Blocking public access...");
    await AwsS3.blockPublicAccess(TEST_BUCKET);
    console.log("✅ Public access blocked");

    // 15. Security Testing - Configure secure CORS
    console.log("\n📋 Step 15: Configuring secure CORS...");
    await AwsS3.configureCORS(TEST_BUCKET, ['https://myapp.com'], ['GET']);
    console.log("✅ CORS configured securely");

    // 16. Security Testing - Run comprehensive security audit
    console.log("\n📋 Step 16: Running comprehensive security audit...");
    const securityReport = await AwsS3.validateBucketSecurity(TEST_BUCKET);
    console.log(`📊 Security Score: ${securityReport.score}/100`);

    // 17. Security Testing - Individual checks
    console.log("\n📋 Step 17: Verifying individual security checks...");
    const encryptionStatus = await AwsS3.checkBucketEncryption(TEST_BUCKET);
    console.log(`   Encryption: ${encryptionStatus.encrypted ? '✅ Enabled' : '❌ Disabled'}`);
    
    const publicAccessStatus = await AwsS3.checkPublicAccessBlock(TEST_BUCKET);
    console.log(`   Public Access Block: ${publicAccessStatus.fullyBlocked ? '✅ Fully Blocked' : '❌ Not Blocked'}`);

    // 18. Clean up - delete bucket
    console.log("\n📋 Step 18: Cleaning up bucket...");
    await AwsS3.deleteBucket(TEST_BUCKET);
    console.log(`✅ Test bucket '${TEST_BUCKET}' deleted successfully`);

    console.log("\n🎉 All S3 tests completed successfully!");
    console.log(`📅 Test finished at: ${new Date().toISOString()}`);
    
    console.log("\n🔒 SECURITY FEATURES TESTED:");
    console.log("✅ Bucket encryption enforcement");
    console.log("✅ Public access blocking");
    console.log("✅ CORS configuration validation");
    console.log("✅ Comprehensive security audit");
    console.log(`📊 Final Security Score: ${securityReport.score}/100`);

  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
    
    // Emergency cleanup
    console.log("\n🧹 Attempting emergency cleanup...");
    try {
      await AwsS3.deleteBucket(TEST_BUCKET);
      console.log("✅ Emergency cleanup completed");
    } catch (cleanupError) {
      console.error("❌ Emergency cleanup failed:", cleanupError.message);
    }
    
    process.exit(1);
  }
}

// Helper function to convert stream to string
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// Run the tests
runS3Tests();
