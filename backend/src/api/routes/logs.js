const express = require('express');
const router = express.Router();
const fs   = require('fs');
const path = require('path');
const sse  = require('../sse');

const LOG_DIR = path.join(__dirname, '../../../logs');

// GET /api/logs/stream — SSE tail of logs
router.get('/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  sse.addClient('logs', res);
  const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch(e) { clearInterval(hb); } }, 30000);
  req.on('close', () => clearInterval(hb));
});

// GET /api/logs  — last N lines of today's log file
router.get('/', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const file  = path.join(LOG_DIR, `${today}.log`);
  const limit = parseInt(req.query.limit) || 200;

  if (!fs.existsSync(file)) return res.json({ lines: [] });

  try {
    const content = fs.readFileSync(file, 'utf8');
    const lines   = content.split('\n').filter(Boolean).slice(-limit);
    res.json({ lines, date: today });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
