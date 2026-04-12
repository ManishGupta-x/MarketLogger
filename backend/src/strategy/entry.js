const logger = require('../../utils/logger');
const indicators = require('../indicators');
const config = require('../../config');

/**
 * Entry signal evaluation per market regime.
 *
 * BULLISH  : RSI 50-70, price > EMA20, EMA20 > EMA50
 * BEARISH  : RSI 40-60, low volatility, stable ROC, near EMA20 support
 * SIDEWAYS : RSI < 30 (oversold), ADX < 25, near 20-period support
 */
class Entry {
  constructor() {
    this.initialized = false;
    this.lastChecked = new Map(); // token -> timestamp
    this.cfg = config.entry;
  }

  initialize() {
    this.initialized = true;
    logger.info('Entry service initialized');
    return true;
  }

  evaluate(token, currentPrice, regime) {
    if (!this.initialized) return { shouldEnter: false, reason: 'NOT_INITIALIZED' };

    // Rate-limit per token
    const last = this.lastChecked.get(token);
    if (last && (Date.now() - last) < this.cfg.minCheckInterval) {
      return { shouldEnter: false, reason: 'RATE_LIMITED' };
    }
    this.lastChecked.set(token, Date.now());

    const ind = this._indicators(token, currentPrice);
    if (!ind) return { shouldEnter: false, reason: 'INSUFFICIENT_DATA' };

    switch (regime) {
      case 'BULLISH':  return this._bullish(currentPrice, ind);
      case 'BEARISH':  return this._bearish(currentPrice, ind);
      case 'SIDEWAYS': return this._sideways(currentPrice, ind);
      default:         return { shouldEnter: false, reason: 'UNKNOWN_REGIME' };
    }
  }

  _indicators(token, currentPrice) {
    const b = indicators.getBuffer(token);
    if (!b || b.prices.length < 30) return null;
    const { prices, highs, lows, closes } = b;
    const adxR = indicators.adx(highs, lows, closes, 14);
    return {
      currentPrice,
      rsi:        indicators.rsi(prices, 14),
      ema20:      indicators.ema(prices, 20),
      ema50:      indicators.ema(prices, 50),
      adx:        adxR?.adx ?? null,
      roc:        indicators.roc(prices, 10),
      volatility: indicators.volatility(prices, 20),
      support:    prices.length >= 20 ? Math.min(...prices.slice(-20)) : null
    };
  }

  _bullish(price, ind) {
    const cfg = this.cfg.bullish;
    let score = 0;
    const reasons = [];

    // RSI 50-70 → 40 pts
    if (ind.rsi !== null && ind.rsi > 0 && ind.rsi < 100) {
      if (ind.rsi >= cfg.rsiMin && ind.rsi <= cfg.rsiMax) {
        score += 40; reasons.push(`RSI ${ind.rsi.toFixed(1)} in momentum zone`);
      } else if (ind.rsi > cfg.rsiMax) {
        reasons.push(`RSI ${ind.rsi.toFixed(1)} overbought`);
        return { shouldEnter: false, score: 0, reasons, indicators: ind };
      } else {
        reasons.push(`RSI ${ind.rsi.toFixed(1)} below zone`);
      }
    } else if (ind.rsi === 0 || ind.rsi === 100) {
      return { shouldEnter: false, score: 0, reasons: [`RSI edge case (${ind.rsi})`], indicators: ind };
    }

    // Price > EMA20 → 30 pts
    if (ind.ema20 !== null) {
      if (price > ind.ema20)                      { score += 30; reasons.push(`Price > EMA20 (${ind.ema20.toFixed(2)})`); }
      else if (cfg.requireAboveEma20)              { reasons.push('Price below EMA20 (required)'); return { shouldEnter: false, score: 0, reasons, indicators: ind }; }
    }

    // EMA20 > EMA50 → 20 pts
    if (ind.ema20 && ind.ema50 && ind.ema20 > ind.ema50) { score += 20; reasons.push('EMA20 > EMA50 (uptrend)'); }

    // Pullback to EMA20 → 10 pts bonus
    if (ind.ema20 && this._near(price, ind.ema20, cfg.pullbackThreshold)) { score += 10; reasons.push('Near EMA20 (pullback)'); }

    return { shouldEnter: score >= cfg.minScore, score, reasons, indicators: ind };
  }

  _bearish(price, ind) {
    const cfg = this.cfg.bearish;
    let score = 0;
    const reasons = [];

    if (ind.rsi !== null && ind.rsi > 0 && ind.rsi < 100) {
      if (ind.rsi >= cfg.rsiMin && ind.rsi <= cfg.rsiMax) { score += 35; reasons.push(`RSI ${ind.rsi.toFixed(1)} stable`); }
      else reasons.push(`RSI ${ind.rsi.toFixed(1)} outside stable zone`);
    } else if (ind.rsi === 0 || ind.rsi === 100) {
      return { shouldEnter: false, score: 0, reasons: [`RSI edge case (${ind.rsi})`], indicators: ind };
    }

    if (ind.volatility !== null) {
      if (ind.volatility < cfg.maxVolatility) { score += 25; reasons.push(`Volatility ${ind.volatility.toFixed(1)}% (low)`); }
      else reasons.push(`Volatility ${ind.volatility.toFixed(1)}% (high)`);
    }

    if (ind.roc !== null) {
      if (ind.roc > cfg.maxNegativeRoc) { score += 20; reasons.push(`ROC ${ind.roc.toFixed(2)}% stable`); }
      else { reasons.push(`ROC ${ind.roc.toFixed(2)}% declining`); return { shouldEnter: false, score: 0, reasons, indicators: ind }; }
    }

    if (ind.ema20 !== null && this._near(price, ind.ema20, cfg.emaProximity)) { score += 20; reasons.push('Near EMA20 support'); }

    return { shouldEnter: score >= cfg.minScore, score, reasons, indicators: ind };
  }

  _sideways(price, ind) {
    const cfg = this.cfg.sideways;
    let score = 0;
    const reasons = [];

    if (ind.rsi !== null && ind.rsi > 0 && ind.rsi < 100) {
      if (ind.rsi < cfg.rsiOversold)           { score += 50; reasons.push(`RSI ${ind.rsi.toFixed(1)} oversold`); }
      else if (ind.rsi < cfg.rsiNearOversold)  { score += 25; reasons.push(`RSI ${ind.rsi.toFixed(1)} near oversold`); }
      else reasons.push(`RSI ${ind.rsi.toFixed(1)} not oversold`);
    } else if (ind.rsi === 0 || ind.rsi === 100) {
      return { shouldEnter: false, score: 0, reasons: [`RSI edge case (${ind.rsi})`], indicators: ind };
    }

    if (ind.adx !== null) {
      if (ind.adx < cfg.maxAdx) { score += 25; reasons.push(`ADX ${ind.adx.toFixed(1)} range-bound`); }
      else reasons.push(`ADX ${ind.adx.toFixed(1)} trending`);
    }

    if (ind.support !== null && this._near(price, ind.support, 2.0)) { score += 25; reasons.push('Near 20-period support'); }

    return { shouldEnter: score >= cfg.minScore, score, reasons, indicators: ind };
  }

  _near(price, target, pct) {
    if (!target || target === 0) return false;
    return Math.abs((price - target) / target) * 100 <= pct;
  }

  reset() { this.lastChecked.clear(); }

  getStatus() {
    return { initialized: this.initialized, tracked: this.lastChecked.size };
  }
}

module.exports = new Entry();
