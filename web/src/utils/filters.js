// Lightweight Snapchat-style overlay filters.
//
// The "filter" pipeline composites the camera frame onto a canvas and draws
// emoji / sticker overlays on top using simple face-position heuristics. We
// intentionally keep this dependency-free so the demo runs offline.
//
// Available filters:
//   - 'none'       : pass-through
//   - 'sunglasses' : draws sunglasses near the upper third of the frame
//   - 'party'      : draws a party hat + confetti
//   - 'sparkle'    : draws floating sparkle emoji
//
// In a real build you would swap this for a face-tracking lib like
// face-api.js or MediaPipe FaceMesh.

let renderRAF = null;
let sourceVideo = null;
let canvas = null;
let ctx = null;
let outputStream = null;
let activeFilter = 'none';

const EMOJI = {
  sunglasses: '🕶️',
  party: '🎉',
  sparkle: '✨',
};

function ensure(track) {
  if (!sourceVideo) {
    sourceVideo = document.createElement('video');
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
  }
  if (sourceVideo.srcObject !== track) {
    sourceVideo.srcObject = new MediaStream([track]);
    sourceVideo.play().catch(() => {});
  }
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    ctx = canvas.getContext('2d');
  }
  if (!outputStream) outputStream = canvas.captureStream(30);
}

function drawSunglasses() {
  ctx.font = '180px serif';
  ctx.textAlign = 'center';
  ctx.fillText(EMOJI.sunglasses, canvas.width / 2, canvas.height / 2.6);
}

function drawParty() {
  ctx.font = '160px serif';
  ctx.textAlign = 'center';
  ctx.fillText(EMOJI.party, canvas.width / 2, 180);
  // confetti
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = `hsl(${(performance.now() / 10 + i * 18) % 360},80%,60%)`;
    const x = (i * 73 + (performance.now() / 8) % canvas.width) % canvas.width;
    const y = (i * 47 + (performance.now() / 12) % canvas.height) % canvas.height;
    ctx.fillRect(x, y, 8, 14);
  }
}

function drawSparkle() {
  ctx.font = '90px serif';
  for (let i = 0; i < 8; i++) {
    const x = (Math.sin(performance.now() / 600 + i) + 1) * canvas.width / 2;
    const y = (Math.cos(performance.now() / 700 + i * 2) + 1) * canvas.height / 2;
    ctx.fillText(EMOJI.sparkle, x, y);
  }
}

function tick() {
  if (sourceVideo && sourceVideo.readyState >= 2) {
    ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
    if (activeFilter === 'sunglasses') drawSunglasses();
    else if (activeFilter === 'party') drawParty();
    else if (activeFilter === 'sparkle') drawSparkle();
  }
  renderRAF = requestAnimationFrame(tick);
}

/** Apply a filter and return a NEW track. 'none' returns original. */
export function applyFilter(originalTrack, name) {
  activeFilter = name || 'none';
  if (activeFilter === 'none') {
    if (renderRAF) cancelAnimationFrame(renderRAF);
    renderRAF = null;
    return originalTrack;
  }
  ensure(originalTrack);
  if (!renderRAF) tick();
  return outputStream.getVideoTracks()[0];
}

export function teardownFilters() {
  if (renderRAF) cancelAnimationFrame(renderRAF);
  renderRAF = null;
  outputStream?.getTracks().forEach((t) => t.stop());
  outputStream = null;
  canvas = null;
  ctx = null;
  sourceVideo = null;
  activeFilter = 'none';
}

export const AVAILABLE_FILTERS = ['none', 'sunglasses', 'party', 'sparkle'];
