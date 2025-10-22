import AwsS3 from "../aws/AwsS3.js";
import dotenv from "dotenv";

dotenv.config();

// Test configuration
const TEST_BUCKET = `aws-helper-test-${Date.now()}`;
const TEST_FILE_KEY = "test-file.txt";
const TEST_CONTENT = "Hello AWS S3! This is a test file.";
const TEST_MULTIPART_KEY = "large-test-file.txt";

console.log("Starting AWS S3 Test");
console.log(`Test bucket: ${TEST_BUCKET}\n`);

async function runS3Tests() {
  try {
    // Initialize S3 client
    await AwsS3.init(process.env.AWS_REGION || "us-east-1");
    console.log("✅ S3 client initialized");

    // List existing buckets
    const buckets = await AwsS3.listBuckets();
    buckets ? console.log(`✅ Found ${buckets.length} buckets`) : console.log("❌ Failed to list buckets");

    // Create test bucket
    await AwsS3.createBucket(TEST_BUCKET);
    console.log(`✅ Bucket created: ${TEST_BUCKET}`);

    // Check if bucket exists
    const bucketExists = await AwsS3.doesBucketExist(TEST_BUCKET);
    bucketExists ? console.log("✅ Bucket exists") : console.log("❌ Bucket check failed");

    // Upload test file
    await AwsS3.uploadFile(TEST_BUCKET, TEST_FILE_KEY, TEST_CONTENT, "text/plain");
    console.log(`✅ File uploaded: ${TEST_FILE_KEY}`);

    // Check if file exists
    const fileExists = await AwsS3.doesFileExist(TEST_BUCKET, TEST_FILE_KEY);
    fileExists ? console.log("✅ File exists") : console.log("❌ File check failed");

    // List files in bucket
    const files = await AwsS3.listFiles(TEST_BUCKET);
    files ? console.log(`✅ Found ${files.length} files`) : console.log("❌ Failed to list files");

    // Download file
    const fileContent = await AwsS3.getFile(TEST_BUCKET, TEST_FILE_KEY);
    if (fileContent) {
      const contentString = await streamToString(fileContent);
      contentString === TEST_CONTENT ? console.log("✅ File downloaded and content matches") : console.log("❌ Content mismatch");
    } else {
      console.log("❌ Download failed");
    }

    // Copy file
    const copiedKey = "copied-" + TEST_FILE_KEY;
    await AwsS3.copyFile(TEST_BUCKET, TEST_FILE_KEY, TEST_BUCKET, copiedKey);
    console.log(`✅ File copied`);

    // Generate presigned URL
    try {
      const presignedUrl = await AwsS3.getPresignedUrl(TEST_BUCKET, TEST_FILE_KEY, "getObject", 300);
      presignedUrl ? console.log("✅ Presigned URL generated") : console.log("❌ URL generation failed");
    } catch (error) {
      console.log(`❌ URL generation failed: ${error.message}`);
    }

    // Test multipart upload
    const largeContent = "Large file content - ".repeat(1000);
    const uploadId = await AwsS3.initiateMultipartUpload(TEST_BUCKET, TEST_MULTIPART_KEY);
    if (uploadId) {
      const partResult = await AwsS3.uploadPart(TEST_BUCKET, TEST_MULTIPART_KEY, uploadId, 1, largeContent);
      if (partResult) {
        await AwsS3.completeMultipartUpload(TEST_BUCKET, TEST_MULTIPART_KEY, uploadId, [partResult]);
        console.log("✅ Multipart upload completed");
      } else {
        await AwsS3.abortMultipartUpload(TEST_BUCKET, TEST_MULTIPART_KEY, uploadId);
        console.log("❌ Multipart upload failed");
      }
    } else {
      console.log("❌ Multipart upload initiation failed");
    }

    // Delete files
    const filesToDelete = [TEST_FILE_KEY, copiedKey, TEST_MULTIPART_KEY];
    await AwsS3.deleteFiles(TEST_BUCKET, filesToDelete);
    console.log(`✅ Deleted ${filesToDelete.length} files`);

    // Enable encryption
    await AwsS3.enableBucketEncryption(TEST_BUCKET, "AES256");
    console.log("✅ Encryption enabled");

    // Block public access
    await AwsS3.blockPublicAccess(TEST_BUCKET);
    console.log("✅ Public access blocked");

    // Configure CORS
    await AwsS3.configureCORS(TEST_BUCKET, ['https://myapp.com'], ['GET']);
    console.log("✅ CORS configured");

    // Security audit
    const securityReport = await AwsS3.validateBucketSecurity(TEST_BUCKET);
    console.log(`Security Score: ${securityReport.score}/100`);

    // Security checks
    const encryptionStatus = await AwsS3.checkBucketEncryption(TEST_BUCKET);
    console.log(`Encryption: ${encryptionStatus.encrypted ? '✅' : '❌'}`);
    const publicAccessStatus = await AwsS3.checkPublicAccessBlock(TEST_BUCKET);
    console.log(`Public Access Block: ${publicAccessStatus.fullyBlocked ? '✅' : '❌'}`);

    // Delete bucket
    await AwsS3.deleteBucket(TEST_BUCKET);
    console.log(`✅ Bucket deleted`);

    console.log(`\n✅ S3 tests completed | Security Score: ${securityReport.score}/100`);

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    try {
      await AwsS3.deleteBucket(TEST_BUCKET);
      console.log("✅ Cleanup completed");
    } catch (cleanupError) {
      console.error("❌ Cleanup failed:", cleanupError.message);
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
