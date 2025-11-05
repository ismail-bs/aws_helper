const ScyllaDb = require('../utils/ScyllaDb.js');
const { SCYLLA_CONFIG, TABLE_CONFIG } = require('./setup-database.js');
const dotenv = require('dotenv');

dotenv.config();

const TEST_USER_ID = process.env.TEST_USER_ID || 'test-user-123';

async function cleanup() {
  console.log('🧹 Cleaning up test data...\n');
  
  // Configure ScyllaDb
  ScyllaDb.configure(SCYLLA_CONFIG);
  ScyllaDb.setTableConfigs(TABLE_CONFIG);
  
  // Query all items for test user
  const resp = await ScyllaDb.request('Query', {
    TableName: 'Notifications',
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'PK' },
    ExpressionAttributeValues: ScyllaDb.marshalItem({
      ':pk': `USER#${TEST_USER_ID}`
    })
  });
  
  const items = (resp.Items || []).map(ScyllaDb.unmarshalItem);
  console.log(`Found ${items.length} notifications for user ${TEST_USER_ID}`);
  
  // Delete each item
  for (const item of items) {
    await ScyllaDb.deleteItem('Notifications', {
      PK: item.PK,
      SK: item.SK
    });
  }
  
  console.log(`✅ Deleted ${items.length} notifications\n`);
}

cleanup()
  .then(() => {
    console.log('✅ Cleanup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  });
