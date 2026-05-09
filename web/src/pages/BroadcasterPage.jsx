import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardTitle } from '../components/Card';
import StatChip from '../components/StatChip';

import { dispatch, listen } from '../utils/eventBus';
import { EV } from '../utils/events';
import { api } from '../utils/api';
import {
  startLocalMedia, stopLocalMedia,
  setRemoteListener, getRemoteParticipants,
} from '../utils/ivsBroadcast';
import { startTicker, stopTicker } from '../utils/duration';
import { openEventStream } from '../utils/sse';
import { AVAILABLE_FILTERS } from '../utils/filters';
import RemoteParticipantTile from '../components/RemoteParticipantTile';

const BG_PRESETS = [
  { id: 'none', label: 'No BG' },
  { id: 'blur', label: 'Blur' },
  {
    id: 'image',
    label: 'Beach',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1280&q=60',
  },
  {
    id: 'image',
    label: 'Office',
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1280&q=60',
  },
];

export default function BroadcasterPage() {
  const { id } = useParams();
  const videoRef = useRef(null);

  const [broadcast, setBroadcast] = useState(null);
  const [stats, setStats] = useState(null);
  const [duration, setDuration] = useState('00:00');
  const [cameraReady, setCameraReady] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [paused, setPaused] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [filter, setFilter] = useState('none');
  const [bgKey, setBgKey] = useState('none|');
  const [grantUserId, setGrantUserId] = useState('');
  const [grantName, setGrantName] = useState('');
  const [privateList, setPrivateList] = useState([]);
  const [email, setEmail] = useState('');
  const [feed, setFeed] = useState([]); // remote SNS notifications
  const [remotes, setRemotes] = useState([]);
  const [coHostName, setCoHostName] = useState('');
  const [coHostLink, setCoHostLink] = useState(null);

  // Owner-aware fetch on mount
  useEffect(() => {
    api.getBroadcastOwner(id).then(setBroadcast).catch(() =>
      api.getBroadcast(id).then(setBroadcast)
    );
    refreshPrivate();
    const closeStream = openEventStream(id);
    return closeStream;
  }, [id]);

  // Subscribe to remote participants from the SDK helper.
  useEffect(() => {
    setRemoteListener(setRemotes);
    setRemotes(getRemoteParticipants());
    return () => setRemoteListener(null);
  }, []);

  // Listen to global events
  useEffect(() => {
    const offState = listen(EV.STATE_CHANGED, (detail) => {
      if (detail?.broadcast?.id === id) setBroadcast((prev) => ({ ...prev, ...detail.broadcast }));
    });
    const offTick = listen(EV.STREAM_TIME_TICK, ({ formatted }) => setDuration(formatted));
    const offRemote = listen(EV.REMOTE_NOTIFICATION, (evt) => {
      setFeed((p) => [evt, ...p].slice(0, 30));
      if (evt.type === 'private.access.granted' || evt.type === 'private.access.revoked') {
        refreshPrivate();
      }
      // Refresh audience stats immediately on viewer join/leave events.
      if (evt.type === 'viewer.joined' || evt.type === 'viewer.left') {
        api.stats(id).then(setStats).catch(() => {});
      }
    });
    // Update the preview <video> when a filter/background track replaces the camera.
    const offPreview = listen(EV.PREVIEW_TRACK_CHANGED, ({ track }) => {
      if (!videoRef.current) return;
      const ms = new MediaStream([track]);
      videoRef.current.srcObject = ms;
      videoRef.current.play().catch(() => {});
    });
    return () => { offState(); offTick(); offRemote(); offPreview(); };
  }, [id]);

  // Stats poller (uses IVS GetStream + DDB heartbeat counts)
  useEffect(() => {
    if (!broadcast?.id) return;
    let cancelled = false;
    async function pull() {
      try {
        const s = await api.stats(broadcast.id);
        if (!cancelled) setStats(s);
      } catch (_) { /* noop */ }
    }
    pull();
    const t = setInterval(pull, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [broadcast?.id, streaming]);

  // Stream-duration ticker
  useEffect(() => {
    if (broadcast?.startedAt && streaming) {
      startTicker(() => broadcast.startedAt);
    } else {
      stopTicker();
      setDuration('00:00');
    }
    return () => stopTicker();
  }, [broadcast?.startedAt, streaming]);

  async function refreshPrivate() {
    try {
      setPrivateList(await api.listPrivate(id));
    } catch (_) { /* noop */ }
  }

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

  function onStopCamera() {
    stopLocalMedia();
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }

  function onStartBroadcast() {
    const ownerInfo = JSON.parse(sessionStorage.getItem(`broadcast.${id}.owner`) || '{}');
    dispatch(EV.BROADCAST_START, {
      id,
      userId: ownerInfo.ownerUserId || broadcast?.ownerUserId || `host_${id}`,
      displayName: ownerInfo.title || 'Broadcaster',
    });
    setStreaming(true);
  }

  function onStopBroadcast() {
    dispatch(EV.BROADCAST_STOP, { id });
    setStreaming(false);
  }

  function onPause() {
    const v = !paused;
    setPaused(v);
    dispatch(EV.BROADCAST_PAUSE_TOGGLE, { paused: v });
  }
  function onMic() {
    const v = !micMuted;
    setMicMuted(v);
    dispatch(EV.BROADCAST_MIC_TOGGLE, { muted: v });
  }
  function onVideo() {
    const v = !videoMuted;
    setVideoMuted(v);
    dispatch(EV.BROADCAST_VIDEO_TOGGLE, { muted: v });
  }
  function onFilter(name) {
    setFilter(name);
    dispatch(EV.BROADCAST_FILTER_CHANGE, { filter: name });
  }
  function onBackground(preset) {
    const key = `${preset.id}|${preset.url || ''}`;
    setBgKey(key);
    dispatch(EV.BROADCAST_BACKGROUND_CHANGE, { mode: preset.id, imageUrl: preset.url });
  }
  function onPrivateToggle() {
    dispatch(EV.BROADCAST_PRIVATE_TOGGLE, { id, isPrivate: !broadcast?.isPrivate });
  }
  function onGrant(e) {
    e.preventDefault();
    if (!grantUserId) return;
    dispatch(EV.BROADCAST_GRANT_PRIVATE, { id, userId: grantUserId, displayName: grantName });
    setGrantUserId(''); setGrantName('');
  }
  function onRevoke(userId) {
    dispatch(EV.BROADCAST_REVOKE_PRIVATE, { id, userId });
  }
  function onSubscribe(e) {
    e.preventDefault();
    if (!email) return;
    dispatch(EV.BROADCAST_NOTIFICATIONS_SUBSCRIBE, { id, email });
    setEmail('');
  }

  async function onInviteCoHost(e) {
    e.preventDefault();
    const name = (coHostName || `Cohost_${Math.random().toString(36).slice(2, 6)}`).trim();
    try {
      const tk = await api.participantToken(id, {
        userId: `cohost_${Math.random().toString(36).slice(2, 8)}`,
        displayName: name,
        capabilities: ['PUBLISH', 'SUBSCRIBE'],
      });
      // Hand the token to the cohost via the URL. In production this would be
      // a one-shot signed link, but for the demo we paste the token directly.
      const link = `${window.location.origin}/cohost/${id}?name=${encodeURIComponent(name)}&token=${encodeURIComponent(tk.token)}`;
      setCoHostLink(link);
      try { await navigator.clipboard.writeText(link); } catch (_) { /* ignore */ }
      dispatch(EV.TOAST, { kind: 'success', message: `Co-host link copied for ${name}` });
    } catch (err) {
      dispatch(EV.TOAST, { kind: 'error', message: `Invite failed: ${err.message}` });
    }
  }

  if (!broadcast) {
    return <p className="text-slate-400">Loading broadcast {id}…</p>;
  }

  const watchUrl = `${window.location.origin}/watch/${id}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* LEFT: video + controls */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <CardTitle className="mb-1">{broadcast.title}</CardTitle>
              <div className="text-xs text-slate-400">
                {broadcast.id} ·{' '}
                <span className={broadcast.isPrivate ? 'text-amber-300' : 'text-emerald-300'}>
                  {broadcast.isPrivate ? '🔒 Private session' : '🌍 Public'}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <StatChip label="State" value={broadcast.status}
                tone={broadcast.status === 'live' ? 'live' : 'default'} />
              <StatChip label="Duration" value={duration}
                tone={streaming ? 'live' : 'default'} />
            </div>
          </div>

          <div className="relative w-full bg-black rounded-xl overflow-hidden" style={{ paddingBottom: '56.25%' }}>
            <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
            {!cameraReady && (
              <div className="absolute inset-0 grid place-items-center text-slate-400 text-sm">
                Click "Start camera" to preview your feed.
              </div>
            )}
            {streaming && (
              <div className="absolute top-3 left-3 px-2 py-1 rounded bg-rose-500 text-xs font-semibold tracking-wide">
                ● LIVE
              </div>
            )}
            {broadcast.isPrivate && (
              <div className="absolute top-3 right-3 px-2 py-1 rounded bg-amber-500/90 text-slate-900 text-xs font-semibold">
                🔒 PRIVATE
              </div>
            )}
          </div>

          {/* Control bar */}
          <div className="mt-4 flex flex-wrap gap-2">
            {!cameraReady ? (
              <button className="btn btn-primary" onClick={onStartCamera}>📷 Start camera</button>
            ) : (
              <button className="btn btn-ghost" onClick={onStopCamera}>📷 Stop camera</button>
            )}
            {!streaming ? (
              <button className="btn btn-success" disabled={!cameraReady} onClick={onStartBroadcast}>
                🔴 Go live
              </button>
            ) : (
              <button className="btn btn-danger" onClick={onStopBroadcast}>⏹ End broadcast</button>
            )}
            <button className="btn btn-ghost" onClick={onPause} disabled={!streaming}>
              {paused ? '▶️ Resume feed' : '⏸ Pause feed'}
            </button>
            <button className="btn btn-ghost" onClick={onMic}>
              {micMuted ? '🔇 Unmute mic' : '🎤 Mute mic'}
            </button>
            <button className="btn btn-ghost" onClick={onVideo}>
              {videoMuted ? '📷 Show video' : '🚫 Hide video'}
            </button>
            <button className="btn btn-warning" onClick={onPrivateToggle} disabled={!streaming}>
              {broadcast.isPrivate ? '🌍 Resume public' : '🔒 Go private'}
            </button>
          </div>
        </Card>

        {remotes.length > 0 && (
          <Card>
            <CardTitle>Co-hosts ({remotes.length})</CardTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {remotes.map((p) => (
                <RemoteParticipantTile key={p.id} participant={p} />
              ))}
            </div>
          </Card>
        )}

        <Card>
          <CardTitle>Filters & background</CardTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {AVAILABLE_FILTERS.map((f) => (
              <button key={f}
                className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => onFilter(f)}
              >{f === 'none' ? 'No filter' : f}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {BG_PRESETS.map((p, i) => {
              const key = `${p.id}|${p.url || ''}`;
              return (
                <button key={i}
                  className={`btn ${bgKey === key ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => onBackground(p)}
                >{p.label}</button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardTitle>Audience</CardTitle>
          {!stats && <p className="text-slate-400 text-sm">Stats not yet available.</p>}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <StatChip label="AWS viewers" value={stats.awsViewerCount ?? '—'} tone="info" />
              <StatChip label="Public (DDB)" value={stats.ddbViewerCounts.public} />
              <StatChip label="Private (DDB)" value={stats.ddbViewerCounts.private}
                tone={stats.ddbViewerCounts.private > 0 ? 'private' : 'default'} />
              <StatChip label="Stream health" value={stats.awsHealth || '—'}
                tone={stats.awsHealth === 'HEALTHY' ? 'ok' : 'default'} />
            </div>
          )}
          {stats?.privateAttendees?.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-slate-400 mb-1">In private session:</div>
              <div className="flex flex-wrap gap-2">
                {stats.privateAttendees.map((v) => (
                  <span key={v.viewerId}
                    className="bg-amber-500/15 text-amber-300 border border-amber-500/40 rounded px-2 py-0.5 text-xs">
                    {v.displayName}
                  </span>
                ))}
              </div>
            </div>
          )}
          {stats?.publicViewers?.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-1">Public viewers:</div>
              <div className="flex flex-wrap gap-2">
                {stats.publicViewers.map((v) => (
                  <span key={v.viewerId}
                    className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-0.5 text-xs">
                    {v.displayName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* RIGHT: meta + private access + notifications + feed */}
      <div className="space-y-6">
        <Card>
          <CardTitle>Share</CardTitle>
          <p className="text-sm text-slate-400 mb-2">Anyone with this link can watch the public feed:</p>
          <input readOnly className="form-input mb-3" value={watchUrl} onClick={(e) => e.target.select()} />
          <div className="flex gap-2">
            <Link className="btn btn-ghost" to={`/watch/${id}`} target="_blank">Open viewer ↗</Link>
            <Link className="btn btn-ghost" to={`/watch/${id}?mode=private`} target="_blank">Private viewer ↗</Link>
          </div>
        </Card>

        <Card>
          <CardTitle>Invite a co-host</CardTitle>
          <p className="text-xs text-slate-400 mb-2">
            Generates a one-time link with a participant token. The co-host
            opens it, starts their camera, and joins the same stage. Their
            video appears next to yours for all viewers.
          </p>
          <form onSubmit={onInviteCoHost} className="flex gap-2">
            <input className="form-input flex-1" placeholder="Co-host name"
              value={coHostName} onChange={(e) => setCoHostName(e.target.value)} />
            <button className="btn btn-primary">Invite</button>
          </form>
          {coHostLink && (
            <div className="mt-3 text-xs">
              <div className="text-slate-400 mb-1">Send this link (already copied):</div>
              <input readOnly className="form-input" value={coHostLink}
                onClick={(e) => e.target.select()} />
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Private access</CardTitle>
          <form onSubmit={onGrant} className="space-y-2 mb-3">
            <input className="form-input" placeholder="Viewer ID" value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)} />
            <input className="form-input" placeholder="Display name (optional)" value={grantName}
              onChange={(e) => setGrantName(e.target.value)} />
            <button className="btn btn-primary w-full">Grant private access</button>
          </form>
          <ul className="space-y-1 text-sm">
            {privateList.length === 0 && <li className="text-slate-400">Nobody yet.</li>}
            {privateList.map((p) => (
              <li key={p.userId} className="flex justify-between items-center bg-slate-800/50 rounded px-2 py-1">
                <span>{p.displayName || p.userId}</span>
                <button className="text-rose-400 text-xs hover:underline" onClick={() => onRevoke(p.userId)}>revoke</button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>SNS email alerts</CardTitle>
          <p className="text-xs text-slate-400 mb-2">Subscribers get an email each time the broadcast goes private/public/ends.</p>
          <form onSubmit={onSubscribe} className="flex gap-2">
            <input className="form-input flex-1" type="email" placeholder="alerts@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn btn-primary">Subscribe</button>
          </form>
        </Card>

        <Card>
          <CardTitle>Live event feed</CardTitle>
          <ul className="text-xs space-y-1 max-h-72 overflow-auto">
            {feed.length === 0 && <li className="text-slate-400">Listening…</li>}
            {feed.map((e, i) => (
              <li key={i} className="border-l-2 border-fuchsia-500 pl-2">
                <span className="text-fuchsia-300">{e.type}</span>{' '}
                <span className="text-slate-500">{new Date(e.timestamp).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
