// DynamoDB table names. Override with env vars for prod.
module.exports = {
  BROADCASTS: process.env.DDB_TABLE_BROADCASTS || 'IVSRT_Broadcasts',
  VIEWERS: process.env.DDB_TABLE_VIEWERS || 'IVSRT_Viewers',
  PRIVATE_ACCESS: process.env.DDB_TABLE_PRIVATE_ACCESS || 'IVSRT_PrivateAccess',
  PARTICIPANTS: process.env.DDB_TABLE_PARTICIPANTS || 'IVSRT_Participants',
  PAYMENT_INTENTS: process.env.DDB_TABLE_PAYMENT_INTENTS || 'IVSRT_PaymentIntents',
};
