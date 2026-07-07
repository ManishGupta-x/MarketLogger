const express = require('express');
const cors = require('cors');
const logger = require('../../utils/logger');

function startServer(port) {
  const app = express();

  // Comma-separated allowlist (e.g. the deployed dashboard's origin). Unset =
  // allow all, for plain localhost use.
  const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors(corsOrigins.length ? { origin: corsOrigins } : {}));
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // When API_KEY is set, every route except the health probe requires it.
  // The dashboard sends it as X-API-Key from a value the user enters once.
  const apiKey = process.env.API_KEY || '';
  app.use('/api', (req, res, next) => {
    if (!apiKey) return next();
    if (req.get('x-api-key') === apiKey) return next();
    res.status(401).json({ error: 'Invalid or missing API key' });
  });

  app.use('/api/stocks', require('./routes/stocks'));
  app.use('/api/industries', require('./routes/industries'));
  app.use('/api/research', require('./routes/research'));
  app.use('/api/prompts', require('./routes/prompts'));
  app.use('/api/watchlist', require('./routes/watchlist'));
  app.use('/api/attachments', require('./routes/attachments'));
  app.use('/api/prices', require('./routes/prices'));
  app.use('/api/strategies', require('./routes/strategies'));
  app.use('/api/backtests', require('./routes/backtests'));
  app.use('/api/paper', require('./routes/paper'));
  app.use('/api/risk', require('./routes/risk'));
  app.use('/api/broker', require('./routes/broker'));
  app.use('/api/logs', require('./routes/logs'));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // Centralized error handler — never forward raw error objects to the client,
  // since stack traces or upstream error bodies could carry secret values.
  app.use((err, req, res, next) => {
    logger.error(`Unhandled error on ${req.method} ${req.path}:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Loopback by default: the API should only be reachable directly from this
  // machine (or through the TLS reverse proxy in front of it). Set HOST=0.0.0.0
  // to expose it on all interfaces deliberately.
  const host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => {
    logger.info(`API server listening on ${host}:${port} (auth: ${apiKey ? 'API key required' : 'none — local mode'})`);
  });

  return app;
}

module.exports = { startServer };
