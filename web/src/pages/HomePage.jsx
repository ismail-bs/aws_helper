import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { Card, CardTitle } from '../components/Card';
import { dispatch } from '../utils/eventBus';
import { EV } from '../utils/events';
import { setOwnerToken } from '../utils/ownerAuth';

export default function HomePage() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState('My live broadcast');
  const [ownerUserId] = useState(() => `user_${Math.random().toString(36).slice(2, 8)}`);
  const [maxViewers, setMaxViewers] = useState(500);
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [priceUsd, setPriceUsd] = useState(5);

  async function refresh() {
    try { setList(await api.listBroadcasts()); }
    catch (e) { dispatch(EV.TOAST, { kind: 'error', message: e.message }); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);

  async function onCreate(e) {
    e.preventDefault();
    try {
      const b = await api.createBroadcast({
        ownerUserId,
        title,
        maxViewers: Number(maxViewers),
        paymentRequired,
        priceUsd: Number(priceUsd),
      });
      // Stash owner bearer token + identity so the studio can mutate.
      if (b.ownerToken) setOwnerToken(b.id, b.ownerToken);
      sessionStorage.setItem(
        `broadcast.${b.id}.owner`,
        JSON.stringify({ ownerUserId, title })
      );
      nav(`/broadcast/${b.id}`);
    } catch (err) {
      dispatch(EV.TOAST, { kind: 'error', message: err.message });
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardTitle>Start a new broadcast</CardTitle>
        <form className="space-y-4" onSubmit={onCreate}>
          <Field label="Title">
            <input
              className="form-input"
              value={title} onChange={(e) => setTitle(e.target.value)}
              required
            />
          </Field>
          <Field label="Max viewers">
            <input type="number" min="1" className="form-input"
              value={maxViewers} onChange={(e) => setMaxViewers(e.target.value)} />
          </Field>
          <div className="flex items-center gap-3 pt-1">
            <input id="pay" type="checkbox" className="accent-fuchsia-500"
              checked={paymentRequired} onChange={(e) => setPaymentRequired(e.target.checked)} />
            <label htmlFor="pay" className="text-sm">Require payment to view</label>
          </div>
          {paymentRequired && (
            <Field label="Price (USD)">
              <input type="number" min="1" className="form-input"
                value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} />
            </Field>
          )}
          <button className="btn btn-primary w-full">Create broadcast</button>
          <p className="text-xs text-slate-400">
            Creates: 1 IVS Stage + 2 IVS channels (public/private) + 1 SNS topic.
            You will be redirected to the broadcaster studio.
          </p>
        </form>
      </Card>

      <Card>
        <CardTitle>Existing broadcasts</CardTitle>
        {loading && <p className="text-slate-400 text-sm">Loading…</p>}
        {!loading && list.length === 0 && (
          <p className="text-slate-400 text-sm">None yet. Create one on the left.</p>
        )}
        <ul className="space-y-2">
          {list.map((b) => (
            <li key={b.id} className="flex items-center justify-between border border-slate-800 rounded-lg px-4 py-3">
              <div>
                <div className="font-medium">{b.title}</div>
                <div className="text-xs text-slate-400">
                  {b.id} · {b.status} {b.isPrivate ? '· 🔒 private' : ''}
                </div>
              </div>
              <div className="flex gap-2">
                <Link className="btn btn-ghost" to={`/watch/${b.id}`}>Watch</Link>
                <Link className="btn btn-ghost" to={`/broadcast/${b.id}`}>Studio</Link>
              </div>
            </li>
          ))}
        </ul>
      </Card>

    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-slate-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
