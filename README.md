# AWS Helper - S3 Testing

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Configure AWS credentials in `.env` file:**
```bash
# Update these with your actual AWS credentials
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here

# Application settings
NODE_ENV=local
LOGGING_ENABLED=1
LOGGING_CONSOLE_ENABLED=1
```

## Running S3 Tests

**Run the comprehensive S3 test:**
```bash
npm run test:s3
```

This will test all S3 operations including:
- ✅ Client initialization with credentials fallback
- ✅ Bucket operations (create, list, check existence, delete)
- ✅ File operations (upload, download, check existence, delete)
- ✅ Batch file deletion
- ✅ File copying
- ✅ Presigned URL generation
- ✅ Multipart upload for large files
- ✅ Complete cleanup after tests

## Credentials Priority

The system uses this priority for AWS credentials:
1. **Environment variables** (`.env` file) - Primary
2. **AWS Secrets Manager** - Fallback (if env vars not found)

## Environment Variables Supported

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (General AWS)
- `SECRETS_MANAGER_SECRET_NAME` (for secrets manager fallback)

## Security Features

- ✅ Credentials fallback system (env → secrets manager)
- ✅ Input validation and sanitization
- ✅ Comprehensive error handling and logging
- ✅ Automatic cleanup on test failures
- ✅ No hardcoded credentials in code

## Test Output

The test will show real-time progress and results for each operation, making it easy to verify that all S3 functionality is working correctly with your AWS account.
