const express = require('express');
const db = require('../../db');
const candleStore = require('../../marketdata/candle-store');
const { runBacktest } = require('../../backtest/engine');
const logger = require('../../../utils/logger');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, s.name as strategy_name, s.type as strategy_type
    FROM backtests b JOIN strategies s ON s.id = b.strategy_id
    ORDER BY b.created_at DESC
  `).all();
  res.json(rows.map(r => ({ ...r, params: JSON.parse(r.params), results: r.results ? JSON.parse(r.results) : null })));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT b.*, s.name as strategy_name, s.type as strategy_type, s.params as strategy_params
    FROM backtests b JOIN strategies s ON s.id = b.strategy_id WHERE b.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Backtest not found' });
  const trades = db.prepare(`SELECT * FROM backtest_trades WHERE backtest_id = ? ORDER BY entry_date`).all(req.params.id);
  res.json({
    ...row,
    params: JSON.parse(row.params),
    strategy_params: JSON.parse(row.strategy_params),
    results: row.results ? JSON.parse(row.results) : null,
    trades,
  });
});

router.post('/', (req, res) => {
  const { strategy_id, symbol, source, start_date, end_date, initial_capital, params } = req.body;
  if (!strategy_id || !symbol || !start_date || !end_date) {
    return res.status(400).json({ error: 'strategy_id, symbol, start_date, and end_date are required' });
  }
  const strategy = db.prepare(`SELECT * FROM strategies WHERE id = ?`).get(strategy_id);
  if (!strategy) return res.status(404).json({ error: 'Strategy not found' });

  const candles = candleStore.getCandles(symbol, { source, start: start_date, end: end_date });
  if (candles.length < 2) {
    return res.status(400).json({ error: `Not enough candle data for ${symbol} in that date range. Import data first.` });
  }

  const backtestParams = params || {};
  const insertResult = db.prepare(
    `INSERT INTO backtests (strategy_id, symbol, start_date, end_date, initial_capital, params, status)
     VALUES (?, ?, ?, ?, ?, ?, 'running')`
  ).run(strategy_id, symbol.toUpperCase(), start_date, end_date, initial_capital || 100000, JSON.stringify(backtestParams));
  const backtestId = insertResult.lastInsertRowid;

  try {
    const strategyParams = JSON.parse(strategy.params);
    const { trades, equityCurve, metrics } = runBacktest({
      candles,
      strategyType: strategy.type,
      strategyParams,
      initialCapital: initial_capital || 100000,
      slippageBps: backtestParams.slippageBps ?? 5,
      positionSizing: backtestParams.positionSizing ?? 'fixed_fraction',
      fraction: backtestParams.fraction ?? 1.0,
      riskPct: backtestParams.riskPct ?? 1.0,
      stopLossPct: backtestParams.stopLossPct ?? null,
      takeProfitPct: backtestParams.takeProfitPct ?? null,
    });

    const insertTrade = db.prepare(`
      INSERT INTO backtest_trades (backtest_id, side, entry_date, entry_price, exit_date, exit_price, quantity, pnl, costs, exit_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction(() => {
      for (const t of trades) {
        insertTrade.run(backtestId, t.side, t.entry_date, t.entry_price, t.exit_date, t.exit_price, t.quantity, t.pnl, t.costs, t.exit_reason);
      }
      db.prepare(
        `UPDATE backtests SET status = 'completed', results = ?, completed_at = datetime('now') WHERE id = ?`
      ).run(JSON.stringify({ metrics, equityCurve }), backtestId);
    });
    tx();

    res.status(201).json(db.prepare(`SELECT * FROM backtests WHERE id = ?`).get(backtestId));
  } catch (err) {
    logger.error('Backtest failed:', err.message);
    db.prepare(`UPDATE backtests SET status = 'failed', error = ? WHERE id = ?`).run(err.message, backtestId);
    res.status(400).json({ error: err.message, backtest_id: backtestId });
  }
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM backtests WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Backtest not found' });
  res.status(204).end();
});

module.exports = router;
