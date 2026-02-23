const Decimal = require('decimal.js');
const logger = require('../utils/logger');

/**
 * Technical Indicators Service
 * Calculates various technical indicators from price data
 */
class TechnicalIndicatorsService {
  constructor() {
    // Price buffers for each token (stores OHLC candles)
    this.priceBuffers = new Map(); // token -> { prices: [], highs: [], lows: [], closes: [], volumes: [] }
    this.maxBufferSize = 200; // Keep last 200 data points
  }

  /**
   * Update price buffer with new tick data
   * @param {string} token - Instrument token
   * @param {Object} tick - Tick data with last_price, ohlc, volume
   */
  updatePriceBuffer(token, tick) {
    if (!this.priceBuffers.has(token)) {
      this.priceBuffers.set(token, {
        prices: [],
        highs: [],
        lows: [],
        closes: [],
        volumes: [],
        timestamps: []
      });
    }

    const buffer = this.priceBuffers.get(token);
    const price = tick.last_price;
    const high = tick.ohlc?.high || price;
    const low = tick.ohlc?.low || price;
    const close = tick.ohlc?.close || price;
    const volume = tick.volume_traded || 0;

    buffer.prices.push(price);
    buffer.highs.push(high);
    buffer.lows.push(low);
    buffer.closes.push(close);
    buffer.volumes.push(volume);
    buffer.timestamps.push(Date.now());

    // Trim buffer if exceeds max size
    if (buffer.prices.length > this.maxBufferSize) {
      buffer.prices.shift();
      buffer.highs.shift();
      buffer.lows.shift();
      buffer.closes.shift();
      buffer.volumes.shift();
      buffer.timestamps.shift();
    }
  }

  /**
   * Get price buffer for a token
   * @param {string} token - Instrument token
   * @returns {Object|null} Price buffer or null
   */
  getPriceBuffer(token) {
    return this.priceBuffers.get(token) || null;
  }

