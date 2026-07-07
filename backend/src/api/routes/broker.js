const express = require('express');
const db = require('../../db');
const zerodha = require('../../auth/zerodha');
const scheduler = require('../../auth/scheduler');
const logger = require('../../../utils/logger');

const LIVE_MODES = ['live_readonly', 'live_confirm', 'live_auto'];
const router = express.Router();

router.get('/status', async (req, res) => {
  res.json({ connected: zerodha.isConnected, loginUrl: zerodha.isConnected ? null : zerodha.kite.getLoginURL() });
});

router.post('/login', async (req, res) => {
  try {
    await scheduler.triggerLogin();
    res.json({ connected: zerodha.isConnected });
  } catch (err) {
    logger.error('Manual broker login failed:', err.message);
    res.status(502).json({ error: 'Login failed — check server logs' });
  }
});

// Whitelisted read-only passthroughs. Never forward the raw Kite error object
// (it can echo back request params) — just a message.
router.get('/holdings', async (req, res) => {
  if (!zerodha.isConnected) return res.status(409).json({ error: 'Broker not connected' });
  try {
    const holdings = await zerodha.kite.getHoldings();
    res.json(holdings);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch holdings' });
  }
});

router.get('/positions', async (req, res) => {
  if (!zerodha.isConnected) return res.status(409).json({ error: 'Broker not connected' });
  try {
    const positions = await zerodha.kite.getPositions();
    res.json(positions);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch positions' });
  }
});

router.get('/margins', async (req, res) => {
  if (!zerodha.isConnected) return res.status(409).json({ error: 'Broker not connected' });
  try {
    const margins = await zerodha.kite.getMargins();
    res.json(margins);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch margins' });
  }
});

router.get('/mode', (req, res) => {
  const { broker_mode } = db.prepare(`SELECT broker_mode FROM app_settings WHERE id = 1`).get();
  res.json({ mode: broker_mode, liveTradingUnlocked: process.env.LIVE_TRADING_UNLOCKED === 'true', availableModes: ['paper', ...LIVE_MODES] });
});

router.put('/mode', (req, res) => {
  const { mode } = req.body;
  if (!['paper', ...LIVE_MODES].includes(mode)) {
    return res.status(400).json({ error: `mode must be one of: paper, ${LIVE_MODES.join(', ')}` });
  }
  if (LIVE_MODES.includes(mode) && process.env.LIVE_TRADING_UNLOCKED !== 'true') {
    return res.status(403).json({ error: 'Live modes are locked. Set LIVE_TRADING_UNLOCKED=true in .env to unlock — and note that even then, this build has no live order-placement code, so it is read-only.' });
  }
  db.prepare(`UPDATE app_settings SET broker_mode = ?, updated_at = datetime('now') WHERE id = 1`).run(mode);
  logger.info(`Broker mode changed to ${mode}`);
  res.json({ mode });
});

module.exports = router;
