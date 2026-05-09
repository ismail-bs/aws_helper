const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const broadcastService = require('../services/broadcastService');
const paymentService = require('../services/paymentService');

const router = express.Router({ mergeParams: true });

const loadBroadcast = asyncHandler(async (req, res, next) => {
  const b = await broadcastService.getBroadcast(req.params.id);
  if (!b) return res.status(404).json({ error: 'broadcast not found' });
  req.broadcast = b;
  next();
});

router.post(
  '/:id/payment/intent',
  loadBroadcast,
  asyncHandler(async (req, res) => {
    if (!req.broadcast.paymentRequired) {
      return res.status(400).json({ error: 'this broadcast does not require payment' });
    }
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const intent = await paymentService.createIntent({
      broadcastId: req.broadcast.id,
      userId,
      amountUsd: req.broadcast.priceUsd,
    });
    res.json(intent);
  })
);

router.post(
  '/:id/payment/confirm',
  loadBroadcast,
  asyncHandler(async (req, res) => {
    const { intentId, code } = req.body || {};
    if (!intentId) return res.status(400).json({ error: 'intentId required' });
    try {
      const intent = await paymentService.confirmIntent({ intentId, code });
      res.json(intent);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  })
);

module.exports = router;
