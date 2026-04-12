const express = require('express');
const router = express.Router();
const tickProcessor = require('../../data/tick-processor');
const sse = require('../sse');

// GET /api/ticks/stream  — SSE
router.get('/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  sse.addClient('ticks', res);
  const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch(e) { clearInterval(hb); } }, 30000);
  req.on('close', () => clearInterval(hb));
});

// GET /api/ticks/latest  — snapshot of all latest ticks
router.get('/latest', (req, res) => {
  res.json(tickProcessor.getAllLatest());
});

module.exports = router;
