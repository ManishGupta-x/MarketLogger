const db = require('../db');
const { getLatestPrice } = require('../risk/engine');

const DEFAULT_ACCOUNT_ID = 1;
const SLIPPAGE_BPS = 5; // 0.05% simulated slippage on market fills

function getAccount(accountId = DEFAULT_ACCOUNT_ID) {
  return db.prepare(`SELECT * FROM paper_account WHERE id = ?`).get(accountId);
}

function getPositions(accountId = DEFAULT_ACCOUNT_ID) {
  return db.prepare(`SELECT * FROM paper_positions WHERE account_id = ? ORDER BY symbol`).all(accountId);
}

function getOrders(accountId = DEFAULT_ACCOUNT_ID) {
  return db.prepare(`SELECT * FROM paper_orders WHERE account_id = ? ORDER BY created_at DESC`).all(accountId);
}

function resetAccount(startingCapital, accountId = DEFAULT_ACCOUNT_ID) {
  const tx = db.transaction(() => {
    db.prepare(`UPDATE paper_account SET starting_capital = ?, cash = ? WHERE id = ?`).run(startingCapital, startingCapital, accountId);
    db.prepare(`DELETE FROM paper_positions WHERE account_id = ?`).run(accountId);
    db.prepare(`DELETE FROM paper_orders WHERE account_id = ?`).run(accountId);
  });
  tx();
  return getAccount(accountId);
}

/**
 * Fills a market/limit order immediately against the last known candle close
 * (± simulated slippage), since there is no live tick feed for paper trading.
 * Returns the persisted order row.
 */
function fillOrder({ accountId = DEFAULT_ACCOUNT_ID, symbol, side, quantity, orderType = 'market', limitPrice, strategyId = null, reason = null }) {
  const referencePrice = limitPrice ?? getLatestPrice(symbol);
  if (referencePrice == null) {
    return recordRejectedOrder({ accountId, symbol, side, quantity, orderType, limitPrice, strategyId, reason }, 'No price data available for symbol');
  }

  // A limit order can never fill worse than its limit price, so slippage only
  // applies to market fills.
  const slippageDir = side === 'buy' ? 1 : -1;
  const fillPrice = limitPrice != null
    ? limitPrice
    : referencePrice * (1 + slippageDir * SLIPPAGE_BPS / 10000);
  const account = getAccount(accountId);
  const cost = fillPrice * quantity;

  if (side === 'buy' && cost > account.cash) {
    return recordRejectedOrder({ accountId, symbol, side, quantity, orderType, limitPrice, strategyId, reason }, `Insufficient cash: need ₹${cost.toFixed(2)}, have ₹${account.cash.toFixed(2)}`);
  }

  const tx = db.transaction(() => {
    const existing = db.prepare(`SELECT * FROM paper_positions WHERE account_id = ? AND symbol = ?`).get(accountId, symbol);
    const signedQty = side === 'buy' ? quantity : -quantity;

    if (!existing) {
      db.prepare(
        `INSERT INTO paper_positions (account_id, symbol, quantity, avg_price, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`
      ).run(accountId, symbol, signedQty, fillPrice);
    } else {
      const newQty = existing.quantity + signedQty;
      let newAvgPrice = existing.avg_price;
      let realizedDelta = 0;

      const sameDirection = (existing.quantity >= 0 && signedQty >= 0) || (existing.quantity <= 0 && signedQty <= 0);
      if (sameDirection || existing.quantity === 0) {
        // Adding to (or opening from flat) a position — blend the average price.
        const totalCost = existing.avg_price * existing.quantity + fillPrice * signedQty;
        newAvgPrice = newQty !== 0 ? totalCost / newQty : 0;
      } else {
        // Reducing or reversing — realize P&L on the closed portion.
        const closedQty = Math.min(Math.abs(existing.quantity), Math.abs(signedQty));
        realizedDelta = (fillPrice - existing.avg_price) * closedQty * (existing.quantity > 0 ? 1 : -1);
        if (Math.abs(signedQty) > Math.abs(existing.quantity)) {
          newAvgPrice = fillPrice; // flipped through zero into the opposite side
        }
      }

      db.prepare(
        `UPDATE paper_positions SET quantity = ?, avg_price = ?, realized_pnl = realized_pnl + ?, updated_at = datetime('now') WHERE id = ?`
      ).run(newQty, newAvgPrice, realizedDelta, existing.id);
    }

    const cashDelta = side === 'buy' ? -cost : cost;
    db.prepare(`UPDATE paper_account SET cash = cash + ? WHERE id = ?`).run(cashDelta, accountId);

    const result = db.prepare(
      `INSERT INTO paper_orders (account_id, symbol, side, order_type, quantity, limit_price, status, strategy_id, reason, filled_price, filled_at)
       VALUES (?, ?, ?, ?, ?, ?, 'filled', ?, ?, ?, datetime('now'))`
    ).run(accountId, symbol, side, orderType, quantity, limitPrice ?? null, strategyId, reason, fillPrice);

    return result.lastInsertRowid;
  });

  const orderId = tx();
  return db.prepare(`SELECT * FROM paper_orders WHERE id = ?`).get(orderId);
}

function recordRejectedOrder({ accountId, symbol, side, quantity, orderType, limitPrice, strategyId, reason }, rejectReason) {
  const result = db.prepare(
    `INSERT INTO paper_orders (account_id, symbol, side, order_type, quantity, limit_price, status, strategy_id, reason, reject_reason)
     VALUES (?, ?, ?, ?, ?, ?, 'rejected', ?, ?, ?)`
  ).run(accountId, symbol, side, orderType, quantity, limitPrice ?? null, strategyId, reason, rejectReason);
  return db.prepare(`SELECT * FROM paper_orders WHERE id = ?`).get(result.lastInsertRowid);
}

module.exports = { DEFAULT_ACCOUNT_ID, SLIPPAGE_BPS, getAccount, getPositions, getOrders, resetAccount, fillOrder, recordRejectedOrder };
