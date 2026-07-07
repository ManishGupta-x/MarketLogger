// Single choke point for every order attempt in the system, paper or live.
// Order flow: risk engine -> mode gate -> execution (paper only in this build).
// There is no live order-placement code path at all — live modes always reject,
// so a bug or bad UI click cannot ever result in a real order being sent to Zerodha.
const db = require('../db');
const logger = require('../../utils/logger');
const riskEngine = require('../risk/engine');
const paperBroker = require('../paper/paper-broker');

function logAttempt({ mode, symbol, side, quantity, price, passed, checks, reason }) {
  db.prepare(
    `INSERT INTO order_log (mode, action, symbol, side, quantity, price, passed, risk_checks, reason)
     VALUES (?, 'order_attempt', ?, ?, ?, ?, ?, ?, ?)`
  ).run(mode, symbol, side, quantity, price ?? null, passed ? 1 : 0, JSON.stringify(checks || []), reason || null);
}

function getMode() {
  return db.prepare(`SELECT broker_mode FROM app_settings WHERE id = 1`).get().broker_mode;
}

/**
 * orderIntent: { symbol, side, quantity, price?, limitPrice?, stopLossPrice?, orderType?, strategyId?, reason? }
 */
function placeOrder(orderIntent) {
  const mode = getMode();
  const price = orderIntent.limitPrice ?? orderIntent.price ?? riskEngine.getLatestPrice(orderIntent.symbol);

  const evaluation = riskEngine.evaluateOrder({
    accountId: paperBroker.DEFAULT_ACCOUNT_ID,
    symbol: orderIntent.symbol,
    side: orderIntent.side,
    quantity: orderIntent.quantity,
    price,
    stopLossPrice: orderIntent.stopLossPrice,
    mode,
  });

  if (!evaluation.passed) {
    // Non-blocking checks (e.g. market_hours in paper mode) may also have
    // failed — naming only the blocking ones keeps the reject reason honest.
    const failedChecks = evaluation.checks.filter(c => !c.passed && c.blocking !== false).map(c => c.check).join(', ');
    logAttempt({ mode, symbol: orderIntent.symbol, side: orderIntent.side, quantity: orderIntent.quantity, price, passed: false, checks: evaluation.checks, reason: `Risk check(s) failed: ${failedChecks}` });
    return { success: false, reason: `Risk check(s) failed: ${failedChecks}`, checks: evaluation.checks };
  }

  if (mode === 'paper') {
    const order = paperBroker.fillOrder({
      symbol: orderIntent.symbol,
      side: orderIntent.side,
      quantity: orderIntent.quantity,
      orderType: orderIntent.orderType,
      limitPrice: orderIntent.limitPrice,
      strategyId: orderIntent.strategyId,
      reason: orderIntent.reason,
    });
    const success = order.status === 'filled';
    logAttempt({ mode, symbol: orderIntent.symbol, side: orderIntent.side, quantity: orderIntent.quantity, price, passed: success, checks: evaluation.checks, reason: success ? 'Filled' : order.reject_reason });
    return { success, order };
  }

  // live_readonly | live_confirm | live_auto — always rejected in this MVP.
  const reason = 'Live order placement is not implemented in this build. Broker integration is read-only (holdings/positions/margins only).';
  logger.warn('Live order attempt blocked', { symbol: orderIntent.symbol, side: orderIntent.side, mode });
  logAttempt({ mode, symbol: orderIntent.symbol, side: orderIntent.side, quantity: orderIntent.quantity, price, passed: false, checks: evaluation.checks, reason });
  return { success: false, reason, checks: evaluation.checks };
}

module.exports = { placeOrder, getMode };
