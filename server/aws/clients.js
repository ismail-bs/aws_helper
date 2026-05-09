// Centralized AWS client factory for the IVS Realtime backend.
// Falls back to .env credentials and (if not present) the default credential
// provider chain (Secrets Manager / IAM role / SSO / etc.) so the same code
// works locally and on EC2 / Lambda.

const { IvsClient } = require('@aws-sdk/client-ivs');
const { IVSRealTimeClient } = require('@aws-sdk/client-ivs-realtime');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { SNSClient } = require('@aws-sdk/client-sns');

const REGION = process.env.AWS_REGION || 'us-east-1';

function buildCredentials() {
  const id = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID_IVS;
  const secret = process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY_IVS;
  if (id && secret) return { accessKeyId: id, secretAccessKey: secret };
  return undefined; // fall through to default provider chain
}

const baseConfig = { region: REGION, credentials: buildCredentials() };

const ivs = new IvsClient(baseConfig);
const ivsRealtime = new IVSRealTimeClient(baseConfig);
const ddbRaw = new DynamoDBClient(baseConfig);
const ddb = DynamoDBDocumentClient.from(ddbRaw, {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
});
const sns = new SNSClient(baseConfig);

module.exports = { ivs, ivsRealtime, ddb, sns, REGION };
