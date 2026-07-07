const db = require('../db');
const killSwitch = require('./kill-switch');

function getLatestPrice(symbol) {
  const row = db.prepare(
    `SELECT close FROM candles WHERE symbol = ? ORDER BY date DESC LIMIT 1`
  ).get(symbol);
  return row ? row.close : null;
}

function getAccountEquity(accountId) {
  const account = db.prepare(`SELECT cash FROM paper_account WHERE id = ?`).get(accountId);
  if (!account) return 0;
  const positions = db.prepare(`SELECT symbol, quantity, avg_price FROM paper_positions WHERE account_id = ? AND quantity != 0`).all(accountId);
  let marketValue = 0;
  for (const p of positions) {
    const price = getLatestPrice(p.symbol) ?? p.avg_price;
    marketValue += p.quantity * price;
  }
  return account.cash + marketValue;
}

function isMarketHoursIST(date = new Date()) {
  // Convert to IST (UTC+5:30) without relying on server timezone.
  const istMs = date.getTime() + (5.5 * 60 + date.getTimezoneOffset()) * 60000;
  const ist = new Date(istMs);
  const day = ist.getDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

/**
 * Evaluates an order intent against every configured risk limit.
 * orderIntent: { accountId, symbol, side ('buy'|'sell'), quantity, price, stopLossPrice? }
 * Returns { passed, checks: [{ check, passed, detail }] }
 */
function evaluateOrder(orderIntent) {
  const { accountId, symbol, side, quantity, price, stopLossPrice, mode = 'paper' } = orderIntent;
  // market_hours/stale_data exist to stop a *live* order from firing on data
  // that's out of date — they'd otherwise make paper trading useless for
  // testing strategies against imported historical data or outside trading
  // hours. So they're evaluated and logged in every mode, but only block the
  // order in a live mode.
  const dataFreshnessBlocking = mode !== 'paper';
  const settings = db.prepare(`SELECT * FROM risk_settings WHERE id = 1`).get();
  const checks = [];

  const ks = killSwitch.isActive();
  checks.push({ check: 'kill_switch', passed: !ks.active, detail: ks.active ? `Kill switch active: ${ks.reason}` : 'Kill switch inactive' });

  const orderValue = quantity * price;
  checks.push({
    check: 'max_order_value',
    passed: orderValue <= settings.max_order_value,
    detail: `Order value ₹${orderValue.toFixed(2)} vs limit ₹${settings.max_order_value}`,
  });

  const equity = getAccountEquity(accountId);
  const account = db.prepare(`SELECT starting_capital, cash FROM paper_account WHERE id = ?`).get(accountId);
  const dailyLoss = account ? account.starting_capital - equity : 0;
  checks.push({
    check: 'max_daily_loss',
    passed: dailyLoss <= settings.max_daily_loss,
    detail: `Drawdown from starting capital ₹${dailyLoss.toFixed(2)} vs limit ₹${settings.max_daily_loss}`,
  });

  if (stopLossPrice != null && price != null) {
    const riskPerShare = Math.abs(price - stopLossPrice);
    const riskAmount = riskPerShare * quantity;
    const riskPct = equity > 0 ? (riskAmount / equity) * 100 : 100;
    checks.push({
      check: 'max_risk_per_trade',
      passed: riskPct <= settings.max_risk_per_trade_pct,
      detail: `Trade risk ${riskPct.toFixed(2)}% of equity vs limit ${settings.max_risk_per_trade_pct}%`,
    });
  } else {
    checks.push({ check: 'max_risk_per_trade', passed: true, detail: 'No stop-loss supplied — check skipped' });
  }

  const positions = db.prepare(`SELECT symbol, quantity, avg_price FROM paper_positions WHERE account_id = ? AND quantity != 0`).all(accountId);
  const existingSymbols = new Set(positions.map(p => p.symbol));
  const willAddNewPosition = side === 'buy' && !existingSymbols.has(symbol);
  const openPositionsAfter = positions.length + (willAddNewPosition ? 1 : 0);
  checks.push({
    check: 'max_open_positions',
    passed: openPositionsAfter <= settings.max_open_positions,
    detail: `Open positions after fill: ${openPositionsAfter} vs limit ${settings.max_open_positions}`,
  });

  const existingPosition = positions.find(p => p.symbol === symbol);
  const existingExposure = existingPosition ? Math.abs(existingPosition.quantity * existingPosition.avg_price) : 0;
  const positionExposureAfter = existingExposure + orderValue;
  const positionExposurePct = equity > 0 ? (positionExposureAfter / equity) * 100 : 100;
  checks.push({
    check: 'max_position_exposure',
    passed: positionExposurePct <= settings.max_position_exposure_pct,
    detail: `${symbol} exposure ${positionExposurePct.toFixed(2)}% of equity vs limit ${settings.max_position_exposure_pct}%`,
  });

  const totalExposure = positions.reduce((sum, p) => sum + Math.abs(p.quantity * p.avg_price), 0) + orderValue;
  const totalExposurePct = equity > 0 ? (totalExposure / equity) * 100 : 100;
  checks.push({
    check: 'max_total_exposure',
    passed: totalExposurePct <= settings.max_total_exposure_pct,
    detail: `Total exposure ${totalExposurePct.toFixed(2)}% of equity vs limit ${settings.max_total_exposure_pct}%`,
  });

  const marketOpen = isMarketHoursIST();
  checks.push({
    check: 'market_hours',
    passed: marketOpen,
    blocking: dataFreshnessBlocking,
    detail: marketOpen ? 'Within NSE market hours (IST)' : 'Outside NSE market hours (9:15–15:30 IST, Mon–Fri)',
  });

  const latestPrice = getLatestPrice(symbol);
  let staleDetail = 'No price data available for symbol';
  let staleOk = false;
  if (latestPrice != null) {
    const latestRow = db.prepare(`SELECT date FROM candles WHERE symbol = ? ORDER BY date DESC LIMIT 1`).get(symbol);
    const ageDays = (Date.now() - new Date(latestRow.date).getTime()) / 86400000;
    staleOk = ageDays <= 5;
    staleDetail = `Latest candle is ${ageDays.toFixed(1)} days old (limit 5)`;
  }
  checks.push({ check: 'stale_data', passed: staleOk, blocking: dataFreshnessBlocking, detail: staleDetail });

  // Only meaningful conflict in this long-only platform: selling more than
  // you currently hold (including selling with no position at all, which
  // would open an unintended naked short).
  const heldQuantity = existingPosition ? Math.max(0, existingPosition.quantity) : 0;
  const conflict = side === 'sell' && quantity > heldQuantity;
  checks.push({
    check: 'position_conflict',
    passed: !conflict,
    detail: conflict ? `Selling ${quantity} but only ${heldQuantity} held in ${symbol}` : 'No conflicting position',
  });

  const passed = checks.every(c => c.passed || c.blocking === false);
  return { passed, checks, equity };
}

module.exports = { evaluateOrder, getLatestPrice, getAccountEquity, isMarketHoursIST };
