// Meet-style background switch: blur, virtual background image, or none.
// Pipeline:
//   raw camera track -> <video> -> MediaPipe Selfie Segmentation -> <canvas>
//   -> canvas.captureStream() -> we hand the new track to ivsBroadcast.
//
// The MediaPipe model files are loaded from the official CDN at runtime so
// we don't bloat the bundle. If MediaPipe fails to load (offline) we fall
// back to the original camera track silently.

let segmenter = null;
let renderRAF = null;
let sourceVideo = null;
let outputCanvas = null;
let outputCtx = null;
let outputStream = null;
let mode = 'none'; // 'none' | 'blur' | 'image'
let bgImage = null;

const MEDIAPIPE_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation';

async function loadSegmenter() {
  if (segmenter) return segmenter;
  // MediaPipe ships a global script; we load it dynamically.
  await new Promise((resolve, reject) => {
    if (window.SelfieSegmentation) return resolve();
    const s = document.createElement('script');
    s.src = `${MEDIAPIPE_BASE}/selfie_segmentation.js`;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  const SelfieSegmentation = window.SelfieSegmentation;
  segmenter = new SelfieSegmentation({
    locateFile: (file) => `${MEDIAPIPE_BASE}/${file}`,
  });
  segmenter.setOptions({ modelSelection: 1, selfieMode: true });
  return segmenter;
}

function ensureSurfaces(track) {
  if (!sourceVideo) {
    sourceVideo = document.createElement('video');
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
  }
  if (sourceVideo.srcObject !== track) {
    sourceVideo.srcObject = new MediaStream([track]);
    sourceVideo.play().catch(() => {});
  }
  if (!outputCanvas) {
    outputCanvas = document.createElement('canvas');
    outputCanvas.width = 1280;
    outputCanvas.height = 720;
    outputCtx = outputCanvas.getContext('2d');
  }
  if (!outputStream) {
    outputStream = outputCanvas.captureStream(30);
  }
}

function drawBackground(ctx, w, h) {
  if (mode === 'image' && bgImage && bgImage.complete) {
    ctx.drawImage(bgImage, 0, 0, w, h);
  } else if (mode === 'blur') {
    ctx.filter = 'blur(12px)';
    ctx.drawImage(sourceVideo, 0, 0, w, h);
    ctx.filter = 'none';
  } else {
    ctx.drawImage(sourceVideo, 0, 0, w, h);
  }
}

function onResults(results) {
  if (!outputCtx) return;
  const w = outputCanvas.width;
  const h = outputCanvas.height;
  outputCtx.save();
  outputCtx.clearRect(0, 0, w, h);
  if (mode === 'none') {
    outputCtx.drawImage(sourceVideo, 0, 0, w, h);
  } else {
    drawBackground(outputCtx, w, h);
    outputCtx.globalCompositeOperation = 'destination-out';
    outputCtx.drawImage(results.segmentationMask, 0, 0, w, h);
    outputCtx.globalCompositeOperation = 'source-over';
    outputCtx.drawImage(sourceVideo, 0, 0, w, h);
  }
  outputCtx.restore();
}

async function tick() {
  if (!segmenter || !sourceVideo || sourceVideo.readyState < 2) {
    renderRAF = requestAnimationFrame(tick);
    return;
  }
  await segmenter.send({ image: sourceVideo });
  renderRAF = requestAnimationFrame(tick);
}

/**
 * Apply a background mode and return a NEW MediaStreamTrack to publish.
 * Pass `mode = 'none'` to disable and return the original track.
 */
export async function applyBackground(originalTrack, newMode, imageUrl) {
  mode = newMode || 'none';
  ensureSurfaces(originalTrack);

  if (mode === 'image' && imageUrl) {
    bgImage = new Image();
    bgImage.crossOrigin = 'anonymous';
    bgImage.src = imageUrl;
  }

  if (mode === 'none') {
    if (renderRAF) cancelAnimationFrame(renderRAF);
    renderRAF = null;
    if (segmenter) segmenter.onResults(() => {});
    return originalTrack;
  }

  try {
    const seg = await loadSegmenter();
    seg.onResults(onResults);
    if (!renderRAF) tick();
    return outputStream.getVideoTracks()[0];
  } catch (err) {
    console.warn('[background] MediaPipe load failed, returning raw track', err);
    return originalTrack;
  }
}

export function teardownBackground() {
  if (renderRAF) cancelAnimationFrame(renderRAF);
  renderRAF = null;
  outputStream?.getTracks().forEach((t) => t.stop());
  outputStream = null;
  outputCanvas = null;
  outputCtx = null;
  sourceVideo = null;
  bgImage = null;
  mode = 'none';
}
