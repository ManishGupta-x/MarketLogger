const express = require('express');
const router = express.Router();
const paperTrading = require('../../portfolio/paper-trading');
const sse = require('../sse');

// GET /api/orders/stream
router.get('/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  sse.addClient('orders', res);
  const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch(e) { clearInterval(hb); } }, 30000);
  req.on('close', () => clearInterval(hb));
});

// GET /api/orders
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(paperTrading.getOrders(limit));
});

// GET /api/orders/today
router.get('/today', (req, res) => res.json(paperTrading.getTodayOrders()));

module.exports = router;
