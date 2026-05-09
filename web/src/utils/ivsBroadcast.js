// Wrapper around the Amazon IVS Web Broadcast SDK (Real-time / Stages).
//
// Verified against amazon-ivs-web-broadcast d.ts:
//   - Stage(token, strategy)
//   - new LocalStageStream(track, config?)            // no `simulcast` field
//   - StageEvents.STAGE_CONNECTION_STATE_CHANGED -> StageConnectionState
//   - StageEvents.STAGE_PARTICIPANT_PUBLISH_STATE_CHANGED
//   - StageEvents.STAGE_PARTICIPANT_STREAMS_ADDED   <- remote streams arrive here
//   - StageEvents.STAGE_PARTICIPANT_STREAMS_REMOVED
//   - StageEvents.STAGE_PARTICIPANT_LEFT / JOINED
//   - StageStrategy.shouldSubscribeToParticipant returns SubscribeType.AUDIO_VIDEO
//   - LocalStageStream.requestQualityStats() -> { networkQuality }
//   - LocalStageStream.setMuted(true|false)
//
// Network quality is *polled* (the SDK has no QUALITY_CHANGED event). We
// surface results through the central event bus.

import {
  Stage,
  LocalStageStream,
  StageEvents,
  SubscribeType,
  StageConnectionState,
} from 'amazon-ivs-web-broadcast';
import { dispatch } from './eventBus';
import { EV } from './events';

let stage = null;
let strategy = null;
let cameraStream = null;     // raw MediaStream from getUserMedia
let cameraTrack = null;      // currently-published video MediaStreamTrack
let micTrack = null;
let publishedVideo = null;   // LocalStageStream wrapping cameraTrack
let publishedAudio = null;
let micMuted = false;
let videoMuted = false;
let paused = false;
let qualityPoller = null;

// Remote participants -> { id, info, streams: { audio?, video? } }
const remoteParticipants = new Map();
let onRemoteChanged = () => {};

// ---------------------------------------------------------------------------
// Local media
// ---------------------------------------------------------------------------

export async function listDevices() {
  await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((s) => s.getTracks().forEach((t) => t.stop()))
    .catch(() => {});
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: devices.filter((d) => d.kind === 'videoinput'),
    mics: devices.filter((d) => d.kind === 'audioinput'),
  };
}

export async function startLocalMedia({ cameraId, micId } = {}) {
  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: cameraId ? { deviceId: { exact: cameraId } } : { width: 1280, height: 720 },
    audio: micId ? { deviceId: { exact: micId } } : true,
  });
  cameraTrack = cameraStream.getVideoTracks()[0];
  micTrack = cameraStream.getAudioTracks()[0];
  return cameraStream;
}

export function stopLocalMedia() {
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
  cameraTrack = null;
  micTrack = null;
}

/**
 * Replace the currently-published video track. Used when the user enables
 * background blur / overlay filter / camera switch. Pass `null` to clear.
 */
export async function replaceVideoTrack(newTrack) {
  cameraTrack = newTrack;
  publishedVideo = newTrack ? new LocalStageStream(newTrack) : null;
  if (publishedVideo) publishedVideo.setMuted(videoMuted || paused);
  if (stage) stage.refreshStrategy();
}

export function getCameraTrack() { return cameraTrack; }

// ---------------------------------------------------------------------------
// Stage join / leave
// ---------------------------------------------------------------------------

export function setRemoteListener(fn) { onRemoteChanged = fn || (() => {}); }
export function getRemoteParticipants() { return Array.from(remoteParticipants.values()); }

function reportRemote() { onRemoteChanged(getRemoteParticipants()); }

