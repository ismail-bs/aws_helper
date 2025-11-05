// # ---------- AWS CLI (Alternator/DynamoDB API) ----------
// # If you're using Scylla Alternator locally, add: --endpoint-url http://127.0.0.1:8000 --region us-east-1

// aws dynamodb create-table \
//   --table-name Notifications \
//   --attribute-definitions \
//       AttributeName=PK,AttributeType=S \
//       AttributeName=SK,AttributeType=S \
//       AttributeName=GSI1PK,AttributeType=S \
//       AttributeName=GSI1SK,AttributeType=S \
//   --key-schema \
//       AttributeName=PK,KeyType=HASH \
//       AttributeName=SK,KeyType=RANGE \
//   --billing-mode PAY_PER_REQUEST \
//   --global-secondary-indexes '[
//     {
//       "IndexName": "UnreadByUser",
//       "KeySchema": [
//         { "AttributeName": "GSI1PK", "KeyType": "HASH" },
//         { "AttributeName": "GSI1SK", "KeyType": "RANGE" }
//       ],
//       "Projection": { "ProjectionType": "ALL" }
//     }
//   ]'

// # Enable TTL on expires_at
// aws dynamodb update-time-to-live \
//   --table-name Notifications \
//   --time-to-live-specification "Enabled=true, AttributeName=expires_at"
// js
// Copy code
// ---------- Node.js (AWS SDK v3) one-off creator for Alternator/DynamoDB ----------
// npm i @aws-sdk/client-dynamodb
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({
  // For Scylla Alternator:
  // endpoint: "http://127.0.0.1:8000",
  // region is still required by SDK even for Alternator:
  region: "us-east-1",
});

async function ensureTable() {
  const TableName = "Notifications";
  try {
    const desc = await client.send(new DescribeTableCommand({ TableName }));
    console.log("Table exists:", desc.Table?.TableStatus);
  } catch (e) {
    if (e.name !== "ResourceNotFoundException") throw e;
    const cmd = new CreateTableCommand({
      TableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "UnreadByUser",
          KeySchema: [
            { AttributeName: "GSI1PK", KeyType: "HASH" },
            { AttributeName: "GSI1SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    });
    await client.send(cmd);
    console.log("Table creation requested.");
  }

  // TTL
  try {
    await client.send(
      new UpdateTimeToLiveCommand({
        TableName,
        TimeToLiveSpecification: {
          AttributeName: "expires_at",
          Enabled: true,
        },
      })
    );
    console.log("TTL enabled on expires_at.");
  } catch (e) {
    // Alternator/Dynamo may return already enabled in some cases
    console.log("TTL setup result:", e?.name || e?.message || e);
  }
}

ensureTable().then(() => console.log("Done")).catch(console.error);
// txt
// Copy code
// # Example item (as it sits in the table)
// PK: "USER#u-123"
// SK: "P#0#U#0#PRI#0#TS#12345#NID#A1B2"      <- pinned(0), unread(0), highest priority (inv=0), newest (small invTs)
// GSI1PK: "USER#u-123#UNREAD"                <- present only when unread
// GSI1SK: "P#0#PRI#0#TS#12345#NID#A1B2"
// notification_id: "A1B2"
// user_id: "u-123"
// category: "abc"
// title: "Payment received: $12.00"
// description: "Thanks, Bee! Your invoice INV-100 was paid."
// type: "success"
// featured: false
// pinned: true
// main_visual: { icon: "credit-card", label: "Billing" }
// secondary_visual: { icon: "calendar", label: "2025-09-01" }
// action: { url: "/billing/invoices/INV-100", text: "View invoice", icon: "file" }
// meta: { currency: "USD" }
// visibility: "default"
// priority: 10
// read: false
// read_at: null
// created_at: 1695000000
// updated_at: 1695000000
// template_id: "paymentSucceeded"
// template_params: { amount: "$12.00", userName: "Bee", invoiceId: "INV-100", currency: "USD" }
// expires_at: 1695000000 + (90 * 24 * 3600)