// One-shot script to create the four DynamoDB tables used by the IVS Real-time
// backend. Safe to re-run: skips tables that already exist.
require('dotenv').config();

const {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
  ResourceNotFoundException,
} = require('@aws-sdk/client-dynamodb');
const { ddb } = require('../aws/clients');
const tables = require('../config/tables');

const SPECS = [
  {
    TableName: tables.BROADCASTS,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
  },
  {
    TableName: tables.VIEWERS,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'broadcastId', AttributeType: 'S' },
      { AttributeName: 'viewerId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'broadcastId', KeyType: 'HASH' },
      { AttributeName: 'viewerId', KeyType: 'RANGE' },
    ],
  },
  {
    TableName: tables.PRIVATE_ACCESS,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'broadcastId', AttributeType: 'S' },
      { AttributeName: 'userId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'broadcastId', KeyType: 'HASH' },
      { AttributeName: 'userId', KeyType: 'RANGE' },
    ],
  },
  {
    TableName: tables.PARTICIPANTS,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'broadcastId', AttributeType: 'S' },
      { AttributeName: 'participantId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'broadcastId', KeyType: 'HASH' },
      { AttributeName: 'participantId', KeyType: 'RANGE' },
    ],
  },
  {
    TableName: tables.PAYMENT_INTENTS,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
  },
];

async function exists(name) {
  try {
    await ddb.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch (e) {
    if (e instanceof ResourceNotFoundException || e.name === 'ResourceNotFoundException') return false;
    throw e;
  }
}

(async () => {
  for (const spec of SPECS) {
    if (await exists(spec.TableName)) {
      console.log(`✔ ${spec.TableName} already exists`);
      continue;
    }
    try {
      await ddb.send(new CreateTableCommand(spec));
      console.log(`+ ${spec.TableName} created`);
    } catch (err) {
      if (err instanceof ResourceInUseException) {
        console.log(`✔ ${spec.TableName} already exists (race)`);
      } else {
        console.error(`✗ Failed to create ${spec.TableName}:`, err.message);
        process.exitCode = 1;
      }
    }
  }
})();
