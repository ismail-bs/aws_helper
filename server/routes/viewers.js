const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const requireOwner = require('../middleware/requireOwner');
const broadcastService = require('../services/broadcastService');
const viewerService = require('../services/viewerService');
const paymentService = require('../services/paymentService');

const router = express.Router({ mergeParams: true });

const loadBroadcast = asyncHandler(async (req, res, next) => {
  const b = await broadcastService.getBroadcast(req.params.id);
  if (!b) return res.status(404).json({ error: 'broadcast not found' });
  req.broadcast = b;
  next();
});

/**
 * Viewer joins. Returns the playback URL appropriate for their access level
 * along with the broadcaster's current `isPrivate` flag so the client can
 * render the correct overlay.
 */
router.post(
  '/:id/viewers/join',
  loadBroadcast,
  asyncHandler(async (req, res) => {
    const { viewerId, displayName, mode = 'public', paymentIntentId } = req.body || {};
    let paid = !req.broadcast.paymentRequired;
    if (req.broadcast.paymentRequired) {
      paid = await paymentService.isPaid(paymentIntentId, req.broadcast.id, viewerId);
    }
    try {
      const v = await viewerService.joinViewer({
        broadcast: req.broadcast,
        viewerId,
        displayName,
        mode,
        paid,
      });
      const playbackUrl =
        mode === 'private'
          ? req.broadcast.privatePlaybackUrl
          : req.broadcast.publicPlaybackUrl;
      res.json({
        viewer: v,
        playbackUrl,
        isPrivate: req.broadcast.isPrivate,
        broadcast: broadcastService.publicView(req.broadcast),
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  })
);

router.post(
  '/:id/viewers/heartbeat',
  loadBroadcast,
  asyncHandler(async (req, res) => {
    const { viewerId } = req.body || {};
    if (!viewerId) return res.status(400).json({ error: 'viewerId required' });
    await viewerService.heartbeatViewer({ broadcastId: req.broadcast.id, viewerId });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/viewers/leave',
  loadBroadcast,
  asyncHandler(async (req, res) => {
    const { viewerId } = req.body || {};
    if (!viewerId) return res.status(400).json({ error: 'viewerId required' });
    await viewerService.leaveViewer({ broadcast: req.broadcast, viewerId });
    res.json({ ok: true });
  })
);

// --- private access management (broadcaster, owner-only) -----------------
router.post(
  '/:id/private-access',
  loadBroadcast,
  requireOwner,
  asyncHandler(async (req, res) => {
    const { userId, displayName } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    await viewerService.grantPrivateAccess({ broadcast: req.broadcast, userId, displayName });
    res.json({ ok: true });
  })
);

router.delete(
  '/:id/private-access/:userId',
  loadBroadcast,
  requireOwner,
  asyncHandler(async (req, res) => {
    await viewerService.revokePrivateAccess({
      broadcast: req.broadcast,
      userId: req.params.userId,
    });
    res.json({ ok: true });
  })
);

router.get(
  '/:id/private-access',
  loadBroadcast,
  requireOwner,
  asyncHandler(async (req, res) => {
    const list = await viewerService.listPrivateAccess(req.broadcast.id);
    res.json(list);
  })
);

module.exports = router;
