import { useEffect, useState } from 'react';
import { listen } from '../utils/eventBus';
import { EV } from '../utils/events';
import { describeQuality } from '../utils/connection';

export default function ConnectionBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [quality, setQuality] = useState(null);

  useEffect(() => {
    const off1 = listen(EV.CONNECTION_OFFLINE, () => setOnline(false));
    const off2 = listen(EV.CONNECTION_ONLINE, () => setOnline(true));
    const off3 = listen(EV.CONNECTION_QUALITY, ({ quality }) => setQuality(quality));
    return () => { off1(); off2(); off3(); };
  }, []);

  // Hide banner when online AND quality is FAIR/EXCELLENT (numeric 3-4).
  const numericQ = typeof quality === 'number' ? quality : null;
  const goodQuality =
    quality == null ||
    (numericQ != null ? numericQ >= 3 : ['FAIR', 'NORMAL', 'EXCELLENT', 'HIGH'].includes(String(quality).toUpperCase()));
  if (online && goodQuality) return null;

  if (!online) {
    return (
      <div className="bg-rose-600 text-white text-center text-sm py-2">
        ⚠ You appear to be offline. Reconnect to keep your stream alive.
      </div>
    );
  }

  const q = describeQuality(quality);
  const tones = {
    danger: 'bg-rose-600 text-white',
    warning: 'bg-amber-500 text-slate-900',
    ok: 'bg-emerald-600 text-white',
    muted: 'bg-slate-700 text-slate-200',
  };
  return (
    <div className={`text-center text-sm py-2 ${tones[q.tone]}`}>
      Connection: {q.label}
    </div>
  );
}
