// Boots the Express backend AND the Vite dev server side-by-side so a
// single `npm run dev` command gives you the full studio + viewer.
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function start(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: true,
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...(opts.env || {}) },
  });
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    process.exit(code || 0);
  });
  return child;
}

console.log('🚀 Starting Express backend on :4000');
start('server', 'node', ['--watch', 'server/index.js']);

setTimeout(() => {
  console.log('🌐 Starting Vite frontend on :5173');
  start('web', 'npm', ['run', 'dev'], { cwd: path.join(ROOT, 'web') });
}, 600);

console.log('\nOpen http://localhost:5173 once both are ready.\n');
