const axios = require('axios');
const logger = require('../../utils/logger');

// Yahoo Finance's chart endpoint is unauthenticated and covers NSE (.NS) and BSE (.BO) daily data for free.
const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

function toYahooSymbol(symbol, exchange = 'NSE') {
  if (/\.(NS|BO)$/i.test(symbol)) return symbol.toUpperCase();
  return `${symbol.toUpperCase()}.${exchange === 'BSE' ? 'BO' : 'NS'}`;
}

/**
 * Fetches daily OHLCV candles from Yahoo Finance.
 * range: '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max'
 */
async function fetchDailyCandles(symbol, { exchange = 'NSE', range = '1y' } = {}) {
  const yahooSymbol = toYahooSymbol(symbol, exchange);
  const url = `${BASE_URL}/${encodeURIComponent(yahooSymbol)}`;

  try {
    const { data } = await axios.get(url, {
      params: { range, interval: '1d', events: 'history' },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketResearchBot/1.0)' },
      timeout: 15000,
    });

    const result = data?.chart?.result?.[0];
    if (!result) throw new Error(data?.chart?.error?.description || 'No data returned');

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      if ([open, high, low, close].some(v => v == null)) continue;
      candles.push({
        date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
        open, high, low, close,
        volume: quote.volume?.[i] || 0,
      });
    }
    return candles;
  } catch (err) {
    logger.error(`Yahoo fetch failed for ${yahooSymbol}:`, err.message);
    throw new Error(`Yahoo Finance fetch failed for ${yahooSymbol}: ${err.message}`);
  }
}

module.exports = { fetchDailyCandles, toYahooSymbol };
