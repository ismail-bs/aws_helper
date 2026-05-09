import { Outlet, Link } from 'react-router-dom';
import Toaster from './components/Toaster';
import ConnectionBanner from './components/ConnectionBanner';

export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-500 grid place-items-center text-sm font-bold">
              IVS
            </span>
            <div>
              <div className="text-base font-semibold leading-none">
                Amazon IVS Real-time Studio
              </div>
              <div className="text-xs text-slate-400">
                Stages → Channel → Video.js
              </div>
            </div>
          </Link>
          <nav className="text-sm flex items-center gap-4 text-slate-300">
            <Link to="/" className="hover:text-white">Home</Link>
            <a
              className="hover:text-white"
              href="https://docs.aws.amazon.com/ivs/latest/RealTimeUserGuide/what-is.html"
              target="_blank" rel="noreferrer"
            >Docs</a>
          </nav>
        </div>
      </header>

      <ConnectionBanner />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <Outlet />
      </main>

      <Toaster />

      <footer className="border-t border-slate-800 text-xs text-slate-500 text-center py-4">
        Powered by Amazon IVS Real-time + IVS Player Video.js Tech.
      </footer>
    </div>
  );
}
