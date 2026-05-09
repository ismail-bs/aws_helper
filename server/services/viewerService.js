// Viewer + private-access bookkeeping.
const { nanoid } = require('nanoid');
const tables = require('../config/tables');
const dynamo = require('./dynamoService');
const sns = require('./snsService');
const channels = require('./ivsChannelService');

const HEARTBEAT_TTL_MS = 60 * 1000; // viewer is "active" if seen in the last 60s

function now() {
  return new Date().toISOString();
}

async function listActiveViewers(broadcastId) {
  const items = await dynamo.query(tables.VIEWERS, {
    KeyConditionExpression: 'broadcastId = :b',
    ExpressionAttributeValues: { ':b': broadcastId },
  });
  const cutoff = Date.now() - HEARTBEAT_TTL_MS;
  return items.filter((v) => Date.parse(v.lastSeen || 0) >= cutoff);
}

async function countActive(broadcastId) {
  const active = await listActiveViewers(broadcastId);
  return {
    total: active.length,
    public: active.filter((v) => v.mode === 'public').length,
    private: active.filter((v) => v.mode === 'private').length,
    list: active,
  };
}

/**
 * Register a viewer joining the broadcast. Enforces:
 *   - max viewers (per broadcast.maxViewers)
 *   - private allow-list (PRIVATE_ACCESS table)
 *   - payment gate (paid flag must be set if broadcast.paymentRequired)
 */
async function joinViewer({ broadcast, viewerId, displayName, mode = 'public', paid = false }) {
  if (!viewerId) viewerId = `v_${nanoid(8)}`;

  const counts = await countActive(broadcast.id);
  if (counts.total >= (broadcast.maxViewers || Infinity)) {
    const err = new Error('Broadcast has reached its maximum viewer count');
    err.status = 403;
    err.code = 'MAX_VIEWERS_REACHED';
    throw err;
  }

  if (broadcast.paymentRequired && !paid) {
    const err = new Error('Payment required to view this broadcast');
    err.status = 402;
    err.code = 'PAYMENT_REQUIRED';
    throw err;
  }

  let hasPrivateAccess = false;
  if (mode === 'private') {
    const access = await dynamo.get(tables.PRIVATE_ACCESS, {
      broadcastId: broadcast.id,
      userId: viewerId,
    });
    if (!access) {
      const err = new Error('You do not have access to the private session');
      err.status = 403;
      err.code = 'PRIVATE_ACCESS_DENIED';
      throw err;
    }
    hasPrivateAccess = true;
  }

  const item = {
    broadcastId: broadcast.id,
    viewerId,
    displayName: displayName || viewerId,
    mode,
    hasPrivateAccess,
    paid: !!paid,
    joinedAt: now(),
    lastSeen: now(),
  };
  await dynamo.put(tables.VIEWERS, item);
  await sns.publish(broadcast.id, broadcast.snsTopicArn, 'viewer.joined', {
    viewerId,
    displayName: item.displayName,
    mode,
  });
  return item;
}

async function heartbeatViewer({ broadcastId, viewerId }) {
  const updated = await dynamo.update(
    tables.VIEWERS,
    { broadcastId, viewerId },
    { lastSeen: now() }
  );
  return updated;
}

async function leaveViewer({ broadcast, viewerId }) {
  await dynamo.del(tables.VIEWERS, { broadcastId: broadcast.id, viewerId });
  await sns.publish(broadcast.id, broadcast.snsTopicArn, 'viewer.left', {
    viewerId,
  });
}

async function grantPrivateAccess({ broadcast, userId, displayName }) {
  await dynamo.put(tables.PRIVATE_ACCESS, {
    broadcastId: broadcast.id,
    userId,
    displayName: displayName || userId,
    grantedAt: now(),
  });
  await sns.publish(broadcast.id, broadcast.snsTopicArn, 'private.access.granted', {
    userId,
    displayName,
  });
}

async function revokePrivateAccess({ broadcast, userId }) {
  await dynamo.del(tables.PRIVATE_ACCESS, { broadcastId: broadcast.id, userId });
  await sns.publish(broadcast.id, broadcast.snsTopicArn, 'private.access.revoked', {
    userId,
  });
}

async function listPrivateAccess(broadcastId) {
  return dynamo.query(tables.PRIVATE_ACCESS, {
    KeyConditionExpression: 'broadcastId = :b',
    ExpressionAttributeValues: { ':b': broadcastId },
  });
}

/**
 * Aggregate viewer stats: combines DynamoDB heartbeat counts with the IVS
 * GetStream "viewerCount" metric for the active channel.
 */
async function getStats(broadcast) {
  const ddbCounts = await countActive(broadcast.id);
  const activeChannelArn = broadcast.isPrivate
    ? broadcast.privateChannelArn
    : broadcast.publicChannelArn;
  let stream = null;
  try {
    stream = await channels.getStream(activeChannelArn);
  } catch (_) {
    stream = null;
  }
  const startedAt = stream?.startTime
    ? new Date(stream.startTime).toISOString()
    : broadcast.startedAt;
  const durationSec = startedAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000))
    : 0;

  return {
    broadcastId: broadcast.id,
    isPrivate: !!broadcast.isPrivate,
    status: broadcast.status,
    startedAt,
    durationSec,
    awsViewerCount: stream?.viewerCount ?? null,
    awsHealth: stream?.health ?? null,
    awsState: stream?.state ?? null,
    ddbViewerCounts: {
      total: ddbCounts.total,
      public: ddbCounts.public,
      private: ddbCounts.private,
    },
    privateAttendees: ddbCounts.list
      .filter((v) => v.mode === 'private')
      .map((v) => ({ viewerId: v.viewerId, displayName: v.displayName })),
    publicViewers: ddbCounts.list
      .filter((v) => v.mode === 'public')
      .map((v) => ({ viewerId: v.viewerId, displayName: v.displayName })),
  };
}

module.exports = {
  joinViewer,
  heartbeatViewer,
  leaveViewer,
  grantPrivateAccess,
  revokePrivateAccess,
  listPrivateAccess,
  getStats,
};
