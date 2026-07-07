const zerodha = require('../auth/zerodha');
const logger = require('../../utils/logger');

// Behind the same interface as yahoo.js, so backtests/candle imports don't care which
// source they came from. Requires Zerodha's paid Historical Data API add-on (~₹2k/mo)
// and a valid access token — most users won't have this enabled, so this is a stub
// that fails clearly rather than silently returning nothing.
async function fetchDailyCandles(symbol, { instrumentToken, range = '1y' } = {}) {
  if (!instrumentToken) {
    throw new Error('Kite historical data requires an instrument_token. Look it up via the Kite instruments dump — not implemented in this MVP.');
  }
  if (!zerodha.isConnected) {
    throw new Error('Zerodha is not connected. Log in first (broker read-only integration).');
  }

  const toDate = new Date();
  const fromDate = new Date();
  const yearsBack = { '1mo': 1 / 12, '3mo': 0.25, '6mo': 0.5, '1y': 1, '2y': 2, '5y': 5, max: 10 }[range] ?? 1;
  fromDate.setDate(fromDate.getDate() - Math.round(yearsBack * 365));

  try {
    const data = await zerodha.kite.getHistoricalData(instrumentToken, 'day', fromDate, toDate);
    return data.map(c => ({
      date: new Date(c.date).toISOString().slice(0, 10),
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    }));
  } catch (err) {
    logger.error(`Kite historical fetch failed for token ${instrumentToken}:`, err.message);
    throw new Error(`Kite historical fetch failed — this requires the paid Historical Data API add-on: ${err.message}`);
  }
}

module.exports = { fetchDailyCandles };
