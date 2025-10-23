/**
 * ═══════════════════════════════════════════════════════════════════
 *  AWS S3 UNIT TESTS - PER-METHOD TESTING
 * ═══════════════════════════════════════════════════════════════════
 * 
 * WHAT THIS TESTS:
 * ────────────────
 * Each S3 method individually with simple inputs/outputs
 * No complex workflows - just method validation
 * 
 * METHODS TESTED:
 * ───────────────
 * ✅ createBucket()
 * ✅ deleteBucket()
 * ✅ listBuckets()
 * ✅ uploadFile()
 * ✅ downloadFile()
 * ✅ deleteFile()
 * ✅ deleteFiles()
 * ✅ listFiles()
 * ✅ getFileMetadata()
 * ✅ copyFile()
 * ✅ generatePresignedUrl()
 * ✅ enableBucketVersioning()
 * ✅ enableBucketEncryption()
 * ✅ blockPublicAccess()
 * ✅ setBucketCors()
 * ✅ setBucketLifecycle()
 * ✅ initiateMultipartUpload()
 * ✅ uploadPart()
 * ✅ completeMultipartUpload()
 * ✅ abortMultipartUpload()
 * 
 * RUN: node test/s3-unit-test.js
 * ═══════════════════════════════════════════════════════════════════
 */

import AwsS3 from "../aws/s3.js";
import dotenv from "dotenv";

dotenv.config();

const TEST_BUCKET = `unit-test-bucket-${Date.now()}`;
const TEST_FILE_KEY = "unit-test-file.txt";
const TEST_CONTENT = "Unit test content";

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

console.log("🧪 AWS S3 UNIT TESTS - PER-METHOD TESTING");
console.log("═".repeat(60));
console.log(`Test Bucket: ${TEST_BUCKET}`);
console.log(`Started: ${new Date().toISOString()}\n`);

