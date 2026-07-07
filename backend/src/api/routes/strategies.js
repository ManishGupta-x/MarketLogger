const express = require('express');
const db = require('../../db');
const { REGISTRY } = require('../../strategies');

const router = express.Router();

router.get('/types', (req, res) => res.json(Object.keys(REGISTRY)));

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT * FROM strategies ORDER BY created_at DESC`).all();
  res.json(rows.map(r => ({ ...r, params: JSON.parse(r.params) })));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM strategies WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Strategy not found' });
  res.json({ ...row, params: JSON.parse(row.params) });
});

router.post('/', (req, res) => {
  const { name, type, params } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  if (!REGISTRY[type]) return res.status(400).json({ error: `Unknown strategy type. Valid: ${Object.keys(REGISTRY).join(', ')}` });
  const result = db.prepare(
    `INSERT INTO strategies (name, type, params) VALUES (?, ?, ?)`
  ).run(name, type, JSON.stringify(params || {}));
  const row = db.prepare(`SELECT * FROM strategies WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json({ ...row, params: JSON.parse(row.params) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM strategies WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Strategy not found' });
  const { name, type, params } = req.body;
  db.prepare(
    `UPDATE strategies SET name = ?, type = ?, params = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name || existing.name, type || existing.type, JSON.stringify(params ?? JSON.parse(existing.params)), req.params.id);
  const row = db.prepare(`SELECT * FROM strategies WHERE id = ?`).get(req.params.id);
  res.json({ ...row, params: JSON.parse(row.params) });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM strategies WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Strategy not found' });
  res.status(204).end();
});

module.exports = router;
