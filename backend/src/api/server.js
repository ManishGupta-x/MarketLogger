const express = require('express');
const cors = require('cors');
const logger = require('../../utils/logger');

function startServer(port) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

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

  app.listen(port, () => {
    logger.info(`API server listening on port ${port}`);
  });

  return app;
}

module.exports = { startServer };
