const express = require('express');
const router = express.Router();
const regime = require('../../strategy/regime');
const db     = require('../../database');
const sse    = require('../sse');

// GET /api/regime/stream
router.get('/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  try { res.write(`event: change\ndata: ${JSON.stringify(regime.getState())}\n\n`); } catch(e) {}
  sse.addClient('regime', res);
  const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch(e) { clearInterval(hb); } }, 30000);
  req.on('close', () => clearInterval(hb));
});

// GET /api/regime
router.get('/', (req, res) => res.json(regime.getState()));

// GET /api/regime/history
router.get('/history', (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  res.json(db.getRegimeHistory(hours));
});

// POST /api/regime/override
router.post('/override', (req, res) => {
  const { regime: r, durationMs } = req.body;
  try { res.json(regime.setManual(r, durationMs || null)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/regime/override
router.delete('/override', (req, res) => {
  res.json(regime.clearManual() || { message: 'No override active' });
});

module.exports = router;
