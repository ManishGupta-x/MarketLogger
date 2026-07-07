const express = require('express');
const db = require('../../db');
const paperBroker = require('../../paper/paper-broker');
const gateway = require('../../broker/gateway');
const candleStore = require('../../marketdata/candle-store');
const { createStrategy } = require('../../strategies');

const router = express.Router();

router.get('/account', (req, res) => {
  res.json(paperBroker.getAccount());
});

router.post('/account/reset', (req, res) => {
  const { startingCapital } = req.body;
  if (!startingCapital || startingCapital <= 0) return res.status(400).json({ error: 'startingCapital must be a positive number' });
  res.json(paperBroker.resetAccount(startingCapital));
});

router.get('/positions', (req, res) => {
  res.json(paperBroker.getPositions());
});

router.get('/orders', (req, res) => {
  res.json(paperBroker.getOrders());
});

// Manual paper order — still flows through the gateway so risk checks and the
// kill switch apply exactly as they would to a live order.
router.post('/orders', (req, res) => {
  const { symbol, side, quantity, orderType, limitPrice, stopLossPrice, reason } = req.body;
  if (!symbol || !side || !quantity) return res.status(400).json({ error: 'symbol, side, and quantity are required' });
  if (gateway.getMode() !== 'paper') return res.status(400).json({ error: 'Broker mode is not "paper" — switch modes to place paper orders' });

  const result = gateway.placeOrder({ symbol: symbol.toUpperCase(), side, quantity, orderType, limitPrice, stopLossPrice, reason: reason || 'Manual paper order' });
  res.status(result.success ? 201 : 400).json(result);
});

// Runs a strategy against the latest available candles for a symbol and, if the
// most recent bar produced a signal, places a paper order for it.
router.post('/orders/signal', (req, res) => {
  const { strategy_id, symbol } = req.body;
  if (!strategy_id || !symbol) return res.status(400).json({ error: 'strategy_id and symbol are required' });

  const strategyRow = db.prepare(`SELECT * FROM strategies WHERE id = ?`).get(strategy_id);
  if (!strategyRow) return res.status(404).json({ error: 'Strategy not found' });

  const candles = candleStore.getCandles(symbol);
  if (candles.length < 2) return res.status(400).json({ error: `No candle data for ${symbol}. Import data first.` });

  const strategy = createStrategy(strategyRow.type, JSON.parse(strategyRow.params));
  const signals = strategy.generateSignals(candles);
  const latestSignal = signals[signals.length - 1];

  if (!latestSignal) return res.json({ success: false, reason: 'No signal on the latest bar', signal: null });
  if (gateway.getMode() !== 'paper') return res.status(400).json({ error: 'Broker mode is not "paper" — switch modes to place paper orders' });

  const positions = paperBroker.getPositions();
  const held = positions.find(p => p.symbol === symbol.toUpperCase() && p.quantity !== 0);
  if (latestSignal === 'sell' && !held) {
    return res.json({ success: false, reason: 'Sell signal but no open position to exit', signal: latestSignal });
  }

  // Size buys inside both available cash and the max-order-value risk limit —
  // sizing on full cash would just get every signal rejected by the risk
  // engine. Divide by the slippage-adjusted fill estimate so the fill itself
  // can't overshoot cash.
  const latestPrice = candles[candles.length - 1].close;
  const { max_order_value } = db.prepare(`SELECT max_order_value FROM risk_settings WHERE id = 1`).get();
  const estimatedFill = latestPrice * (1 + paperBroker.SLIPPAGE_BPS / 10000);
  const budget = Math.min(paperBroker.getAccount().cash, max_order_value);
  const quantity = latestSignal === 'buy'
    ? Math.floor(budget / estimatedFill)
    : Math.abs(held.quantity);

  if (quantity <= 0) return res.json({ success: false, reason: 'Insufficient cash to size a position', signal: latestSignal });

  const result = gateway.placeOrder({
    symbol: symbol.toUpperCase(), side: latestSignal, quantity,
    strategyId: strategy_id, reason: `Signal from strategy "${strategyRow.name}"`,
  });
  res.status(result.success ? 201 : 400).json({ ...result, signal: latestSignal });
});

module.exports = router;
