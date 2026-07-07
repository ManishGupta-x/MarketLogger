const express = require('express');
const db = require('../../db');

const router = express.Router();

router.get('/', (req, res) => {
  const { industry_id, search } = req.query;
  let rows;
  if (industry_id) {
    rows = db.prepare(
      `SELECT s.* FROM stocks s JOIN stock_industries si ON si.stock_id = s.id WHERE si.industry_id = ? ORDER BY s.symbol`
    ).all(industry_id);
  } else if (search) {
    rows = db.prepare(
      `SELECT * FROM stocks WHERE symbol LIKE ? OR name LIKE ? ORDER BY symbol`
    ).all(`%${search}%`, `%${search}%`);
  } else {
    rows = db.prepare(`SELECT * FROM stocks ORDER BY symbol`).all();
  }
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const stock = db.prepare(`SELECT * FROM stocks WHERE id = ?`).get(req.params.id);
  if (!stock) return res.status(404).json({ error: 'Stock not found' });
  const industries = db.prepare(
    `SELECT i.* FROM industries i JOIN stock_industries si ON si.industry_id = i.id WHERE si.stock_id = ?`
  ).all(req.params.id);
  const notes = db.prepare(`SELECT * FROM research_notes WHERE stock_id = ? ORDER BY section_type`).all(req.params.id);
  const inWatchlist = !!db.prepare(`SELECT 1 FROM watchlist WHERE stock_id = ?`).get(req.params.id);
  res.json({ ...stock, industries, notes, inWatchlist });
});

router.post('/', (req, res) => {
  const { symbol, name, exchange, isin, industry_ids } = req.body;
  if (!symbol || !name) return res.status(400).json({ error: 'symbol and name are required' });

  const tx = db.transaction(() => {
    const result = db.prepare(
      `INSERT INTO stocks (symbol, name, exchange, isin) VALUES (?, ?, ?, ?)`
    ).run(symbol.toUpperCase(), name, exchange || 'NSE', isin || null);
    const stockId = result.lastInsertRowid;
    if (Array.isArray(industry_ids)) {
      const insertLink = db.prepare(`INSERT OR IGNORE INTO stock_industries (stock_id, industry_id) VALUES (?, ?)`);
      for (const industryId of industry_ids) insertLink.run(stockId, industryId);
    }
    return stockId;
  });

  try {
    const id = tx();
    res.status(201).json(db.prepare(`SELECT * FROM stocks WHERE id = ?`).get(id));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Symbol already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM stocks WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Stock not found' });
  const { symbol, name, exchange, isin, industry_ids } = req.body;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE stocks SET symbol = ?, name = ?, exchange = ?, isin = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      (symbol || existing.symbol).toUpperCase(),
      name || existing.name,
      exchange || existing.exchange,
      isin ?? existing.isin,
      req.params.id
    );
    if (Array.isArray(industry_ids)) {
      db.prepare(`DELETE FROM stock_industries WHERE stock_id = ?`).run(req.params.id);
      const insertLink = db.prepare(`INSERT OR IGNORE INTO stock_industries (stock_id, industry_id) VALUES (?, ?)`);
      for (const industryId of industry_ids) insertLink.run(req.params.id, industryId);
    }
  });
  tx();
  res.json(db.prepare(`SELECT * FROM stocks WHERE id = ?`).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM stocks WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Stock not found' });
  res.status(204).end();
});

module.exports = router;