export async function joinStage(token, { userId } = {}) {
  if (stage) await leaveStage();

  publishedVideo = cameraTrack ? new LocalStageStream(cameraTrack) : null;
  publishedAudio = micTrack ? new LocalStageStream(micTrack) : null;
  if (publishedVideo) publishedVideo.setMuted(videoMuted || paused);
  if (publishedAudio) publishedAudio.setMuted(micMuted || paused);

  strategy = {
    stageStreamsToPublish: () => {
      const out = [];
      if (publishedVideo) out.push(publishedVideo);
      if (publishedAudio) out.push(publishedAudio);
      return out;
    },
    shouldPublishParticipant: () => true,
    shouldSubscribeToParticipant: () => SubscribeType.AUDIO_VIDEO,
  };

  stage = new Stage(token, strategy);

  stage.on(StageEvents.STAGE_CONNECTION_STATE_CHANGED, (state) => {
    dispatch(EV.STATE_CHANGED, { connection: state });
    if (state === StageConnectionState.ERRORED) {
      dispatch(EV.TOAST, { kind: 'error', message: 'Stage connection errored' });
    } else if (state === StageConnectionState.DISCONNECTED) {
      dispatch(EV.TOAST, { kind: 'warning', message: 'Stage disconnected' });
    } else if (state === StageConnectionState.CONNECTED) {
      dispatch(EV.TOAST, { kind: 'success', message: 'Stage connected' });
    }
  });

  stage.on(StageEvents.STAGE_PARTICIPANT_PUBLISH_STATE_CHANGED, (info, state) => {
    dispatch(EV.STATE_CHANGED, { participant: info, publishState: state });
  });

  stage.on(StageEvents.STAGE_PARTICIPANT_JOINED, (info) => {
    if (info.isLocal) return;
    if (!remoteParticipants.has(info.id)) {
      remoteParticipants.set(info.id, { id: info.id, info, streams: {} });
      reportRemote();
    }
  });

  stage.on(StageEvents.STAGE_PARTICIPANT_LEFT, (info) => {
    remoteParticipants.delete(info.id);
    reportRemote();
  });

  stage.on(StageEvents.STAGE_PARTICIPANT_STREAMS_ADDED, (info, streams) => {
    if (info.isLocal) return;
    const entry = remoteParticipants.get(info.id) || { id: info.id, info, streams: {} };
    for (const s of streams) {
      const kind = s?.mediaStreamTrack?.kind;
      if (kind === 'video') entry.streams.video = s;
      else if (kind === 'audio') entry.streams.audio = s;
    }
    remoteParticipants.set(info.id, entry);
    reportRemote();
  });

  stage.on(StageEvents.STAGE_PARTICIPANT_STREAMS_REMOVED, (info, streams) => {
    const entry = remoteParticipants.get(info.id);
    if (!entry) return;
    for (const s of streams) {
      const kind = s?.mediaStreamTrack?.kind;
      if (entry.streams[kind] === s) delete entry.streams[kind];
    }
    remoteParticipants.set(info.id, entry);
    reportRemote();
  });

  stage.on(StageEvents.ERROR, (err) => {
    dispatch(EV.TOAST, { kind: 'error', message: `Stage error: ${err?.message || err}` });
  });

  await stage.join();
  startQualityPolling();
  return stage;
}

export async function leaveStage() {
  stopQualityPolling();
  if (stage) {
    try { await stage.leave(); } catch (_) { /* noop */ }
    stage = null;
  }
  remoteParticipants.clear();
  reportRemote();
}

// ---------------------------------------------------------------------------
// Mute / pause controls
// ---------------------------------------------------------------------------

function applyMutedState() {
  if (publishedVideo) publishedVideo.setMuted(videoMuted || paused);
  if (publishedAudio) publishedAudio.setMuted(micMuted || paused);
}

export function setMicMuted(muted) {
  micMuted = !!muted;
  applyMutedState();
}
export function getMicMuted() { return micMuted; }

export function setVideoMuted(muted) {
  videoMuted = !!muted;
  applyMutedState();
}
export function getVideoMuted() { return videoMuted; }

/**
 * "Pause feed": mute BOTH mic and video as a single broadcaster control.
 * Viewers will see the last frame from the IVS channel (the channel keeps
 * broadcasting black/silent). Pair with the private/public toggle for full
 * privacy.
 */
export function setPaused(p) {
  paused = !!p;
  applyMutedState();
}
export function getPaused() { return paused; }

export function isJoined() { return !!stage; }

// ---------------------------------------------------------------------------
// Network quality (polled — no event in the SDK)
// ---------------------------------------------------------------------------

function startQualityPolling() {
  stopQualityPolling();
  qualityPoller = setInterval(async () => {
    try {
      if (!publishedVideo) return;
      const stats = await publishedVideo.requestQualityStats();
      const sample = Array.isArray(stats) ? stats[0] : null;
      if (sample?.networkQuality !== undefined) {
        dispatch(EV.CONNECTION_QUALITY, { quality: sample.networkQuality });
      }
    } catch (_) { /* ignore */ }
  }, 4000);
}

function stopQualityPolling() {
  if (qualityPoller) clearInterval(qualityPoller);
  qualityPoller = null;
}