async function runS3UnitTests() {
  try {
    
    // ═══════════════════════════════════════════════════════════════
    // BUCKET OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    
    console.log("📦 BUCKET OPERATIONS\n");
    
    // Test 1: createBucket()
    try {
      const result = await AwsS3.createBucket(TEST_BUCKET);
      logTest("createBucket()", result === true, `Bucket: ${TEST_BUCKET}`);
    } catch (error) {
      logTest("createBucket()", false, error.message);
    }
    
    // Test 2: listBuckets()
    try {
      const buckets = await AwsS3.listBuckets();
      const found = buckets.some(b => b.Name === TEST_BUCKET);
      logTest("listBuckets()", found, `Found ${buckets.length} buckets, test bucket exists: ${found}`);
    } catch (error) {
      logTest("listBuckets()", false, error.message);
    }
    
    // Test 3: enableBucketVersioning()
    try {
      const result = await AwsS3.enableBucketVersioning(TEST_BUCKET);
      logTest("enableBucketVersioning()", result === true, "Versioning enabled");
    } catch (error) {
      logTest("enableBucketVersioning()", false, error.message);
    }
    
    // Test 4: enableBucketEncryption()
    try {
      const result = await AwsS3.enableBucketEncryption(TEST_BUCKET, "AES256");
      logTest("enableBucketEncryption()", result === true, "AES256 encryption enabled");
    } catch (error) {
      logTest("enableBucketEncryption()", false, error.message);
    }
    
    // Test 5: blockPublicAccess()
    try {
      const result = await AwsS3.blockPublicAccess(TEST_BUCKET);
      logTest("blockPublicAccess()", result === true, "Public access blocked");
    } catch (error) {
      logTest("blockPublicAccess()", false, error.message);
    }
    
    // Test 6: setBucketCors()
    try {
      const corsRules = [{
        AllowedOrigins: ["*"],
        AllowedMethods: ["GET", "PUT"],
        AllowedHeaders: ["*"],
        MaxAgeSeconds: 3000
      }];
      const result = await AwsS3.setBucketCors(TEST_BUCKET, corsRules);
      logTest("setBucketCors()", result === true, "CORS configured");
    } catch (error) {
      logTest("setBucketCors()", false, error.message);
    }
    
    // Test 7: setBucketLifecycle()
    try {
      const lifecycleRules = [{
        Id: "DeleteOldFiles",
        Status: "Enabled",
        Expiration: { Days: 90 }
      }];
      const result = await AwsS3.setBucketLifecycle(TEST_BUCKET, lifecycleRules);
      logTest("setBucketLifecycle()", result === true, "Lifecycle policy set");
    } catch (error) {
      logTest("setBucketLifecycle()", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // FILE OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n📄 FILE OPERATIONS\n");
    
    // Test 8: uploadFile()
    try {
      const result = await AwsS3.uploadFile(TEST_BUCKET, TEST_FILE_KEY, TEST_CONTENT);
      logTest("uploadFile()", result === true, `Uploaded: ${TEST_FILE_KEY}`);
    } catch (error) {
      logTest("uploadFile()", false, error.message);
    }
    
    // Test 9: listFiles()
    try {
      const files = await AwsS3.listFiles(TEST_BUCKET);
      const found = files.some(f => f.Key === TEST_FILE_KEY);
      logTest("listFiles()", found, `Found ${files.length} files, test file exists: ${found}`);
    } catch (error) {
      logTest("listFiles()", false, error.message);
    }
    
    // Test 10: getFileMetadata()
    try {
      const metadata = await AwsS3.getFileMetadata(TEST_BUCKET, TEST_FILE_KEY);
      const hasSize = metadata && metadata.ContentLength > 0;
      logTest("getFileMetadata()", hasSize, `Size: ${metadata?.ContentLength} bytes`);
    } catch (error) {
      logTest("getFileMetadata()", false, error.message);
    }
    
    // Test 11: downloadFile()
    try {
      const content = await AwsS3.downloadFile(TEST_BUCKET, TEST_FILE_KEY);
      const matches = content === TEST_CONTENT;
      logTest("downloadFile()", matches, `Content matches: ${matches}`);
    } catch (error) {
      logTest("downloadFile()", false, error.message);
    }
    
    // Test 12: copyFile()
    try {
      const copiedKey = `${TEST_FILE_KEY}.copy`;
      const result = await AwsS3.copyFile(TEST_BUCKET, TEST_FILE_KEY, TEST_BUCKET, copiedKey);
      logTest("copyFile()", result === true, `Copied to: ${copiedKey}`);
      
      // Clean up copied file
      await AwsS3.deleteFile(TEST_BUCKET, copiedKey);
    } catch (error) {
      logTest("copyFile()", false, error.message);
    }
    
    // Test 13: generatePresignedUrl()
    try {
      const url = await AwsS3.generatePresignedUrl(TEST_BUCKET, TEST_FILE_KEY, 3600);
      const isValid = url && url.startsWith("https://");
      logTest("generatePresignedUrl()", isValid, `URL generated (expires in 3600s)`);
    } catch (error) {
      logTest("generatePresignedUrl()", false, error.message);
    }
    
    // Test 14: deleteFile()
    try {
      const result = await AwsS3.deleteFile(TEST_BUCKET, TEST_FILE_KEY);
      logTest("deleteFile()", result === true, `Deleted: ${TEST_FILE_KEY}`);
    } catch (error) {
      logTest("deleteFile()", false, error.message);
    }
    
    // Test 15: deleteFiles() - batch delete
    try {
      // Upload multiple files
      await AwsS3.uploadFile(TEST_BUCKET, "file1.txt", "content1");
      await AwsS3.uploadFile(TEST_BUCKET, "file2.txt", "content2");
      await AwsS3.uploadFile(TEST_BUCKET, "file3.txt", "content3");
      
      // Delete them
      const result = await AwsS3.deleteFiles(TEST_BUCKET, ["file1.txt", "file2.txt", "file3.txt"]);
      logTest("deleteFiles()", result === true, "Batch deleted 3 files");
    } catch (error) {
      logTest("deleteFiles()", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // MULTIPART UPLOAD OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n📦 MULTIPART UPLOAD OPERATIONS\n");
    
    let uploadId = null;
    const multipartKey = "multipart-test.txt";
    const partContent = "A".repeat(5 * 1024 * 1024); // 5MB
    
    // Test 16: initiateMultipartUpload()
    try {
      uploadId = await AwsS3.initiateMultipartUpload(TEST_BUCKET, multipartKey);
      const isValid = uploadId && uploadId.length > 0;
      logTest("initiateMultipartUpload()", isValid, `Upload ID: ${uploadId?.substring(0, 20)}...`);
    } catch (error) {
      logTest("initiateMultipartUpload()", false, error.message);
    }
    
    // Test 17: uploadPart()
    let partETag = null;
    if (uploadId) {
      try {
        const result = await AwsS3.uploadPart(TEST_BUCKET, multipartKey, uploadId, 1, partContent);
        partETag = result?.ETag;
        const isValid = partETag && partETag.length > 0;
        logTest("uploadPart()", isValid, `Part 1 uploaded, ETag: ${partETag}`);
      } catch (error) {
        logTest("uploadPart()", false, error.message);
      }
    }
    
    // Test 18: completeMultipartUpload()
    if (uploadId && partETag) {
      try {
        const parts = [{ ETag: partETag, PartNumber: 1 }];
        const result = await AwsS3.completeMultipartUpload(TEST_BUCKET, multipartKey, uploadId, parts);
        logTest("completeMultipartUpload()", result === true, "Multipart upload completed");
        
        // Clean up
        await AwsS3.deleteFile(TEST_BUCKET, multipartKey);
      } catch (error) {
        logTest("completeMultipartUpload()", false, error.message);
      }
    }
    
    // Test 19: abortMultipartUpload()
    try {
      const abortKey = "abort-test.txt";
      const abortUploadId = await AwsS3.initiateMultipartUpload(TEST_BUCKET, abortKey);
      
      if (abortUploadId) {
        const result = await AwsS3.abortMultipartUpload(TEST_BUCKET, abortKey, abortUploadId);
        logTest("abortMultipartUpload()", result === true, "Upload aborted successfully");
      } else {
        logTest("abortMultipartUpload()", false, "Failed to initiate upload for abort test");
      }
    } catch (error) {
      logTest("abortMultipartUpload()", false, error.message);
    }
    
    
    // ═══════════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════════
    
    console.log("\n🧹 CLEANUP\n");
    
    // Test 20: deleteBucket()
    try {
      const result = await AwsS3.deleteBucket(TEST_BUCKET);
      logTest("deleteBucket()", result === true, `Deleted: ${TEST_BUCKET}`);
    } catch (error) {
      logTest("deleteBucket()", false, error.message);
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
    
    console.log("\n✅ S3 UNIT TESTS COMPLETED!");
    
  } catch (error) {
    console.error("\n❌ Test suite failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

console.log("🚀 Starting S3 unit tests...\n");
runS3UnitTests();
