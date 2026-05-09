// Thin REST wrapper around our Express backend.
import { getOwnerToken } from './ownerAuth';

const BASE = '/api';

/**
 * Owner-bearing request: extracts the broadcast id from the path and adds
 * `Authorization: Bearer <ownerToken>` if we have one stored.
 */
function ownerHeaderForPath(path) {
  // /broadcasts/:id/...
  const m = path.match(/^\/broadcasts\/([^/?]+)/);
  if (!m) return {};
  const token = getOwnerToken(m[1]);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body, { withOwner = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (withOwner) Object.assign(headers, ownerHeaderForPath(path));
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json.code;
    err.payload = json;
    throw err;
  }
  return json;
}

const owner = { withOwner: true };

export const api = {
  // broadcasts
  listBroadcasts: () => request('GET', '/broadcasts'),
  createBroadcast: (data) => request('POST', '/broadcasts', data),
  getBroadcast: (id) => request('GET', `/broadcasts/${id}`),
  getBroadcastOwner: (id) => request('GET', `/broadcasts/${id}/owner`, null, owner),
  startBroadcast: (id) => request('POST', `/broadcasts/${id}/start`, null, owner),
  stopBroadcast: (id) => request('POST', `/broadcasts/${id}/stop`, null, owner),
  setPrivate: (id, isPrivate) =>
    request('POST', `/broadcasts/${id}/private`, { isPrivate }, owner),
  participantToken: (id, payload) =>
    request('POST', `/broadcasts/${id}/participant-token`, payload, owner),
  stats: (id) => request('GET', `/broadcasts/${id}/stats`),
  deleteBroadcast: (id) => request('DELETE', `/broadcasts/${id}`, null, owner),

  // viewers
  joinViewer: (id, payload) => request('POST', `/broadcasts/${id}/viewers/join`, payload),
  heartbeatViewer: (id, viewerId) =>
    request('POST', `/broadcasts/${id}/viewers/heartbeat`, { viewerId }),
  leaveViewer: (id, viewerId) => request('POST', `/broadcasts/${id}/viewers/leave`, { viewerId }),

  // private access (owner-only)
  grantPrivate: (id, payload) =>
    request('POST', `/broadcasts/${id}/private-access`, payload, owner),
  revokePrivate: (id, userId) =>
    request('DELETE', `/broadcasts/${id}/private-access/${encodeURIComponent(userId)}`, null, owner),
  listPrivate: (id) => request('GET', `/broadcasts/${id}/private-access`, null, owner),

  // notifications
  subscribeEmail: (id, email) =>
    request('POST', `/broadcasts/${id}/notifications/subscribe`, { email }, owner),

  // payment
  paymentIntent: (id, userId) =>
    request('POST', `/broadcasts/${id}/payment/intent`, { userId }),
  paymentConfirm: (id, payload) => request('POST', `/broadcasts/${id}/payment/confirm`, payload),

  // SSE event stream URL helper
  eventStreamUrl: (id) => `${BASE}/broadcasts/${id}/events`,
};
