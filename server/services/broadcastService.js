// High-level orchestration for an IVS Real-time broadcast.
// Wires together: stage (real-time), public + private channels (low-latency),
// SNS topic, DynamoDB persistence.

const crypto = require('crypto');
const { nanoid } = require('nanoid');
const tables = require('../config/tables');
const dynamo = require('./dynamoService');
const realtime = require('./ivsRealtimeService');
const channels = require('./ivsChannelService');
const sns = require('./snsService');

const DEFAULT_MAX_VIEWERS = parseInt(process.env.DEFAULT_MAX_VIEWERS || '500', 10);

/**
 * Create a brand new broadcast.
 * Steps:
 *   1. Create stage (multi-host meeting).
 *   2. Create public channel.
 *   3. Create private channel.
 *   4. Create SNS topic.
 *   5. Persist into DynamoDB.
 */
async function createBroadcast({
  ownerUserId,
  title,
  description = '',
  maxViewers = DEFAULT_MAX_VIEWERS,
  paymentRequired = false,
  priceUsd = 0,
}) {
  const id = nanoid(10);
  // Owner secret: a random token returned ONCE at creation. Mutating routes
  // require this token in `Authorization: Bearer <token>`.
  const ownerToken = crypto.randomBytes(24).toString('base64url');
  const ownerTokenHash = crypto.createHash('sha256').update(ownerToken).digest('hex');
  const tagSet = { app: 'IVSRTDemo', broadcastId: id };

  const stage = await realtime.createStage(`stage-${id}`, tagSet);
  const publicCh = await channels.createChannel({ name: `pub-${id}` });
  const privateCh = await channels.createChannel({ name: `prv-${id}` });
  const topicArn = await sns.createTopic(`ivsrt-${id}`);

  const now = new Date().toISOString();
  const item = {
    id,
    ownerUserId,
    ownerTokenHash,
    title,
    description,
    stageArn: stage.arn,
    publicChannelArn: publicCh.arn,
    publicPlaybackUrl: publicCh.playbackUrl,
    privateChannelArn: privateCh.arn,
    privatePlaybackUrl: privateCh.playbackUrl,
    snsTopicArn: topicArn,
    isPrivate: false,
    maxViewers,
    paymentRequired,
    priceUsd,
    status: 'created',
    publicCompositionArn: null,
    privateCompositionArn: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    endedAt: null,
    viewerCountPublic: 0,
    viewerCountPrivate: 0,
  };
  await dynamo.put(tables.BROADCASTS, item);
  // Return the plaintext ownerToken ONCE so the studio can store it.
  return { ...item, ownerToken };
}

async function getBroadcast(id) {
  return dynamo.get(tables.BROADCASTS, { id });
}

