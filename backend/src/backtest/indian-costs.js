// Approximate NSE equity-delivery cost model (rates as of 2024, Zerodha-style discount broker).
// Not exact to the rupee — real charges vary by broker and change over time — but close
// enough that backtest P&L isn't wildly optimistic from ignoring costs entirely.
const RATES = {
  brokeragePerOrder: 0,        // discount brokers charge ₹0 on equity delivery
  sttPct: 0.001,                // 0.1% on both buy and sell (delivery)
  exchangeTransactionPct: 0.0000297, // NSE ~0.00297%
  sebiChargesPct: 0.000001,     // ₹10 per crore
  stampDutyPct: 0.00015,        // 0.015%, buy side only
  gstPct: 0.18,                 // on (brokerage + exchange charges + sebi charges)
};

function legCosts(side, value) {
  const brokerage = RATES.brokeragePerOrder;
  const stt = value * RATES.sttPct;
  const exchangeCharge = value * RATES.exchangeTransactionPct;
  const sebiCharge = value * RATES.sebiChargesPct;
  const stampDuty = side === 'buy' ? value * RATES.stampDutyPct : 0;
  const gst = (brokerage + exchangeCharge + sebiCharge) * RATES.gstPct;
  const total = brokerage + stt + exchangeCharge + sebiCharge + stampDuty + gst;
  return { brokerage, stt, exchangeCharge, sebiCharge, stampDuty, gst, total };
}

function calculateOrderCosts({ side, price, quantity }) {
  const value = price * quantity;
  return { value, ...legCosts(side, value) };
}

// Total cost of a completed round-trip trade (entry buy + exit sell for a long).
function calculateTradeCosts({ entryPrice, exitPrice, quantity, side = 'long' }) {
  const entrySide = side === 'long' ? 'buy' : 'sell';
  const exitSide = side === 'long' ? 'sell' : 'buy';
  const entry = calculateOrderCosts({ side: entrySide, price: entryPrice, quantity });
  const exit = calculateOrderCosts({ side: exitSide, price: exitPrice, quantity });
  return { entry, exit, total: entry.total + exit.total };
}

function applySlippage(price, side, slippageBps) {
  const dir = side === 'buy' ? 1 : -1;
  return price * (1 + dir * (slippageBps || 0) / 10000);
}

module.exports = { calculateOrderCosts, calculateTradeCosts, applySlippage, RATES };
