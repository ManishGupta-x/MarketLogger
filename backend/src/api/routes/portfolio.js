const express = require('express');
const router = express.Router();
const paperTrading = require('../../portfolio/paper-trading');
const sse = require('../sse');

// GET /api/portfolio/stream
router.get('/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  // Send current state immediately
  try { res.write(`event: update\ndata: ${JSON.stringify(paperTrading.getPortfolio())}\n\n`); } catch(e) {}
  sse.addClient('portfolio', res);
  const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch(e) { clearInterval(hb); } }, 30000);
  req.on('close', () => clearInterval(hb));
});

// GET /api/portfolio
router.get('/', (req, res) => res.json(paperTrading.getPortfolio()));

// GET /api/holdings
router.get('/holdings', (req, res) => res.json(paperTrading.getHoldings()));

// GET /api/portfolio/stats
router.get('/stats', (req, res) => res.json(paperTrading.getStats()));

// GET /api/portfolio/daily-pnl
router.get('/daily-pnl', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  res.json(paperTrading.getDailyPnl(days));
});

module.exports = router;
