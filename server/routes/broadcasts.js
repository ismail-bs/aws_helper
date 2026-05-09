const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const requireOwner = require('../middleware/requireOwner');
const broadcastService = require('../services/broadcastService');
const realtime = require('../services/ivsRealtimeService');
const sns = require('../services/snsService');
const viewerService = require('../services/viewerService');

const router = express.Router();

// --- helpers ---------------------------------------------------------------
const loadBroadcast = asyncHandler(async (req, res, next) => {
  const b = await broadcastService.getBroadcast(req.params.id);
  if (!b) return res.status(404).json({ error: 'broadcast not found' });
  req.broadcast = b;
  next();
});

// --- routes ----------------------------------------------------------------

// list (public-safe)
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const all = await broadcastService.listBroadcasts();
    res.json(all.map(broadcastService.publicView));
  })
);

// create
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { ownerUserId, title, description, maxViewers, paymentRequired, priceUsd } = req.body || {};
    if (!ownerUserId || !title) {
      return res.status(400).json({ error: 'ownerUserId and title are required' });
    }
    const b = await broadcastService.createBroadcast({
      ownerUserId,
      title,
      description,
      maxViewers,
      paymentRequired,
      priceUsd,
    });
    // Owner gets the FULL record (including stage arns) so they can broadcast.
    res.status(201).json(b);
  })
);

// owner-facing details (returns the FULL record minus the token hash)
router.get(
  '/:id/owner',
  loadBroadcast,
  requireOwner,
  asyncHandler(async (req, res) => {
    res.json(broadcastService.ownerView(req.broadcast));
  })
);

// public-safe details
router.get('/:id', loadBroadcast, (req, res) => {
  res.json(broadcastService.publicView(req.broadcast));
});

// start broadcast (owner action)
router.post(
  '/:id/start',
  loadBroadcast,
  requireOwner,
  asyncHandler(async (req, res) => {
    const updated = await broadcastService.startBroadcast(req.broadcast.id);
    res.json(broadcastService.ownerView(updated));
  })
);

// stop broadcast (owner action)
router.post(
  '/:id/stop',
  loadBroadcast,
  requireOwner,
  asyncHandler(async (req, res) => {
    const updated = await broadcastService.stopBroadcast(req.broadcast.id);
    res.json(broadcastService.ownerView(updated));
  })
);

// toggle private mode
router.post(
  '/:id/private',
  loadBroadcast,
  requireOwner,
  asyncHandler(async (req, res) => {
    const { isPrivate } = req.body || {};
    const updated = await broadcastService.setPrivate(req.broadcast.id, !!isPrivate);
    res.json(broadcastService.publicView(updated));
  })
);

// issue a participant token (broadcaster joining the stage). Owner-only:
// the studio uses this for itself AND to mint co-host tokens.
router.post(
  '/:id/participant-token',
  loadBroadcast,
  requireOwner,
  asyncHandler(async (req, res) => {
    const { userId, displayName, capabilities } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const token = await realtime.createParticipantToken({
      stageArn: req.broadcast.stageArn,
      userId,
      attributes: { displayName: displayName || userId },
      capabilities: capabilities || ['PUBLISH', 'SUBSCRIBE'],
      durationMinutes: 120,
    });
    await sns.publish(
      req.broadcast.id,
      req.broadcast.snsTopicArn,
      'participant.joined',
      { userId, displayName }
    );
    res.json(token);
  })
);

// stats: total viewers (DDB + AWS), duration, attendees
router.get(
  '/:id/stats',
  loadBroadcast,
  asyncHandler(async (req, res) => {
    const stats = await viewerService.getStats(req.broadcast);
    res.json(stats);
  })
);

// SSE: broadcast events (state changes, viewer joins, etc.)
router.get('/:id/events', (req, res) => {
  const broadcastId = req.params.id;
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ broadcastId })}\n\n`);

  const send = (event) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const unsubscribe = sns.subscribeLocal(broadcastId, send);
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 15000);

  req.on('close', () => {
    unsubscribe();
    clearInterval(heartbeat);
  });
});

// danger zone: delete a broadcast and its AWS resources
router.delete(
  '/:id',
  loadBroadcast,
  requireOwner,
  asyncHandler(async (req, res) => {
    await broadcastService.deleteBroadcast(req.broadcast.id);
    res.status(204).end();
  })
);

module.exports = router;
