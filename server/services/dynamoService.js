// Thin wrapper around DynamoDBDocumentClient for the IVS Realtime backend.
const {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../aws/clients');

async function put(table, item) {
  await ddb.send(new PutCommand({ TableName: table, Item: item }));
  return item;
}

async function get(table, key) {
  const out = await ddb.send(new GetCommand({ TableName: table, Key: key }));
  return out.Item || null;
}

async function update(table, key, attrs) {
  const exprNames = {};
  const exprValues = {};
  const setParts = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    exprNames[`#${k}`] = k;
    exprValues[`:${k}`] = v;
    setParts.push(`#${k} = :${k}`);
  }
  if (setParts.length === 0) return null;
  const out = await ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues: 'ALL_NEW',
    })
  );
  return out.Attributes;
}

async function del(table, key) {
  await ddb.send(new DeleteCommand({ TableName: table, Key: key }));
}

async function query(table, params) {
  const out = await ddb.send(new QueryCommand({ TableName: table, ...params }));
  return out.Items || [];
}

async function scan(table, params = {}) {
  const out = await ddb.send(new ScanCommand({ TableName: table, ...params }));
  return out.Items || [];
}

module.exports = { put, get, update, del, query, scan };
