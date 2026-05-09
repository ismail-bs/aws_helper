// Validates `Authorization: Bearer <ownerToken>` against req.broadcast.
// Use AFTER a route handler that has called `loadBroadcast` (or do both in
// the same chain).
const broadcastService = require('../services/broadcastService');

function extractToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  // Fall back to ?ownerToken=… for SSE links where headers are awkward.
  return req.query.ownerToken || null;
}

module.exports = function requireOwner(req, res, next) {
  if (!req.broadcast) {
    return res.status(500).json({ error: 'requireOwner used without loadBroadcast' });
  }
  const token = extractToken(req);
  if (!broadcastService.verifyOwnerToken(req.broadcast, token)) {
    return res.status(401).json({ error: 'invalid owner token' });
  }
  next();
};
