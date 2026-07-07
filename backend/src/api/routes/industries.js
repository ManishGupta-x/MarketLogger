const express = require('express');
const db = require('../../db');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT i.*, COUNT(si.stock_id) as stock_count
    FROM industries i
    LEFT JOIN stock_industries si ON si.industry_id = i.id
    GROUP BY i.id ORDER BY i.name
  `).all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const industry = db.prepare(`SELECT * FROM industries WHERE id = ?`).get(req.params.id);
  if (!industry) return res.status(404).json({ error: 'Industry not found' });
  const stocks = db.prepare(
    `SELECT s.* FROM stocks s JOIN stock_industries si ON si.stock_id = s.id WHERE si.industry_id = ? ORDER BY s.symbol`
  ).all(req.params.id);
  const notes = db.prepare(`SELECT * FROM industry_notes WHERE industry_id = ? ORDER BY section_type`).all(req.params.id);
  res.json({ ...industry, stocks, notes });
});

router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const result = db.prepare(`INSERT INTO industries (name, description) VALUES (?, ?)`).run(name, description || null);
    res.status(201).json(db.prepare(`SELECT * FROM industries WHERE id = ?`).get(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Industry already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM industries WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Industry not found' });
  const { name, description } = req.body;
  db.prepare(
    `UPDATE industries SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name || existing.name, description ?? existing.description, req.params.id);
  res.json(db.prepare(`SELECT * FROM industries WHERE id = ?`).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM industries WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Industry not found' });
  res.status(204).end();
});

// Industry note upsert by section_type
router.put('/:id/notes/:sectionType', (req, res) => {
  const industry = db.prepare(`SELECT * FROM industries WHERE id = ?`).get(req.params.id);
  if (!industry) return res.status(404).json({ error: 'Industry not found' });
  const { body } = req.body;
  const existing = db.prepare(
    `SELECT * FROM industry_notes WHERE industry_id = ? AND section_type = ?`
  ).get(req.params.id, req.params.sectionType);

  if (existing) {
    db.prepare(`UPDATE industry_notes SET body = ?, updated_at = datetime('now') WHERE id = ?`).run(body || '', existing.id);
  } else {
    db.prepare(
      `INSERT INTO industry_notes (industry_id, section_type, body) VALUES (?, ?, ?)`
    ).run(req.params.id, req.params.sectionType, body || '');
  }
  res.json(db.prepare(`SELECT * FROM industry_notes WHERE industry_id = ? AND section_type = ?`).get(req.params.id, req.params.sectionType));
});

module.exports = router;