/** Verify a bearer token against the stored hash. Constant-time. */
function verifyOwnerToken(broadcast, token) {
  if (!broadcast?.ownerTokenHash || !token) return false;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(broadcast.ownerTokenHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Public-safe view: strips secrets so we can return it to viewers. */
function publicView(b) {
  if (!b) return null;
  const {
    stageArn, publicChannelArn, privateChannelArn, snsTopicArn,
    ownerTokenHash, ...rest
  } = b;
  return rest;
}

/** Owner view: strips ownerTokenHash but keeps everything else. */
function ownerView(b) {
  if (!b) return null;
  const { ownerTokenHash, ...rest } = b;
  return rest;
}

async function listBroadcasts() {
  const all = await dynamo.scan(tables.BROADCASTS);
  return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/**
 * Start the broadcast: kick off the public composition (stage -> public
 * channel). Idempotent.
 */
async function startBroadcast(id) {
  const b = await getBroadcast(id);
  if (!b) throw Object.assign(new Error('broadcast not found'), { status: 404 });
  if (b.publicCompositionArn) return b;

  const composition = await realtime.startComposition({
    stageArn: b.stageArn,
    channelArn: b.publicChannelArn,
  });
  const updated = await dynamo.update(
    tables.BROADCASTS,
    { id },
    {
      status: 'live',
      startedAt: new Date().toISOString(),
      publicCompositionArn: composition.arn,
      isPrivate: false,
      updatedAt: new Date().toISOString(),
    }
  );
  await sns.publish(id, b.snsTopicArn, 'broadcast.started', { id });
  return updated;
}

/** Stop ALL compositions and tear down. */
async function stopBroadcast(id) {
  const b = await getBroadcast(id);
  if (!b) return null;
  const stops = [];
  if (b.publicCompositionArn) stops.push(realtime.stopComposition(b.publicCompositionArn).catch(() => {}));
  if (b.privateCompositionArn) stops.push(realtime.stopComposition(b.privateCompositionArn).catch(() => {}));
  await Promise.all(stops);

  const updated = await dynamo.update(
    tables.BROADCASTS,
    { id },
    {
      status: 'ended',
      endedAt: new Date().toISOString(),
      isPrivate: false,
      publicCompositionArn: null,
      privateCompositionArn: null,
      updatedAt: new Date().toISOString(),
    }
  );
  await sns.publish(id, b.snsTopicArn, 'broadcast.ended', { id });
  return updated;
}

/**
 * Toggle private mode. When going private we stop the public composition
 * and start a new composition into the private channel. Going public reverses
 * that. Public-channel viewers see a "broadcaster is in a private session"
 * notice driven by the SNS event we publish here.
 */
async function setPrivate(id, isPrivate) {
  const b = await getBroadcast(id);
  if (!b) throw Object.assign(new Error('broadcast not found'), { status: 404 });

  if (isPrivate && !b.isPrivate) {
    if (b.publicCompositionArn) {
      await realtime.stopComposition(b.publicCompositionArn).catch(() => {});
    }
    const c = await realtime.startComposition({
      stageArn: b.stageArn,
      channelArn: b.privateChannelArn,
    });
    const updated = await dynamo.update(
      tables.BROADCASTS,
      { id },
      {
        isPrivate: true,
        publicCompositionArn: null,
        privateCompositionArn: c.arn,
        updatedAt: new Date().toISOString(),
      }
    );
    await sns.publish(id, b.snsTopicArn, 'broadcast.private.on', { id });
    return updated;
  }

  if (!isPrivate && b.isPrivate) {
    if (b.privateCompositionArn) {
      await realtime.stopComposition(b.privateCompositionArn).catch(() => {});
    }
    const c = await realtime.startComposition({
      stageArn: b.stageArn,
      channelArn: b.publicChannelArn,
    });
    const updated = await dynamo.update(
      tables.BROADCASTS,
      { id },
      {
        isPrivate: false,
        publicCompositionArn: c.arn,
        privateCompositionArn: null,
        updatedAt: new Date().toISOString(),
      }
    );
    await sns.publish(id, b.snsTopicArn, 'broadcast.private.off', { id });
    return updated;
  }

  return b;
}

/**
 * Wait for a composition's state to become STOPPED/FAILED so we can safely
 * delete the channel it was writing to. AWS does not support deleting a
 * channel while a composition is still active.
 */
async function waitForCompositionTerminal(arn, { maxMs = 30000, pollMs = 1500 } = {}) {
  if (!arn) return;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const c = await realtime.getComposition(arn);
      if (!c || ['STOPPED', 'FAILED'].includes(c.state)) return;
    } catch (_) {
      return; // composition gone => safe
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/**
 * Tear down all AWS resources for a broadcast. Stops any running composition
 * FIRST, waits for it to actually terminate, then deletes the stage,
 * channels, and SNS topic concurrently.
 */
async function deleteBroadcast(id) {
  const b = await getBroadcast(id);
  if (!b) return false;
  // Stop both compositions if running.
  await Promise.all([
    b.publicCompositionArn ? realtime.stopComposition(b.publicCompositionArn).catch(() => {}) : null,
    b.privateCompositionArn ? realtime.stopComposition(b.privateCompositionArn).catch(() => {}) : null,
  ]);
  // Wait for them to fully release their channels.
  await Promise.all([
    waitForCompositionTerminal(b.publicCompositionArn),
    waitForCompositionTerminal(b.privateCompositionArn),
  ]);
  // Now safe to delete the channels + stage + SNS topic.
  await Promise.all([
    realtime.deleteStage(b.stageArn).catch((e) => console.warn('[delete.stage]', e.name, e.message)),
    channels.deleteChannel(b.publicChannelArn).catch((e) => console.warn('[delete.pubCh]', e.name, e.message)),
    channels.deleteChannel(b.privateChannelArn).catch((e) => console.warn('[delete.prvCh]', e.name, e.message)),
    sns.deleteTopic(b.snsTopicArn).catch((e) => console.warn('[delete.sns]', e.name, e.message)),
  ]);
  await dynamo.del(tables.BROADCASTS, { id });
  return true;
}

module.exports = {
  createBroadcast,
  getBroadcast,
  verifyOwnerToken,
  publicView,
  ownerView,
  listBroadcasts,
  startBroadcast,
  stopBroadcast,
  setPrivate,
  deleteBroadcast,
};
