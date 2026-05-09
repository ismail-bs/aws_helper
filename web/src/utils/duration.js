// Stream duration ticker. Anchors on the IVS-reported `startedAt` so that
// the timer survives reloads. Emits EV.STREAM_TIME_TICK every second.

import { dispatch } from './eventBus';
import { EV } from './events';

let timer = null;

export function startTicker(getStartedAt) {
  stopTicker();
  timer = setInterval(() => {
    const startedAt = getStartedAt();
    if (!startedAt) return;
    const seconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    );
    dispatch(EV.STREAM_TIME_TICK, { seconds, formatted: formatDuration(seconds) });
  }, 1000);
}

export function stopTicker() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function formatDuration(s) {
  s = Math.max(0, s | 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
