const logger = require('../../utils/logger');
const config = require('../../config');

/**
 * Technical indicators with per-token OHLCV price buffers.
 * Supports: SMA, EMA, RSI, ATR, ADX, ROC, Beta, RelativeStrength, Volatility
 */
class Indicators {
  constructor() {
    // token (number) -> { prices, highs, lows, closes, volumes, timestamps }
    this.buffers = new Map();
    this.maxSize = config.position.maxPriceHistory; // 100 by default
  }

  // ── Buffer management ────────────────────────────────────────────────────

  updateBuffer(token, tick) {
    if (!this.buffers.has(token)) {
      this.buffers.set(token, { prices: [], highs: [], lows: [], closes: [], volumes: [], timestamps: [] });
    }
    const b = this.buffers.get(token);
    const price = tick.last_price;
    b.prices.push(price);
    b.highs.push(tick.ohlc?.high || price);
    b.lows.push(tick.ohlc?.low || price);
    b.closes.push(tick.ohlc?.close || price);
    b.volumes.push(tick.volume_traded || 0);
    b.timestamps.push(Date.now());

    if (b.prices.length > this.maxSize) {
      b.prices.shift(); b.highs.shift(); b.lows.shift();
      b.closes.shift(); b.volumes.shift(); b.timestamps.shift();
    }
  }

  getBuffer(token) { return this.buffers.get(token) || null; }
  clearBuffer(token) { this.buffers.delete(token); }
  clearAll() { this.buffers.clear(); logger.info('All price buffers cleared'); }

  getTrackedTokens() { return Array.from(this.buffers.keys()); }

  getBufferStats() {
    const sizes = {};
    for (const [t, b] of this.buffers.entries()) sizes[t] = b.prices.length;
    return { totalTokens: this.buffers.size, bufferSizes: sizes };
  }

  // ── SMA ───────────────────────────────────────────────────────────────────

