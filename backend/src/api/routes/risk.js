const express = require('express');
const db = require('../../db');
const killSwitch = require('../../risk/kill-switch');

const router = express.Router();

router.get('/settings', (req, res) => {
  res.json(db.prepare(`SELECT * FROM risk_settings WHERE id = 1`).get());
});

router.put('/settings', (req, res) => {
  const existing = db.prepare(`SELECT * FROM risk_settings WHERE id = 1`).get();
  const fields = [
    'max_order_value', 'max_daily_loss', 'max_risk_per_trade_pct',
    'max_open_positions', 'max_position_exposure_pct', 'max_total_exposure_pct',
  ];
  const merged = {};
  for (const f of fields) {
    merged[f] = req.body[f] ?? existing[f];
    if (typeof merged[f] !== 'number' || !Number.isFinite(merged[f]) || merged[f] <= 0) {
      return res.status(400).json({ error: `${f} must be a positive number` });
    }
  }

  db.prepare(`
    UPDATE risk_settings SET
      max_order_value = ?, max_daily_loss = ?, max_risk_per_trade_pct = ?,
      max_open_positions = ?, max_position_exposure_pct = ?, max_total_exposure_pct = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(
    merged.max_order_value, merged.max_daily_loss, merged.max_risk_per_trade_pct,
    merged.max_open_positions, merged.max_position_exposure_pct, merged.max_total_exposure_pct
  );
  res.json(db.prepare(`SELECT * FROM risk_settings WHERE id = 1`).get());
});

router.get('/kill-switch', (req, res) => res.json(killSwitch.isActive()));

router.post('/kill-switch/activate', (req, res) => {
  res.json(killSwitch.activate(req.body.reason));
});

router.post('/kill-switch/deactivate', (req, res) => {
  res.json(killSwitch.deactivate());
});

router.get('/order-log', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const rows = db.prepare(`SELECT * FROM order_log ORDER BY created_at DESC LIMIT ?`).all(limit);
  res.json(rows.map(r => ({ ...r, risk_checks: JSON.parse(r.risk_checks) })));
});

module.exports = router;
