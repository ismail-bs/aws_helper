// Subscribes to the backend SSE stream and forwards every event onto the
// central event bus as EV.REMOTE_NOTIFICATION. Components can react with
// listen(EV.REMOTE_NOTIFICATION, fn).

import { dispatch } from './eventBus';
import { EV } from './events';
import { api } from './api';

export function openEventStream(broadcastId) {
  const url = api.eventStreamUrl(broadcastId);
  const es = new EventSource(url);

  // Track whether we've already shown an error toast so we don't spam
  // the user on every EventSource reconnect attempt.
  let errorToastShown = false;

  const handler = (evt) => {
    // A successful message means the connection is (re)established.
    errorToastShown = false;
    try {
      const data = JSON.parse(evt.data);
      dispatch(EV.REMOTE_NOTIFICATION, data);
    } catch (_) { /* ignore malformed */ }
  };

  // Catch every SNS-style event type. They all carry { type, ... }.
  ['broadcast.started', 'broadcast.ended',
   'broadcast.private.on', 'broadcast.private.off',
   'viewer.joined', 'viewer.left',
   'private.access.granted', 'private.access.revoked',
   'participant.joined'].forEach((t) => es.addEventListener(t, handler));

  es.addEventListener('ready', handler);

  es.onerror = () => {
    // Browser fires onerror on every reconnect attempt — only toast once.
    if (!errorToastShown) {
      errorToastShown = true;
      dispatch(EV.TOAST, { kind: 'warning', message: 'Realtime event stream interrupted — reconnecting…' });
    }
  };

  return () => es.close();
}
