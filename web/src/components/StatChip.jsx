export default function StatChip({ label, value, tone = 'default' }) {
  const tones = {
    default: 'bg-slate-800/60 text-slate-200 border-slate-700',
    live: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    private: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    ok: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    info: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${tones[tone]}`}>
      <div className="uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
