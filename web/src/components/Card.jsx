export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur p-6 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }) {
  return <h2 className={`text-lg font-semibold mb-3 ${className}`}>{children}</h2>;
}
