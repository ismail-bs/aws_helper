import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, CardTitle } from '../components/Card';
import StatChip from '../components/StatChip';

import { dispatch, listen } from '../utils/eventBus';
import { EV } from '../utils/events';
import { api } from '../utils/api';
import { createPlayer, setSrc, disposePlayer } from '../utils/ivsPlayer';
import { startTicker, stopTicker } from '../utils/duration';
import { openEventStream } from '../utils/sse';
import { describeQuality } from '../utils/connection';

export default function ViewerPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const initialMode = search.get('mode') === 'private' ? 'private' : 'public';

  const videoRef = useRef(null);
  const playerRef = useRef(null);
  // Stores a URL that arrived before the player finished initialising.
  const pendingUrlRef = useRef(null);

  const [mode, setMode] = useState(initialMode);
  const [viewerId] = useState(() => `viewer_${Math.random().toString(36).slice(2, 8)}`);
  const [displayName, setDisplayName] = useState(`Guest_${Math.random().toString(36).slice(2, 6)}`);
  const [broadcast, setBroadcast] = useState(null);
  const [joined, setJoined] = useState(false);
  const [duration, setDuration] = useState('00:00');
  const [quality, setQuality] = useState(null);
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [paymentCode, setPaymentCode] = useState('PAY');

  /** Helper: load a URL into the player. Queues it if player not ready yet. */
  function loadUrl(url) {
    if (!url) return;
    if (playerRef.current) {
      setSrc(playerRef.current, url);
    } else {
      pendingUrlRef.current = url;
    }
  }

  // Initial fetch + SSE
  useEffect(() => {
    api.getBroadcast(id).then(setBroadcast).catch(() => setBroadcast(null));
    const off = openEventStream(id);
    return off;
  }, [id]);

  // Listen for state changes
  useEffect(() => {
    const offState = listen(EV.STATE_CHANGED, (detail) => {
      if (detail?.broadcast?.id === id) {
        setBroadcast((prev) => ({ ...prev, ...detail.broadcast }));
      }
      // playbackUrl arrives here after viewer joins — load it immediately.
      if (detail?.playbackUrl) loadUrl(detail.playbackUrl);
      if (detail?.paymentIntent) setPaymentIntent(detail.paymentIntent);
    });
    const offTick = listen(EV.STREAM_TIME_TICK, ({ formatted }) => setDuration(formatted));
    const offRemote = listen(EV.REMOTE_NOTIFICATION, async (evt) => {
      if (evt.broadcastId !== id) return;
      if (
        evt.type === 'broadcast.private.on' ||
        evt.type === 'broadcast.private.off' ||
        evt.type === 'broadcast.ended'
      ) {
        const fresh = await api.getBroadcast(id).catch(() => null);
        if (fresh) setBroadcast(fresh);
      }
    });
    return () => { offState(); offTick(); offRemote(); };
  }, [id]);

  // Stream-duration ticker
  useEffect(() => {
    if (broadcast?.startedAt && broadcast?.status === 'live') {
      startTicker(() => broadcast.startedAt);
    } else {
      stopTicker();
      setDuration('00:00');
    }
    return () => stopTicker();
  }, [broadcast?.startedAt, broadcast?.status]);

  // Create the Video.js + IVS player once on mount.
  // createPlayer now awaits player.ready() internally, so the player is
  // fully initialised when the promise resolves — safe to call setSrc right away.
  useEffect(() => {
    if (!videoRef.current || playerRef.current) return;
    let cancelled = false;
    createPlayer(videoRef.current, {
      onIVSEvent: (kind, data) => {
        if (kind === 'STATE') return;
        if (data?.quality) setQuality(data.quality);
      },
    }).then((player) => {
      if (cancelled) { disposePlayer(player); return; }
      playerRef.current = player;
      if (pendingUrlRef.current) {
        setSrc(player, pendingUrlRef.current);
        pendingUrlRef.current = null;
      }
    });
    return () => {
      cancelled = true;
      if (playerRef.current) {
        disposePlayer(playerRef.current);
        playerRef.current = null;
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => dispatch(EV.VIEWER_LEAVE, {});
  }, []);

  async function onJoin() {
    if (broadcast?.paymentRequired && !paymentIntent) {
      try {
        const intent = await api.paymentIntent(id, viewerId);
        setPaymentIntent(intent);
        dispatch(EV.TOAST, {
          kind: 'info',
          message: intent.mock
            ? `Mock payment created. Confirm with code "PAY" to continue.`
            : 'Payment intent created. Complete payment in the modal.',
        });
        return;
      } catch (err) {
        dispatch(EV.TOAST, { kind: 'error', message: err.message });
        return;
      }
    }
    dispatch(EV.VIEWER_JOIN, {
      broadcastId: id,
      viewerId,
      displayName,
      mode,
      paymentIntentId: paymentIntent?.id,
    });
    setJoined(true);
  }

  function onConfirmPayment() {
    dispatch(EV.VIEWER_PAYMENT_CONFIRM, {
      broadcastId: id,
      intentId: paymentIntent.id,
      code: paymentCode,
    });
  }

  if (!broadcast) {
    return <p className="text-slate-400">Loading {id}…</p>;
  }

  const inPrivateAndCantWatch = broadcast.isPrivate && mode !== 'private';
  const watchingPrivate = mode === 'private' && joined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <CardTitle className="mb-1">{broadcast.title}</CardTitle>
              <div className="text-xs text-slate-400">Broadcast ID: {broadcast.id}</div>
            </div>
            <div className="flex gap-2">
              <StatChip label="State" value={broadcast.status}
                tone={broadcast.status === 'live' ? 'live' : 'default'} />
              <StatChip label="Duration" value={duration}
                tone={broadcast.status === 'live' ? 'live' : 'default'} />
              {quality && (
                <StatChip label="Quality" value={describeQuality(quality).label}
                  tone={describeQuality(quality).tone === 'ok' ? 'ok' : 'default'} />
              )}
            </div>
          </div>

          {/* 16:9 container. Video.js fill:true will expand to fill it. */}
          <div className="relative w-full bg-black rounded-xl overflow-hidden" style={{ paddingBottom: '56.25%' }}>
            <div className="absolute inset-0">
              <video
                ref={videoRef}
                className="video-js vjs-big-play-centered"
                playsInline
              />
            </div>
            {!joined && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/70">
                <div className="text-center max-w-sm space-y-3">
                  <div className="text-lg font-semibold">Join the broadcast</div>
                  <input className="form-input" value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)} />
                  <select className="form-input" value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="public">🌍 Public viewer</option>
                    <option value="private">🔐 Private viewer (requires access)</option>
                  </select>
                  {broadcast.paymentRequired && !paymentIntent && (
                    <div className="text-sm text-amber-300">
                      Payment required: ${broadcast.priceUsd}
                    </div>
                  )}
                  {paymentIntent && paymentIntent.status !== 'succeeded' && (
                    <div className="space-y-2 bg-slate-800/60 p-3 rounded">
                      <div className="text-xs">Mock payment intent: {paymentIntent.id}</div>
                      <input className="form-input" value={paymentCode}
                        onChange={(e) => setPaymentCode(e.target.value)} />
                      <button className="btn btn-success w-full" onClick={onConfirmPayment}>Confirm payment</button>
                    </div>
                  )}
                  <button className="btn btn-primary w-full" onClick={onJoin}>
                    {broadcast.paymentRequired && !paymentIntent ? 'Pay & Join' : 'Join'}
                  </button>
                </div>
              </div>
            )}
            {inPrivateAndCantWatch && joined && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/85 animate-fade-in">
                <div className="text-center max-w-md p-6">
                  <div className="text-4xl mb-3">🔒</div>
                  <div className="text-xl font-semibold mb-2">
                    Broadcaster is in a private session
                  </div>
                  <p className="text-sm text-slate-300">
                    Public stream is paused. We'll bring it back as soon as the broadcaster returns.
                  </p>
                </div>
              </div>
            )}
            {watchingPrivate && (
              <div className="absolute top-3 left-3 px-2 py-1 rounded bg-amber-500 text-slate-900 text-xs font-semibold">
                🔒 Watching private session
              </div>
            )}
            {broadcast.status === 'ended' && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/90 text-slate-300">
                Broadcast ended.
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardTitle>Your session</CardTitle>
          <ul className="text-sm space-y-1">
            <li>Viewer ID: <span className="text-slate-400">{viewerId}</span></li>
            <li>Mode: {mode}</li>
            <li>Joined: {joined ? '✅' : '—'}</li>
          </ul>
        </Card>

        <Card>
          <CardTitle>Tips</CardTitle>
          <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
            <li>Switch off / on your VPN — the orange/red banner above will warn you within ~5s.</li>
            <li>Disable Wi-Fi for 10s to test the internet-cutout alert.</li>
            <li>Players auto-resume once SNS pushes the <code>broadcast.private.off</code> event.</li>
          </ul>
        </Card>
      </div>

    </div>
  );
}
