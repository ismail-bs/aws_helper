const ScyllaDb = require('../utils/ScyllaDb.js');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const SCYLLA_CONFIG = {
  endpoint: process.env.SCYLLA_ALTERNATOR_ENDPOINT || 'http://localhost:8000/',
  region: process.env.SCYLLA_ACCESS_REGION || 'us-east-1',
  key: process.env.SCYLLA_ACCESS_KEY || 'dummy_key',
  secret: process.env.SCYLLA_ACCESS_PASSWORD || 'dummy_secret'
};

// Table configuration for ScyllaDb client
const TABLE_CONFIG = {
  Notifications: {
    tableName: 'Notifications',
    keys: {
      partition: 'PK',
      sort: 'SK'
    },
    attributes: {
      PK: 'S',
      SK: 'S',
      GSI1PK: 'S',
      GSI1SK: 'S',
      notification_id: 'S',
      user_id: 'S',
      title: 'S',
      description: 'S',
      type: 'S',
      category: 'S',
      priority: 'N',
      read: 'BOOL',
      pinned: 'BOOL',
      created_at: 'N',
      updated_at: 'N',
      read_at: 'N',
      expires_at: 'N',
      template_id: 'S',
      template_params: 'M',
      main_visual: 'M',
      secondary_visual: 'M',
      action: 'M',
      meta: 'M',
      visibility: 'S',
      featured: 'BOOL'
    },
    indexes: {
      UnreadByUser: {
        partition: 'GSI1PK',
        sort: 'GSI1SK',
        type: 'global'
      }
    }
  }
};

const TABLE_SCHEMA = {
  TableName: 'Notifications',
  BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: [
    { AttributeName: 'PK', AttributeType: 'S' },
    { AttributeName: 'SK', AttributeType: 'S' },
    { AttributeName: 'GSI1PK', AttributeType: 'S' },
    { AttributeName: 'GSI1SK', AttributeType: 'S' }
  ],
  KeySchema: [
    { AttributeName: 'PK', KeyType: 'HASH' },
    { AttributeName: 'SK', KeyType: 'RANGE' }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'UnreadByUser',
      KeySchema: [
        { AttributeName: 'GSI1PK', KeyType: 'HASH' },
        { AttributeName: 'GSI1SK', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    }
  ]
};

async function setupDatabase() {
  console.log('\n🚀 Starting NotificationsAccount Database Setup...\n');

  try {
    // Configure ScyllaDb (static class)
    ScyllaDb.configure(SCYLLA_CONFIG);
    ScyllaDb.setTableConfigs(TABLE_CONFIG);
    console.log('✅ ScyllaDB configured');
    console.log('   Endpoint:', SCYLLA_CONFIG.endpoint);

    // Test connection
    console.log('🔍 Testing ScyllaDB connection...');
    const tables = await ScyllaDb.listTables();
    console.log(`✅ Connected to ScyllaDB (${tables.length} existing tables)`);

    // Check if table exists
    const tableExists = tables.includes('Notifications');

    if (process.argv.includes('reset') && tableExists) {
      console.log('🗑️  Resetting table...');
      await ScyllaDb.deleteTable('Notifications');
      console.log('✅ Table deleted');
      
      // Wait a moment for deletion to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!tableExists || process.argv.includes('reset')) {
      console.log('🏗️  Creating Notifications table...');
      await ScyllaDb.createTable(TABLE_SCHEMA);
      console.log('✅ Table created successfully');
      
      // Wait for table to become active
      console.log('⏳ Waiting for table to become active...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.log('⚠️  Table already exists, skipping creation');
    }

    // Verify table structure
    console.log('🔍 Verifying table structure...');
    const tableInfo = await ScyllaDb.describeTable('Notifications');
    console.log('   Table Name:', tableInfo.Table.TableName);
    console.log('   Status:', tableInfo.Table.TableStatus);
    console.log('   Key Schema:', tableInfo.Table.KeySchema.length, 'keys');
    console.log('   Attributes:', tableInfo.Table.AttributeDefinitions.length, 'defined');
    console.log('   GSI Count:', tableInfo.Table.GlobalSecondaryIndexes?.length || 0);
    
    if (tableInfo.Table.GlobalSecondaryIndexes) {
      tableInfo.Table.GlobalSecondaryIndexes.forEach(gsi => {
        console.log(`   GSI "${gsi.IndexName}":`, gsi.IndexStatus);
      });
    }

    console.log('✅ Table structure verified');
    
    console.log('\n🎉 Database setup completed successfully!');
    console.log('📋 You can now run notification tests\n');

    return { success: true, tableConfig: TABLE_CONFIG };

  } catch (error) {
    console.error('\n❌ Database setup failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
  }
}

// Run if called directly (CommonJS way)
if (require.main === module) {
  setupDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupDatabase, TABLE_CONFIG, SCYLLA_CONFIG };