  sma(prices, period) {
    if (!prices || prices.length < period) return null;
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  // ── EMA ───────────────────────────────────────────────────────────────────

  ema(prices, period) {
    if (!prices || prices.length < period) return null;
    const k = 2 / (period + 1);
    let val = this.sma(prices.slice(0, period), period);
    if (val === null) return null;
    for (let i = period; i < prices.length; i++) val = (prices[i] - val) * k + val;
    return val;
  }

  // ── RSI ───────────────────────────────────────────────────────────────────

  rsi(prices, period = 14) {
    if (!prices || prices.length < period + 1) return null;
    const changes = [];
    for (let i = 1; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);
    const slice = changes.slice(-period);
    let gains = 0, losses = 0;
    slice.forEach(c => { if (c > 0) gains += c; else losses += Math.abs(c); });
    const ag = gains / period, al = losses / period;
    if (ag === 0 && al === 0) return 50;
    if (al === 0) return 100;
    if (ag === 0) return 0;
    return 100 - (100 / (1 + ag / al));
  }

  // ── ATR ───────────────────────────────────────────────────────────────────

  atr(highs, lows, closes, period = 14) {
    if (!highs || highs.length < period + 1) return null;
    const trs = [];
    for (let i = 1; i < highs.length; i++) {
      trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    }
    return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  // ── ADX ───────────────────────────────────────────────────────────────────

  adx(highs, lows, closes, period = 14) {
    if (!highs || highs.length < period * 2) return null;
    const plusDM = [], minusDM = [], trs = [];
    for (let i = 1; i < highs.length; i++) {
      const hd = highs[i] - highs[i - 1], ld = lows[i - 1] - lows[i];
      plusDM.push(hd > ld && hd > 0 ? hd : 0);
      minusDM.push(ld > hd && ld > 0 ? ld : 0);
      trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    }
    const sPlusDM = this.ema(plusDM, period);
    const sMinusDM = this.ema(minusDM, period);
    const sTR = this.ema(trs, period);
    if (!sPlusDM || !sMinusDM || !sTR || sTR === 0) return null;
    const plusDI = (sPlusDM / sTR) * 100;
    const minusDI = (sMinusDM / sTR) * 100;
    const diSum = plusDI + minusDI;
    if (diSum === 0) return { adx: 0, plusDI, minusDI };
    return { adx: (Math.abs(plusDI - minusDI) / diSum) * 100, plusDI, minusDI };
  }

  // ── ROC ───────────────────────────────────────────────────────────────────

  roc(prices, period = 10) {
    if (!prices || prices.length < period + 1) return null;
    const cur = prices[prices.length - 1], past = prices[prices.length - 1 - period];
    if (past === 0) return null;
    return ((cur - past) / past) * 100;
  }

  // ── Beta ──────────────────────────────────────────────────────────────────

  beta(stockPrices, marketPrices, period = 20) {
    if (!stockPrices || !marketPrices || stockPrices.length < period + 1 || marketPrices.length < period + 1) return null;
    const sR = [], mR = [];
    const ss = stockPrices.slice(-period - 1), ms = marketPrices.slice(-period - 1);
    for (let i = 1; i < ss.length; i++) {
      sR.push((ss[i] - ss[i - 1]) / ss[i - 1]);
      mR.push((ms[i] - ms[i - 1]) / ms[i - 1]);
    }
    const avgS = sR.reduce((a, b) => a + b, 0) / sR.length;
    const avgM = mR.reduce((a, b) => a + b, 0) / mR.length;
    let cov = 0, mVar = 0;
    for (let i = 0; i < sR.length; i++) {
      cov += (sR[i] - avgS) * (mR[i] - avgM);
      mVar += (mR[i] - avgM) ** 2;
    }
    cov /= sR.length; mVar /= mR.length;
    return mVar === 0 ? null : cov / mVar;
  }

  // ── Relative Strength ─────────────────────────────────────────────────────

  relativeStrength(stockPrices, marketPrices, period = 20) {
    if (!stockPrices || !marketPrices || stockPrices.length < period || marketPrices.length < period) return null;
    const sS = stockPrices[stockPrices.length - period], sE = stockPrices[stockPrices.length - 1];
    const mS = marketPrices[marketPrices.length - period], mE = marketPrices[marketPrices.length - 1];
    if (sS === 0 || mS === 0) return null;
    const sRet = (sE - sS) / sS, mRet = (mE - mS) / mS;
    if (mRet === 0) return sRet > 0 ? 2 : 0.5;
    return (1 + sRet) / (1 + mRet);
  }

  // ── Volatility ────────────────────────────────────────────────────────────

  volatility(prices, period = 20) {
    if (!prices || prices.length < period + 1) return null;
    const rets = [];
    const slice = prices.slice(-period - 1);
    for (let i = 1; i < slice.length; i++) rets.push((slice[i] - slice[i - 1]) / slice[i - 1]);
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((s, r) => s + (r - avg) ** 2, 0) / rets.length;
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
  }

  // ── All indicators for a token ────────────────────────────────────────────

  forToken(token, marketBuffer = null) {
    const b = this.buffers.get(token);
    if (!b || b.prices.length < 20) return null;
    const { prices, highs, lows, closes } = b;
    const adxResult = this.adx(highs, lows, closes, 14);
    const result = {
      sma20: this.sma(prices, 20),
      sma50: this.sma(prices, 50),
      ema20: this.ema(prices, 20),
      ema50: this.ema(prices, 50),
      rsi: this.rsi(prices, 14),
      atr: this.atr(highs, lows, closes, 14),
      adx: adxResult,
      roc: this.roc(prices, 10),
      volatility: this.volatility(prices, 20),
      currentPrice: prices[prices.length - 1],
      priceCount: prices.length
    };
    if (marketBuffer && marketBuffer.prices.length >= 20) {
      result.beta = this.beta(prices, marketBuffer.prices, 20);
      result.relativeStrength = this.relativeStrength(prices, marketBuffer.prices, 20);
    }
    return result;
  }
}

module.exports = new Indicators();
