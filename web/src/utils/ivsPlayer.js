// Video.js + Amazon IVS Tech wrapper. The IVS tech gives us:
//   - Sub-3s low-latency HLS playback
//   - Native quality / health events
//   - The official integration the client linked.
//
// We load video.js + the IVS tech from CDN at runtime to avoid bundling
// the (rather large) WASM worker. The tech registers itself as
// `AmazonIVS` once loaded; we then create a player with that tech first.

const VIDEOJS_SRC = 'https://vjs.zencdn.net/8.10.0/video.min.js';
const IVS_TECH_SRC = 'https://player.live-video.net/1.51.0/amazon-ivs-videojs-tech.min.js';

let loadPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function ensureLoaded() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (!window.videojs) await loadScript(VIDEOJS_SRC);
    if (!window.registerIVSTech) await loadScript(IVS_TECH_SRC);
    window.registerIVSTech(window.videojs);
  })();
  return loadPromise;
}

/**
 * Create a Video.js player attached to the given <video> element with
 * the IVS tech registered.
 */
export async function createPlayer(videoEl, { onReady, onIVSEvent } = {}) {
  await ensureLoaded();
  const videojs = window.videojs;

  const player = videojs(videoEl, {
    techOrder: ['AmazonIVS'],
    autoplay: true,
    muted: false,
    controls: true,
    liveui: true,
    fill: true,        // fill the parent container; do NOT use fluid (breaks aspect-video)
    responsive: true,
  });

  // Return a Promise that resolves only after the player is fully ready
  // so callers can safely call setSrc immediately.
  await new Promise((resolve) => {
    player.ready(() => {
      onReady?.(player);
      if (onIVSEvent) {
        try {
          const ivs = player.getIVSPlayer();
          const types = player.getIVSEvents().PlayerEventType;
          const states = player.getIVSEvents().PlayerState;
          for (const ev of Object.values(types)) {
            ivs.addEventListener(ev, (data) => onIVSEvent(ev, data, { types, states }));
          }
          for (const st of Object.values(states)) {
            ivs.addEventListener(st, () => onIVSEvent('STATE', st, { types, states }));
          }
        } catch (err) {
          console.warn('[ivsPlayer] failed to attach IVS events', err);
        }
      }
      resolve();
    });
  });

  return player;
}

export function setSrc(player, url) {
  if (!player || !url) return;
  player.src(url);
  player.play().catch(() => {});
}

export function disposePlayer(player) {
  try { player?.dispose(); } catch (_) { /* noop */ }
}
