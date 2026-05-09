import { useEffect, useRef } from 'react';

/**
 * Renders a single remote participant's video + audio. Driven by the
 * `streams` map produced by ivsBroadcast.js's STAGE_PARTICIPANT_STREAMS_ADDED
 * handler.
 */
export default function RemoteParticipantTile({ participant }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    const v = participant?.streams?.video?.mediaStreamTrack;
    if (videoRef.current && v) {
      videoRef.current.srcObject = new MediaStream([v]);
      videoRef.current.play().catch(() => {});
    }
  }, [participant?.streams?.video]);

  useEffect(() => {
    const a = participant?.streams?.audio?.mediaStreamTrack;
    if (audioRef.current && a) {
      audioRef.current.srcObject = new MediaStream([a]);
      audioRef.current.play().catch(() => {});
    }
  }, [participant?.streams?.audio]);

  const name =
    participant?.info?.attributes?.displayName ||
    participant?.info?.userId ||
    'Co-host';

  return (
    <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800">
      <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
      <audio ref={audioRef} autoPlay />
      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-900/80 text-xs">
        {name}
      </div>
    </div>
  );
}