  /**
   * Calculate Simple Moving Average
   * @param {number[]} prices - Array of prices
   * @param {number} period - SMA period
   * @returns {number|null} SMA value or null if insufficient data
   */
  calculateSMA(prices, period) {
    if (!prices || prices.length < period) {
      return null;
    }

    const relevantPrices = prices.slice(-period);
    const sum = relevantPrices.reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  /**
   * Calculate Exponential Moving Average
   * @param {number[]} prices - Array of prices
   * @param {number} period - EMA period
   * @returns {number|null} EMA value or null if insufficient data
   */
  calculateEMA(prices, period) {
    if (!prices || prices.length < period) {
      return null;
    }

    const multiplier = 2 / (period + 1);

    // Start with SMA for first EMA value
    let ema = this.calculateSMA(prices.slice(0, period), period);
    if (ema === null) return null;

    // Calculate EMA for remaining prices
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Calculate Relative Strength Index (RSI)
   * @param {number[]} prices - Array of prices
   * @param {number} period - RSI period (typically 14)
   * @returns {number|null} RSI value (0-100) or null if insufficient data
   */
  calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) {
      return null;
    }

    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    const relevantChanges = changes.slice(-period);

    let gains = 0;
    let losses = 0;

    relevantChanges.forEach(change => {
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    });

    const avgGain = gains / period;
    const avgLoss = losses / period;

    // Handle edge cases
    if (avgGain === 0 && avgLoss === 0) {
      return 50; // No movement = neutral RSI
    }

    if (avgLoss === 0) {
      return 100; // All gains, no losses = overbought
    }

    if (avgGain === 0) {
      return 0; // All losses, no gains = oversold
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  /**
   * Calculate Average True Range (ATR)
   * @param {number[]} highs - Array of high prices
   * @param {number[]} lows - Array of low prices
   * @param {number[]} closes - Array of close prices
   * @param {number} period - ATR period (typically 14)
   * @returns {number|null} ATR value or null if insufficient data
   */
  calculateATR(highs, lows, closes, period = 14) {
    if (!highs || !lows || !closes || highs.length < period + 1) {
      return null;
    }

    const trueRanges = [];

    for (let i = 1; i < highs.length; i++) {
      const highLow = highs[i] - lows[i];
      const highClose = Math.abs(highs[i] - closes[i - 1]);
      const lowClose = Math.abs(lows[i] - closes[i - 1]);

      trueRanges.push(Math.max(highLow, highClose, lowClose));
    }

    // Calculate ATR as EMA of true ranges
    const relevantTR = trueRanges.slice(-period);
    const atr = relevantTR.reduce((acc, tr) => acc + tr, 0) / period;

    return atr;
  }

  /**
   * Calculate Average Directional Index (ADX)
   * Measures trend strength (not direction)
   * @param {number[]} highs - Array of high prices
   * @param {number[]} lows - Array of low prices
   * @param {number[]} closes - Array of close prices
   * @param {number} period - ADX period (typically 14)
   * @returns {Object|null} { adx, plusDI, minusDI } or null if insufficient data
   */
  calculateADX(highs, lows, closes, period = 14) {
    if (!highs || !lows || !closes || highs.length < period * 2) {
      return null;
    }

    const plusDM = [];
    const minusDM = [];
    const trueRanges = [];

    // Calculate +DM, -DM, and TR
    for (let i = 1; i < highs.length; i++) {
      const highDiff = highs[i] - highs[i - 1];
      const lowDiff = lows[i - 1] - lows[i];

      // +DM
      if (highDiff > lowDiff && highDiff > 0) {
        plusDM.push(highDiff);
      } else {
        plusDM.push(0);
      }

      // -DM
      if (lowDiff > highDiff && lowDiff > 0) {
        minusDM.push(lowDiff);
      } else {
        minusDM.push(0);
      }

      // True Range
      const highLow = highs[i] - lows[i];
      const highClose = Math.abs(highs[i] - closes[i - 1]);
      const lowClose = Math.abs(lows[i] - closes[i - 1]);
      trueRanges.push(Math.max(highLow, highClose, lowClose));
    }

    // Smooth the values
    const smoothedPlusDM = this.calculateEMA(plusDM, period);
    const smoothedMinusDM = this.calculateEMA(minusDM, period);
    const smoothedTR = this.calculateEMA(trueRanges, period);

    if (!smoothedPlusDM || !smoothedMinusDM || !smoothedTR || smoothedTR === 0) {
      return null;
    }

    // Calculate +DI and -DI
    const plusDI = (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = (smoothedMinusDM / smoothedTR) * 100;

    // Calculate DX
    const diSum = plusDI + minusDI;
    if (diSum === 0) {
      return { adx: 0, plusDI, minusDI };
    }

    const dx = (Math.abs(plusDI - minusDI) / diSum) * 100;

    // ADX is smoothed DX (we'll use simple average for now)
    // In a more complete implementation, you'd track DX over time
    const adx = dx;

    return { adx, plusDI, minusDI };
  }

  /**
   * Calculate Rate of Change (ROC) / Momentum
   * @param {number[]} prices - Array of prices
   * @param {number} period - ROC period
   * @returns {number|null} ROC percentage or null if insufficient data
   */
  calculateROC(prices, period = 10) {
    if (!prices || prices.length < period + 1) {
      return null;
    }

    const currentPrice = prices[prices.length - 1];
    const pastPrice = prices[prices.length - 1 - period];

    if (pastPrice === 0) return null;

    const roc = ((currentPrice - pastPrice) / pastPrice) * 100;
    return roc;
  }

  /**
   * Calculate Beta (stock volatility relative to market)
   * @param {number[]} stockPrices - Array of stock prices
   * @param {number[]} marketPrices - Array of market (NIFTY) prices
   * @param {number} period - Period for calculation
   * @returns {number|null} Beta value or null if insufficient data
   */
  calculateBeta(stockPrices, marketPrices, period = 20) {
    if (!stockPrices || !marketPrices ||
        stockPrices.length < period + 1 || marketPrices.length < period + 1) {
      return null;
    }

    // Calculate returns
    const stockReturns = [];
    const marketReturns = [];

    const stockSlice = stockPrices.slice(-period - 1);
    const marketSlice = marketPrices.slice(-period - 1);

    for (let i = 1; i < stockSlice.length; i++) {
      stockReturns.push((stockSlice[i] - stockSlice[i - 1]) / stockSlice[i - 1]);
      marketReturns.push((marketSlice[i] - marketSlice[i - 1]) / marketSlice[i - 1]);
    }

    // Calculate covariance and variance
    const avgStockReturn = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
    const avgMarketReturn = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;

    let covariance = 0;
    let marketVariance = 0;

    for (let i = 0; i < stockReturns.length; i++) {
      covariance += (stockReturns[i] - avgStockReturn) * (marketReturns[i] - avgMarketReturn);
      marketVariance += Math.pow(marketReturns[i] - avgMarketReturn, 2);
    }

    covariance /= stockReturns.length;
    marketVariance /= marketReturns.length;

    if (marketVariance === 0) return null;

    const beta = covariance / marketVariance;
    return beta;
  }

  /**
   * Calculate Relative Strength (stock performance vs market)
   * @param {number[]} stockPrices - Array of stock prices
   * @param {number[]} marketPrices - Array of market (NIFTY) prices
   * @param {number} period - Period for calculation
   * @returns {number|null} RS value (>1 = outperforming) or null
   */
  calculateRelativeStrength(stockPrices, marketPrices, period = 20) {
    if (!stockPrices || !marketPrices ||
        stockPrices.length < period || marketPrices.length < period) {
      return null;
    }

    const stockStart = stockPrices[stockPrices.length - period];
    const stockEnd = stockPrices[stockPrices.length - 1];
    const marketStart = marketPrices[marketPrices.length - period];
    const marketEnd = marketPrices[marketPrices.length - 1];

    if (stockStart === 0 || marketStart === 0) return null;

    const stockReturn = (stockEnd - stockStart) / stockStart;
    const marketReturn = (marketEnd - marketStart) / marketStart;

    if (marketReturn === 0) return stockReturn > 0 ? 2 : 0.5;

    // RS > 1 means stock outperforming market
    const rs = (1 + stockReturn) / (1 + marketReturn);
    return rs;
  }

  /**
   * Calculate Volatility (standard deviation of returns)
   * @param {number[]} prices - Array of prices
   * @param {number} period - Period for calculation
   * @returns {number|null} Volatility percentage or null
   */
  calculateVolatility(prices, period = 20) {
    if (!prices || prices.length < period + 1) {
      return null;
    }

    const returns = [];
    const priceSlice = prices.slice(-period - 1);

    for (let i = 1; i < priceSlice.length; i++) {
      returns.push((priceSlice[i] - priceSlice[i - 1]) / priceSlice[i - 1]);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    let sumSquaredDiff = 0;
    for (const ret of returns) {
      sumSquaredDiff += Math.pow(ret - avgReturn, 2);
    }

    const variance = sumSquaredDiff / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualize (assuming ~252 trading days)
    const annualizedVol = stdDev * Math.sqrt(252) * 100;
    return annualizedVol;
  }

  /**
   * Calculate all indicators for a stock
   * @param {string} token - Instrument token
   * @param {Object} marketBuffer - Market (NIFTY) price buffer for relative calculations
   * @returns {Object} All calculated indicators
   */
  calculateAllIndicators(token, marketBuffer = null) {
    const buffer = this.priceBuffers.get(token);
    if (!buffer || buffer.prices.length < 20) {
      return null;
    }

    const prices = buffer.prices;
    const highs = buffer.highs;
    const lows = buffer.lows;
    const closes = buffer.closes;

    const indicators = {
      sma20: this.calculateSMA(prices, 20),
      sma50: this.calculateSMA(prices, 50),
      ema20: this.calculateEMA(prices, 20),
      ema50: this.calculateEMA(prices, 50),
      rsi: this.calculateRSI(prices, 14),
      atr: this.calculateATR(highs, lows, closes, 14),
      adx: this.calculateADX(highs, lows, closes, 14),
      roc: this.calculateROC(prices, 10),
      volatility: this.calculateVolatility(prices, 20),
      currentPrice: prices[prices.length - 1],
      priceCount: prices.length
    };

    // Add market-relative indicators if market buffer provided
    if (marketBuffer && marketBuffer.prices.length >= 20) {
      indicators.beta = this.calculateBeta(prices, marketBuffer.prices, 20);
      indicators.relativeStrength = this.calculateRelativeStrength(prices, marketBuffer.prices, 20);
    }

    return indicators;
  }

  /**
   * Clear price buffer for a token
   * @param {string} token - Instrument token
   */
  clearBuffer(token) {
    this.priceBuffers.delete(token);
  }

  /**
   * Clear all price buffers
   */
  clearAllBuffers() {
    this.priceBuffers.clear();
    logger.info('All price buffers cleared');
  }

  /**
   * Get buffer statistics
   * @returns {Object} Buffer stats
   */
  getBufferStats() {
    const stats = {
      totalTokens: this.priceBuffers.size,
      bufferSizes: {}
    };

    for (const [token, buffer] of this.priceBuffers.entries()) {
      stats.bufferSizes[token] = buffer.prices.length;
    }

    return stats;
  }

  /**
   * Get all tokens that have price buffers (i.e., tokens we're tracking)
   * @returns {Array} Array of token strings
   */
  getAllTrackedTokens() {
    return Array.from(this.priceBuffers.keys());
  }
}

module.exports = new TechnicalIndicatorsService();
