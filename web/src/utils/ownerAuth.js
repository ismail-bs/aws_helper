// Stores the owner bearer token per broadcast in sessionStorage so that the
// studio (and only the studio) can call mutating endpoints. Tokens never
// leave the browser of the user who created the broadcast.

const KEY = (id) => `ivsrt.ownerToken.${id}`;

export function setOwnerToken(broadcastId, token) {
  if (!broadcastId || !token) return;
  try { sessionStorage.setItem(KEY(broadcastId), token); } catch (_) { /* noop */ }
}

export function getOwnerToken(broadcastId) {
  if (!broadcastId) return null;
  try { return sessionStorage.getItem(KEY(broadcastId)); } catch (_) { return null; }
}

export function clearOwnerToken(broadcastId) {
  try { sessionStorage.removeItem(KEY(broadcastId)); } catch (_) { /* noop */ }
}
