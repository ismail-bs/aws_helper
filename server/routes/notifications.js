const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const requireOwner = require('../middleware/requireOwner');
const broadcastService = require('../services/broadcastService');
const sns = require('../services/snsService');

const router = express.Router({ mergeParams: true });

const loadBroadcast = asyncHandler(async (req, res, next) => {
  const b = await broadcastService.getBroadcast(req.params.id);
  if (!b) return res.status(404).json({ error: 'broadcast not found' });
  req.broadcast = b;
  next();
});

router.post(
  '/:id/notifications/subscribe',
  loadBroadcast,
  requireOwner,
  asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const arn = await sns.subscribeEmail(req.broadcast.snsTopicArn, email);
    res.json({ subscriptionArn: arn });
  })
);

router.post(
  '/:id/notifications/unsubscribe',
  loadBroadcast,
  asyncHandler(async (req, res) => {
    const { subscriptionArn } = req.body || {};
    if (!subscriptionArn) return res.status(400).json({ error: 'subscriptionArn required' });
    await sns.unsubscribe(subscriptionArn);
    res.json({ ok: true });
  })
);

router.get(
  '/:id/notifications',
  loadBroadcast,
  asyncHandler(async (req, res) => {
    const subs = await sns.listSubscriptions(req.broadcast.snsTopicArn);
    res.json(subs);
  })
);

module.exports = router;
