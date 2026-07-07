const express = require('express');
const db = require('../../db');

const router = express.Router();

const SECTION_TYPES = ['bull_case', 'bear_case', 'history', 'quarterly', 'kpis', 'risks', 'valuation', 'observations', 'links'];

router.get('/sections', (req, res) => res.json(SECTION_TYPES));

router.get('/stocks/:stockId/notes', (req, res) => {
  const notes = db.prepare(`SELECT * FROM research_notes WHERE stock_id = ? ORDER BY section_type`).all(req.params.stockId);
  res.json(notes);
});

router.put('/stocks/:stockId/notes/:sectionType', (req, res) => {
  const stock = db.prepare(`SELECT * FROM stocks WHERE id = ?`).get(req.params.stockId);
  if (!stock) return res.status(404).json({ error: 'Stock not found' });
  const { title, body } = req.body;

  const existing = db.prepare(
    `SELECT * FROM research_notes WHERE stock_id = ? AND section_type = ?`
  ).get(req.params.stockId, req.params.sectionType);

  if (existing) {
    db.prepare(
      `UPDATE research_notes SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(title ?? existing.title, body ?? '', existing.id);
  } else {
    db.prepare(
      `INSERT INTO research_notes (stock_id, section_type, title, body) VALUES (?, ?, ?, ?)`
    ).run(req.params.stockId, req.params.sectionType, title || null, body || '');
  }
  res.json(db.prepare(`SELECT * FROM research_notes WHERE stock_id = ? AND section_type = ?`).get(req.params.stockId, req.params.sectionType));
});

router.delete('/notes/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM research_notes WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Note not found' });
  res.status(204).end();
});

// Same-industry company comparison: every stock in the industry with its notes keyed by section.
router.get('/compare', (req, res) => {
  const { industry_id } = req.query;
  if (!industry_id) return res.status(400).json({ error: 'industry_id is required' });

  const stocks = db.prepare(
    `SELECT s.* FROM stocks s JOIN stock_industries si ON si.stock_id = s.id WHERE si.industry_id = ? ORDER BY s.symbol`
  ).all(industry_id);

  const result = stocks.map(stock => {
    const notes = db.prepare(`SELECT section_type, title, body, updated_at FROM research_notes WHERE stock_id = ?`).all(stock.id);
    const notesByType = {};
    for (const n of notes) notesByType[n.section_type] = n;
    return { ...stock, notes: notesByType };
  });
  res.json(result);
});

module.exports = router;
