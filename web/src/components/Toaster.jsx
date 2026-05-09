import { useEffect, useState } from 'react';
import { listen } from '../utils/eventBus';
import { EV } from '../utils/events';

const TONE = {
  success: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200',
  info: 'bg-sky-500/15 border-sky-500/40 text-sky-200',
  warning: 'bg-amber-500/15 border-amber-500/40 text-amber-200',
  error: 'bg-rose-500/15 border-rose-500/40 text-rose-200',
};

export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    return listen(EV.TOAST, ({ kind = 'info', message }) => {
      const id = Math.random().toString(36).slice(2);
      setItems((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4000);
    });
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {items.map((i) => (
        <div
          key={i.id}
          className={`animate-fade-in border rounded-lg px-4 py-2 text-sm shadow-lg ${TONE[i.kind] || TONE.info}`}
        >
          {i.message}
        </div>
      ))}
    </div>
  );
}
