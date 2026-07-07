const db = require('../db');

const upsertStmt = db.prepare(`
  INSERT INTO candles (symbol, source, date, open, high, low, close, volume)
  VALUES (@symbol, @source, @date, @open, @high, @low, @close, @volume)
  ON CONFLICT(symbol, source, date) DO UPDATE SET
    open = excluded.open, high = excluded.high, low = excluded.low,
    close = excluded.close, volume = excluded.volume
`);

function upsertCandles(symbol, source, candles) {
  const tx = db.transaction((rows) => {
    for (const c of rows) {
      upsertStmt.run({ symbol: symbol.toUpperCase(), source, date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 });
    }
  });
  tx(candles);
  return candles.length;
}

// When the same symbol has candles from multiple sources, a date must never
// appear twice — duplicate bars silently corrupt backtests and indicators.
const SOURCE_PRIORITY = { kite: 0, csv: 1, yahoo: 2 };

function getCandles(symbol, { source, start, end } = {}) {
  let query = `SELECT * FROM candles WHERE symbol = ?`;
  const params = [symbol.toUpperCase()];
  if (source) { query += ` AND source = ?`; params.push(source); }
  if (start) { query += ` AND date >= ?`; params.push(start); }
  if (end) { query += ` AND date <= ?`; params.push(end); }
  query += ` ORDER BY date ASC`;
  const rows = db.prepare(query).all(...params);
  if (source) return rows;

  const byDate = new Map();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (!existing || (SOURCE_PRIORITY[row.source] ?? 99) < (SOURCE_PRIORITY[existing.source] ?? 99)) {
      byDate.set(row.date, row);
    }
  }
  return [...byDate.values()];
}

function listSymbols() {
  return db.prepare(`SELECT symbol, source, COUNT(*) as candle_count, MIN(date) as first_date, MAX(date) as last_date FROM candles GROUP BY symbol, source ORDER BY symbol`).all();
}

function deleteCandles(symbol, source) {
  return db.prepare(`DELETE FROM candles WHERE symbol = ? AND source = ?`).run(symbol.toUpperCase(), source).changes;
}

module.exports = { upsertCandles, getCandles, listSymbols, deleteCandles };
