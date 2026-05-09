// Network-quality + internet-cutout detection.
//
// We watch three signals and surface them on the central event bus:
//   1. window 'online'/'offline' (covers OS-level disconnects, VPN drops)
//   2. SSE EventSource readyState (covers our backend reachability)
//   3. periodic /healthz fetch with timeout (covers wifi captive portals)
//
// Components subscribe via EV.CONNECTION_ONLINE / EV.CONNECTION_OFFLINE /
// EV.CONNECTION_QUALITY.

import { dispatch } from './eventBus';
import { EV } from './events';

let healthTimer = null;
let lastOnline = navigator.onLine;
let consecutiveFailures = 0;

function notify(online) {
  if (online === lastOnline) return;
  lastOnline = online;
  dispatch(online ? EV.CONNECTION_ONLINE : EV.CONNECTION_OFFLINE, {
    at: new Date().toISOString(),
  });
  dispatch(EV.TOAST, {
    kind: online ? 'success' : 'error',
    message: online
      ? 'Internet connection restored'
      : 'Internet connection lost',
  });
}

async function probe() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch('/healthz', { signal: ctrl.signal, cache: 'no-store' });
    if (res.ok) {
      consecutiveFailures = 0;
      notify(true);
      return;
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (_) {
    consecutiveFailures++;
    if (consecutiveFailures >= 2) notify(false);
  } finally {
    clearTimeout(t);
  }
}

export function startConnectionMonitor() {
  window.addEventListener('online', () => notify(true));
  window.addEventListener('offline', () => notify(false));
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(probe, 5000);
  probe();
}

export function stopConnectionMonitor() {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = null;
}

/**
 * Map IVS NetworkQuality (numeric enum from amazon-ivs-web-broadcast) to UI:
 *   1 POOR, 2 BAD, 3 FAIR, 4 EXCELLENT, 0/null/undefined => unknown.
 * Also accepts the older string forms ("POOR" / "HIGH") as a fallback.
 */
export function describeQuality(q) {
  const map = {
    1: { label: 'Poor connection', tone: 'danger' },
    2: { label: 'Bad connection', tone: 'danger' },
    3: { label: 'Fair connection', tone: 'warning' },
    4: { label: 'Excellent connection', tone: 'ok' },
  };
  if (typeof q === 'number') return map[q] || { label: 'Unknown', tone: 'muted' };
  switch (String(q || '').toUpperCase()) {
    case 'POOR': return map[1];
    case 'BAD':  return map[2];
    case 'FAIR': case 'NORMAL': return map[3];
    case 'EXCELLENT': case 'HIGH': return map[4];
    default: return { label: q || 'Unknown', tone: 'muted' };
  }
}
