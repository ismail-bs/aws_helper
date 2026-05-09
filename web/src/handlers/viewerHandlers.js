// Viewer-side event handlers.
import { listenMany, dispatch } from '../utils/eventBus';
import { EV } from '../utils/events';
import { api } from '../utils/api';

const HEARTBEAT_INTERVAL_MS = 30 * 1000;
let heartbeatTimer = null;
let session = null; // { broadcastId, viewerId }

function toast(kind, message) {
  dispatch(EV.TOAST, { kind, message });
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    if (!session) return;
    try {
      await api.heartbeatViewer(session.broadcastId, session.viewerId);
    } catch (err) {
      // Heartbeat failures are usually transient; surface only the first.
      console.warn('[heartbeat] failed', err.message);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

export function attachViewerHandlers() {
  return listenMany({
    [EV.VIEWER_JOIN]: async ({ broadcastId, viewerId, displayName, mode, paymentIntentId }) => {
      try {
        const out = await api.joinViewer(broadcastId, {
          viewerId,
          displayName,
          mode,
          paymentIntentId,
        });
        session = { broadcastId, viewerId: out.viewer.viewerId };
        startHeartbeat();
        dispatch(EV.STATE_CHANGED, {
          viewer: out.viewer,
          playbackUrl: out.playbackUrl,
          broadcast: out.broadcast,
        });
      } catch (err) {
        if (err.code === 'PAYMENT_REQUIRED') {
          toast('warning', 'Payment required to view this broadcast');
        } else if (err.code === 'MAX_VIEWERS_REACHED') {
          toast('error', 'This broadcast is full');
        } else if (err.code === 'PRIVATE_ACCESS_DENIED') {
          toast('error', 'You do not have access to the private session');
        } else {
          toast('error', `Join failed: ${err.message}`);
        }
        dispatch(EV.STATE_CHANGED, { error: err });
      }
    },

    [EV.VIEWER_LEAVE]: async () => {
      if (!session) return;
      stopHeartbeat();
      try {
        await api.leaveViewer(session.broadcastId, session.viewerId);
      } catch (_) { /* ignore */ }
      session = null;
    },

    [EV.VIEWER_PAYMENT_CONFIRM]: async ({ broadcastId, intentId, code }) => {
      try {
        const intent = await api.paymentConfirm(broadcastId, { intentId, code });
        toast('success', 'Payment confirmed');
        dispatch(EV.STATE_CHANGED, { paymentIntent: intent });
      } catch (err) {
        toast('error', `Payment failed: ${err.message}`);
      }
    },
  });
}

export function getViewerSession() { return session; }
