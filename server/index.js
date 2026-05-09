// Express entrypoint for the IVS Real-time backend.
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const broadcasts = require('./routes/broadcasts');
const viewers = require('./routes/viewers');
const notifications = require('./routes/notifications');
const payment = require('./routes/payment');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/healthz', (_req, res) => res.json({ ok: true, region: process.env.AWS_REGION || null }));

app.use('/api/broadcasts', broadcasts);
// viewers/payment/notifications routes are mounted at /api/broadcasts so URLs
// stay consistent: /api/broadcasts/:id/viewers/join etc.
app.use('/api/broadcasts', viewers);
app.use('/api/broadcasts', notifications);
app.use('/api/broadcasts', payment);

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[server.error]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error', code: err.code });
});

const PORT = parseInt(process.env.SERVER_PORT || '4000', 10);
app.listen(PORT, () => {
  console.log(`[ivsrt-server] listening on http://localhost:${PORT}`);
});
