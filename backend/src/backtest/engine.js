const { createStrategy } = require('../strategies');
const { calculateTradeCosts, applySlippage } = require('./indian-costs');
const { computeMetrics } = require('./metrics');

/**
 * Event-driven single-symbol daily-bar backtest. Long-only (matches the three
 * seeded strategies). A signal computed from bar N's close is only ever
 * executed at bar N+1's open — never on the bar that produced it — so there
 * is no lookahead. Stop-loss/take-profit are checked intrabar against that
 * bar's high/low, before any pending entry/exit signal is executed.
 */
function runBacktest({
  candles,
  strategyType,
  strategyParams = {},
  initialCapital = 100000,
  slippageBps = 5,
  positionSizing = 'fixed_fraction', // 'fixed_fraction' | 'risk_based'
  fraction = 1.0,
  riskPct = 1.0,
  stopLossPct = null,
  takeProfitPct = null,
}) {
  if (!candles || candles.length < 2) throw new Error('Not enough candle data to backtest');

  const strategy = createStrategy(strategyType, strategyParams);
  const signals = strategy.generateSignals(candles);

  let cash = initialCapital;
  let position = null; // { entryDate, entryPrice, quantity, stopPrice, targetPrice }
  const trades = [];
  const equityCurve = [];

  const closePosition = (bar, exitPrice, reason) => {
    const costs = calculateTradeCosts({ entryPrice: position.entryPrice, exitPrice, quantity: position.quantity, side: 'long' });
    const grossPnl = (exitPrice - position.entryPrice) * position.quantity;
    const netPnl = grossPnl - costs.total;
    cash += position.quantity * exitPrice - costs.exit.total;
    trades.push({
      side: 'long',
      entry_date: position.entryDate,
      entry_price: position.entryPrice,
      exit_date: bar.date,
      exit_price: exitPrice,
      quantity: position.quantity,
      pnl: netPnl,
      costs: costs.total,
      exit_reason: reason,
    });
    position = null;
  };

  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i];

    // Events in bar-chronological order: the open prints first, so the signal
    // generated on the previous bar's close executes at this open before any
    // intrabar stop/target can trigger.
    if (i > 0) {
      const pendingSignal = signals[i - 1];
      if (pendingSignal === 'buy' && !position && bar.open > 0) {
        const entryPrice = applySlippage(bar.open, 'buy', slippageBps);
        let quantity = sizePosition({ positionSizing, fraction, riskPct, stopLossPct, cash, entryPrice });
        // sizePosition budgets on share cost alone; shrink until costs (STT,
        // stamp duty, etc.) fit inside cash on hand too, rather than silently
        // skipping the entry when the naive budget overshoots by a few rupees.
        let totalCost = Infinity;
        while (quantity > 0) {
          const entryCosts = calculateTradeCosts({ entryPrice, exitPrice: entryPrice, quantity, side: 'long' }).entry;
          totalCost = entryPrice * quantity + entryCosts.total;
          if (totalCost <= cash) break;
          quantity -= 1;
        }
        if (quantity > 0 && totalCost <= cash) {
          cash -= totalCost;
          position = {
            entryDate: bar.date,
            entryPrice,
            quantity,
            stopPrice: stopLossPct ? entryPrice * (1 - stopLossPct / 100) : null,
            targetPrice: takeProfitPct ? entryPrice * (1 + takeProfitPct / 100) : null,
          };
        }
      } else if (pendingSignal === 'sell' && position) {
        closePosition(bar, applySlippage(bar.open, 'sell', slippageBps), 'signal');
      }
    }

    // Intrabar stop/target, applied to whatever is held after the open —
    // including a position entered at this bar's open. If the bar gaps through
    // the level, the fill is the open, not the level (you can't fill better
    // than where trading resumed).
    if (position) {
      if (position.stopPrice != null && bar.low <= position.stopPrice) {
        const fillPrice = Math.min(bar.open, position.stopPrice);
        closePosition(bar, applySlippage(fillPrice, 'sell', slippageBps), 'stop_loss');
      } else if (position.targetPrice != null && bar.high >= position.targetPrice) {
        const fillPrice = Math.max(bar.open, position.targetPrice);
        closePosition(bar, applySlippage(fillPrice, 'sell', slippageBps), 'take_profit');
      }
    }

    const markToMarket = position ? position.quantity * bar.close : 0;
    equityCurve.push({ date: bar.date, equity: cash + markToMarket });
  }

  if (position) {
    const lastBar = candles[candles.length - 1];
    closePosition(lastBar, lastBar.close, 'end_of_data');
    // Recompute the final equity point now that the position is flat.
    equityCurve[equityCurve.length - 1] = { date: lastBar.date, equity: cash };
  }

  const metrics = computeMetrics({
    trades,
    equityCurve,
    initialCapital,
    startDate: candles[0].date,
    endDate: candles[candles.length - 1].date,
  });

  return { trades, equityCurve, metrics };
}

function sizePosition({ positionSizing, fraction, riskPct, stopLossPct, cash, entryPrice }) {
  if (positionSizing === 'risk_based') {
    if (!stopLossPct) throw new Error('risk_based position sizing requires stopLossPct');
    const riskPerShare = entryPrice * (stopLossPct / 100);
    const riskBudget = cash * (riskPct / 100);
    return Math.floor(riskBudget / riskPerShare);
  }
  const budget = cash * fraction;
  return Math.floor(budget / entryPrice);
}

module.exports = { runBacktest };
