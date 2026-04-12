const express = require('express');
const cors    = require('cors');
const auth    = require('./middleware/auth');
const config  = require('../../config');
const logger  = require('../../utils/logger');

// Routes
const ticksRouter     = require('./routes/ticks');
const portfolioRouter = require('./routes/portfolio');
const ordersRouter    = require('./routes/orders');
const regimeRouter    = require('./routes/regime');
const strategyRouter  = require('./routes/strategy');
const riskRouter      = require('./routes/risk');
const logsRouter      = require('./routes/logs');

const app = express();

// CORS — only allow configured origin
app.use(cors({
  origin: config.server.allowedOrigin,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Auth middleware (all routes except /health)
app.use(auth);

// Health check (public)
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// API routes
app.use('/api/ticks',         ticksRouter);
app.use('/api/portfolio',     portfolioRouter);
app.use('/api/holdings',      (req, res) => res.redirect('/api/portfolio/holdings'));
app.use('/api/orders',        ordersRouter);
app.use('/api/regime',        regimeRouter);
app.use('/api/strategies',    strategyRouter);
app.use('/api/adaptive-info', strategyRouter);
app.use('/api/active-stocks', strategyRouter);
app.use('/api/risk-status',   riskRouter);
app.use('/api/risk-resume',   riskRouter);
app.use('/api/logs',          logsRouter);

// 404 fallback
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

function start() {
  const port = config.server.port;
  app.listen(port, () => {
    logger.info(`API server listening on port ${port}`);
    logger.info(`CORS origin: ${config.server.allowedOrigin}`);
    logger.info(`Auth: ${config.server.internalApiKey ? 'enabled' : 'disabled (no key set)'}`);
  });
  return app;
}

module.exports = { app, start };
