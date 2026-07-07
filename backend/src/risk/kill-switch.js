const db = require('../db');

function isActive() {
  const row = db.prepare(`SELECT kill_switch_active, kill_switch_reason FROM risk_settings WHERE id = 1`).get();
  return { active: !!row.kill_switch_active, reason: row.kill_switch_reason || null };
}

function activate(reason) {
  db.prepare(
    `UPDATE risk_settings SET kill_switch_active = 1, kill_switch_reason = ?, updated_at = datetime('now') WHERE id = 1`
  ).run(reason || 'Manually activated');
  return isActive();
}

function deactivate() {
  db.prepare(
    `UPDATE risk_settings SET kill_switch_active = 0, kill_switch_reason = NULL, updated_at = datetime('now') WHERE id = 1`
  ).run();
  return isActive();
}

module.exports = { isActive, activate, deactivate };
