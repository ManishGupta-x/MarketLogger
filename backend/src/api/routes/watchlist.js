const express = require('express');
const db = require('../../db');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT w.id as watchlist_id, w.notes as watchlist_notes, w.added_at, s.*
    FROM watchlist w JOIN stocks s ON s.id = w.stock_id
    ORDER BY w.added_at DESC
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { stock_id, notes } = req.body;
  if (!stock_id) return res.status(400).json({ error: 'stock_id is required' });
  const stock = db.prepare(`SELECT * FROM stocks WHERE id = ?`).get(stock_id);
  if (!stock) return res.status(404).json({ error: 'Stock not found' });
  try {
    const result = db.prepare(`INSERT INTO watchlist (stock_id, notes) VALUES (?, ?)`).run(stock_id, notes || null);
    res.status(201).json(db.prepare(`SELECT * FROM watchlist WHERE id = ?`).get(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Already on watchlist' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:stockId', (req, res) => {
  const result = db.prepare(`DELETE FROM watchlist WHERE stock_id = ?`).run(req.params.stockId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not on watchlist' });
  res.status(204).end();
});

module.exports = router;
