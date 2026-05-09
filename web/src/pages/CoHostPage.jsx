// Co-host page: a guest broadcaster who joins the same stage with a
// participant token issued by the studio owner. Same publishing pipeline
// as the studio, minus owner-only controls (start/stop broadcast,
// private toggle, granting access).

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, CardTitle } from '../components/Card';
import RemoteParticipantTile from '../components/RemoteParticipantTile';

import { dispatch, listen } from '../utils/eventBus';
import { EV } from '../utils/events';
import { api } from '../utils/api';
import {
  startLocalMedia, stopLocalMedia, joinStage, leaveStage,
  setMicMuted, setVideoMuted, setPaused,
  setRemoteListener, getRemoteParticipants,
} from '../utils/ivsBroadcast';

export default function CoHostPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const initialName = search.get('name') || `Cohost_${Math.random().toString(36).slice(2, 6)}`;
  const presetToken = search.get('token') || null;

  const videoRef = useRef(null);
  const [displayName, setDisplayName] = useState(initialName);
  const [userId] = useState(() => `cohost_${Math.random().toString(36).slice(2, 8)}`);
  const [cameraReady, setCameraReady] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [paused, setPausedState] = useState(false);
  const [micMuted, setMicMutedState] = useState(false);
  const [videoMuted, setVideoMutedState] = useState(false);
  const [remotes, setRemotes] = useState([]);

  useEffect(() => {
    setRemoteListener(setRemotes);
    return () => { setRemoteListener(null); };
  }, []);

  useEffect(() => {
    return () => { leaveStage(); stopLocalMedia(); };
  }, []);

  async function onStartCamera() {
    try {
      const stream = await startLocalMedia();
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
      setCameraReady(true);
    } catch (err) {
      dispatch(EV.TOAST, { kind: 'error', message: `Camera error: ${err.message}` });
    }
  }

  async function onJoin() {
    try {
      // Prefer the pre-issued token from the invite link; fall back to
      // requesting a fresh one if the URL has none.
      const token = presetToken
        ? presetToken
        : (await api.participantToken(id, { userId, displayName })).token;
      await joinStage(token, { userId });
      setStreaming(true);
      setRemotes(getRemoteParticipants());
      dispatch(EV.TOAST, { kind: 'success', message: 'You are LIVE as a co-host' });
    } catch (err) {
      dispatch(EV.TOAST, { kind: 'error', message: `Join failed: ${err.message}` });
    }
  }

  async function onLeave() {
    await leaveStage();
    stopLocalMedia();
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
    setStreaming(false);
  }

  function onPause() { const v = !paused; setPausedState(v); setPaused(v); }
  function onMic() { const v = !micMuted; setMicMutedState(v); setMicMuted(v); }
  function onVideo() { const v = !videoMuted; setVideoMutedState(v); setVideoMuted(v); }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardTitle className="mb-1">Co-host studio</CardTitle>
          <div className="text-xs text-slate-400 mb-3">Broadcast: {id}</div>

          <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            {!cameraReady && (
              <div className="absolute inset-0 grid place-items-center text-slate-400 text-sm">
                Click "Start camera" to preview your feed.
              </div>
            )}
            {streaming && (
              <div className="absolute top-3 left-3 px-2 py-1 rounded bg-rose-500 text-xs font-semibold tracking-wide">
                ● LIVE (cohost)
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!cameraReady ? (
              <button className="btn btn-primary" onClick={onStartCamera}>📷 Start camera</button>
            ) : (
              !streaming ? (
                <button className="btn btn-success" onClick={onJoin}>🔴 Join broadcast</button>
              ) : (
                <button className="btn btn-danger" onClick={onLeave}>⏹ Leave broadcast</button>
              )
            )}
            <button className="btn btn-ghost" onClick={onPause} disabled={!streaming}>
              {paused ? '▶️ Resume' : '⏸ Pause'}
            </button>
            <button className="btn btn-ghost" onClick={onMic}>
              {micMuted ? '🔇 Unmute mic' : '🎤 Mute mic'}
            </button>
            <button className="btn btn-ghost" onClick={onVideo}>
              {videoMuted ? '📷 Show video' : '🚫 Hide video'}
            </button>
          </div>
        </Card>

        {remotes.length > 0 && (
          <Card>
            <CardTitle>Other broadcasters</CardTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {remotes.map((p) => (
                <RemoteParticipantTile key={p.id} participant={p} />
              ))}
            </div>
          </Card>
        )}
      </div>

      <div>
        <Card>
          <CardTitle>Your identity</CardTitle>
          <label className="text-xs text-slate-400">Display name</label>
          <input className="form-input mt-1 mb-3" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)} disabled={streaming} />
          <div className="text-xs text-slate-400">Participant ID: {userId}</div>
          <p className="text-xs text-slate-500 mt-3">
            You're joining as a co-host. Your video is mixed into the broadcast
            alongside the main host so all viewers see both feeds.
          </p>
        </Card>
      </div>

    </div>
  );
}
