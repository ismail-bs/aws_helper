// Payment-gate service.
//
// Persists each payment intent in DynamoDB so a server restart between
// `createIntent` and `joinViewer` doesn't lose paid customers. In MOCK mode
// (no STRIPE_SECRET_KEY) confirmations require code "PAY". When wired to a
// real provider, replace `confirmIntent` with the provider's webhook flow.

const crypto = require('crypto');
const tables = require('../config/tables');
const dynamo = require('./dynamoService');

function isMock() {
  return !process.env.STRIPE_SECRET_KEY;
}

async function createIntent({ broadcastId, userId, amountUsd }) {
  const id = `pi_${crypto.randomBytes(12).toString('hex')}`;
  const intent = {
    id,
    broadcastId,
    userId,
    amountUsd,
    status: 'requires_payment',
    createdAt: new Date().toISOString(),
    mock: isMock(),
  };
  await dynamo.put(tables.PAYMENT_INTENTS, intent);
  return intent;
}

async function getIntent(intentId) {
  return dynamo.get(tables.PAYMENT_INTENTS, { id: intentId });
}

/**
 * Confirm payment. In MOCK mode we accept code === "PAY". A real provider
 * would call this from its webhook after verifying the signature.
 */
async function confirmIntent({ intentId, code }) {
  const intent = await getIntent(intentId);
  if (!intent) {
    const e = new Error('Unknown payment intent');
    e.status = 404;
    throw e;
  }
  if (isMock() && code !== 'PAY') {
    const e = new Error('Mock payment requires confirmation code "PAY"');
    e.status = 400;
    throw e;
  }
  const updated = await dynamo.update(
    tables.PAYMENT_INTENTS,
    { id: intentId },
    { status: 'succeeded', confirmedAt: new Date().toISOString() }
  );
  return updated;
}

async function isPaid(intentId, broadcastId, userId) {
  if (!intentId) return false;
  const intent = await getIntent(intentId);
  return !!(
    intent &&
    intent.status === 'succeeded' &&
    intent.broadcastId === broadcastId &&
    intent.userId === userId
  );
}

module.exports = { createIntent, getIntent, confirmIntent, isPaid, isMock };
