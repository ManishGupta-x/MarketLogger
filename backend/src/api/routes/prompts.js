const express = require('express');
const db = require('../../db');
const { render, extractPlaceholders } = require('../../research/template-renderer');

const router = express.Router();

router.get('/', (req, res) => {
  const { category } = req.query;
  const rows = category
    ? db.prepare(`SELECT * FROM prompt_templates WHERE category = ? ORDER BY name`).all(category)
    : db.prepare(`SELECT * FROM prompt_templates ORDER BY category, name`).all();
  res.json(rows.map(r => ({ ...r, placeholders: JSON.parse(r.placeholders) })));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM prompt_templates WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Template not found' });
  res.json({ ...row, placeholders: JSON.parse(row.placeholders) });
});

router.post('/', (req, res) => {
  const { name, category, body } = req.body;
  if (!name || !category || !body) return res.status(400).json({ error: 'name, category, and body are required' });
  const placeholders = extractPlaceholders(body);
  const result = db.prepare(
    `INSERT INTO prompt_templates (name, category, body, placeholders) VALUES (?, ?, ?, ?)`
  ).run(name, category, body, JSON.stringify(placeholders));
  const row = db.prepare(`SELECT * FROM prompt_templates WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json({ ...row, placeholders: JSON.parse(row.placeholders) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM prompt_templates WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Template not found' });
  const { name, category, body } = req.body;
  const newBody = body ?? existing.body;
  const placeholders = extractPlaceholders(newBody);
  db.prepare(
    `UPDATE prompt_templates SET name = ?, category = ?, body = ?, placeholders = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name || existing.name, category || existing.category, newBody, JSON.stringify(placeholders), req.params.id);
  const row = db.prepare(`SELECT * FROM prompt_templates WHERE id = ?`).get(req.params.id);
  res.json({ ...row, placeholders: JSON.parse(row.placeholders) });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM prompt_templates WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Template not found' });
  res.status(204).end();
});

// Fill placeholders and return the rendered prompt (not persisted).
router.post('/:id/render', (req, res) => {
  const row = db.prepare(`SELECT * FROM prompt_templates WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Template not found' });
  const values = req.body.values || {};
  res.json({ rendered: render(row.body, values) });
});

module.exports = router;
