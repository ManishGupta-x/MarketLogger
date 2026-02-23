const logger = require('../utils/logger');
const technicalIndicators = require('./technical-indicators.service');
const config = require('../config/adaptive-config');

/**
 * Adaptive Entry Service
 * Evaluates entry conditions based on market regime and technical indicators
 *
 * Entry Logic by Regime:
 * - BULLISH: Buy momentum stocks (RSI 50-70, price > EMA-20)
 * - BEARISH: Buy defensive stocks (RSI 40-60, low volatility, stable)
 * - SIDEWAYS: Mean reversion (RSI < 30 oversold, ADX < 25 range-bound)
 */
class AdaptiveEntryService {
  constructor() {
    this.isInitialized = false;
    this.lastEntryEvaluation = new Map(); // token -> timestamp
    this.config = null;
  }

  /**
   * Initialize the service
   */
  initialize() {
    this.config = config.entry || this.getDefaultConfig();
    this.isInitialized = true;
    logger.info('Adaptive Entry Service initialized');
    this.logConfig();
    return true;
  }

  /**
   * Get default config if not defined in adaptive-config.js
   */
  getDefaultConfig() {
    return {
      minCheckInterval: 5000,
      bullish: {
        rsiMin: 50,
        rsiMax: 70,
        requireAboveEma20: true,
        pullbackThreshold: 1.0,
        minScore: 60
      },
      bearish: {
        rsiMin: 40,
        rsiMax: 60,
        maxVolatility: 25,
        maxNegativeRoc: -2,
        emaProximity: 2.0,
        minScore: 60
      },
      sideways: {
        rsiOversold: 30,
        rsiNearOversold: 40,
        maxAdx: 25,
        supportLookback: 20,
        minScore: 50
      }
    };
  }

  /**
   * Log current configuration
   */
  logConfig() {
    const cfg = this.config;
    logger.info(`Entry config - BULLISH: RSI ${cfg.bullish.rsiMin}-${cfg.bullish.rsiMax}, above EMA-20`);
    logger.info(`Entry config - BEARISH: RSI ${cfg.bearish.rsiMin}-${cfg.bearish.rsiMax}, volatility < ${cfg.bearish.maxVolatility}%`);
    logger.info(`Entry config - SIDEWAYS: RSI < ${cfg.sideways.rsiOversold} (oversold), ADX < ${cfg.sideways.maxAdx}`);
  }

  /**
   * Main entry evaluation method
   * @param {string} token - Instrument token
   * @param {number} currentPrice - Current price
   * @param {string} regime - BULLISH, BEARISH, or SIDEWAYS
   * @returns {Object} { shouldEnter: boolean, score: number, reasons: [] }
   */
  evaluateEntry(token, currentPrice, regime) {
    if (!this.isInitialized) {
      return { shouldEnter: false, reason: 'NOT_INITIALIZED' };
    }

    // Rate limit checks per token
    const lastCheck = this.lastEntryEvaluation.get(token);
    if (lastCheck && (Date.now() - lastCheck) < this.config.minCheckInterval) {
      return { shouldEnter: false, reason: 'RATE_LIMITED' };
    }
    this.lastEntryEvaluation.set(token, Date.now());

    // Get indicators for this stock
    const indicators = this.getIndicators(token, currentPrice);
    if (!indicators) {
      return { shouldEnter: false, reason: 'INSUFFICIENT_DATA' };
    }

    // Evaluate based on current regime
    switch (regime) {
      case 'BULLISH':
        return this.evaluateBullishEntry(token, currentPrice, indicators);
      case 'BEARISH':
        return this.evaluateBearishEntry(token, currentPrice, indicators);
      case 'SIDEWAYS':
        return this.evaluateSidewaysEntry(token, currentPrice, indicators);
      default:
        return { shouldEnter: false, reason: 'UNKNOWN_REGIME' };
    }
  }

  /**
   * Evaluate entry for BULLISH regime
   * Goal: Buy momentum stocks in uptrend
   * Conditions: RSI 50-70, price > EMA-20, pullback bonus
   */
  evaluateBullishEntry(token, currentPrice, indicators) {
    const cfg = this.config.bullish;
    let score = 0;
    const reasons = [];

    // RSI in momentum zone (50-70) - 40 points
    if (indicators.rsi !== null) {
      if (indicators.rsi >= cfg.rsiMin && indicators.rsi <= cfg.rsiMax) {
        score += 40;
        reasons.push(`RSI ${indicators.rsi.toFixed(1)} in momentum zone`);
      } else if (indicators.rsi > cfg.rsiMax) {
        // Overbought - skip entry
        reasons.push(`RSI ${indicators.rsi.toFixed(1)} overbought`);
        return { shouldEnter: false, score: 0, reasons, indicators };
      } else {
        reasons.push(`RSI ${indicators.rsi.toFixed(1)} below momentum zone`);
      }
    }

    // Price above EMA-20 - 30 points
    if (indicators.ema20 !== null) {
      if (currentPrice > indicators.ema20) {
        score += 30;
        reasons.push(`Price > EMA20 (${indicators.ema20.toFixed(2)})`);
      } else if (cfg.requireAboveEma20) {
        // Required but not met - skip entry
        reasons.push(`Price below EMA20`);
        return { shouldEnter: false, score: 0, reasons, indicators };
      }
    }

    // EMA-20 > EMA-50 (uptrend confirmation) - 20 points
    if (indicators.ema20 !== null && indicators.ema50 !== null) {
      if (indicators.ema20 > indicators.ema50) {
        score += 20;
        reasons.push('EMA20 > EMA50 (uptrend)');
      }
    }

    // Pullback to EMA-20 (buying the dip) - 10 bonus points
    if (indicators.ema20 !== null) {
      if (this.isNearValue(currentPrice, indicators.ema20, cfg.pullbackThreshold)) {
        score += 10;
        reasons.push('Near EMA20 (pullback entry)');
      }
    }

    return {
      shouldEnter: score >= cfg.minScore,
      score,
      reasons,
      indicators
    };
  }

  /**
   * Evaluate entry for BEARISH regime
   * Goal: Buy defensive/stable stocks
   * Conditions: RSI 40-60, low volatility, stable ROC
   */
  evaluateBearishEntry(token, currentPrice, indicators) {
    const cfg = this.config.bearish;
    let score = 0;
    const reasons = [];

    // RSI in stable zone (40-60) - 35 points
    if (indicators.rsi !== null) {
      if (indicators.rsi >= cfg.rsiMin && indicators.rsi <= cfg.rsiMax) {
        score += 35;
        reasons.push(`RSI ${indicators.rsi.toFixed(1)} stable`);
      } else {
        reasons.push(`RSI ${indicators.rsi.toFixed(1)} outside stable zone`);
      }
    }

    // Low volatility - 25 points
    if (indicators.volatility !== null) {
      if (indicators.volatility < cfg.maxVolatility) {
        score += 25;
        reasons.push(`Volatility ${indicators.volatility.toFixed(1)}% (low)`);
      } else {
        reasons.push(`Volatility ${indicators.volatility.toFixed(1)}% (high)`);
      }
    }

    // Not declining rapidly (ROC > -2%) - 20 points
    if (indicators.roc !== null) {
      if (indicators.roc > cfg.maxNegativeRoc) {
        score += 20;
        reasons.push(`ROC ${indicators.roc.toFixed(2)}% (stable)`);
      } else {
        // Rapidly declining - skip entry (falling knife)
        reasons.push(`ROC ${indicators.roc.toFixed(2)}% (declining)`);
        return { shouldEnter: false, score: 0, reasons, indicators };
      }
    }

    // Near EMA support - 20 points
    if (indicators.ema20 !== null) {
      if (this.isNearValue(currentPrice, indicators.ema20, cfg.emaProximity)) {
        score += 20;
        reasons.push('Near EMA20 support');
      }
    }

    return {
      shouldEnter: score >= cfg.minScore,
      score,
      reasons,
      indicators
    };
  }

  /**
   * Evaluate entry for SIDEWAYS regime
   * Goal: Mean reversion on oversold stocks
   * Conditions: RSI < 30 (oversold), ADX < 25 (range-bound)
   */
  evaluateSidewaysEntry(token, currentPrice, indicators) {
    const cfg = this.config.sideways;
    let score = 0;
    const reasons = [];

    // RSI oversold (< 30) - primary signal - 50 points
    // Note: RSI 0 or 100 exactly indicates edge case data - skip
    if (indicators.rsi !== null && indicators.rsi > 0 && indicators.rsi < 100) {
      if (indicators.rsi < cfg.rsiOversold) {
        score += 50;
        reasons.push(`RSI ${indicators.rsi.toFixed(1)} oversold`);
      } else if (indicators.rsi < cfg.rsiNearOversold) {
        score += 25;
        reasons.push(`RSI ${indicators.rsi.toFixed(1)} near oversold`);
      } else {
        reasons.push(`RSI ${indicators.rsi.toFixed(1)} not oversold`);
      }
    } else if (indicators.rsi === 0 || indicators.rsi === 100) {
      reasons.push(`RSI ${indicators.rsi} (edge case, skipping)`);
      return { shouldEnter: false, score: 0, reasons, indicators };
    }

    // ADX confirms range-bound (< 25) - 25 points
    if (indicators.adx !== null) {
      if (indicators.adx < cfg.maxAdx) {
        score += 25;
        reasons.push(`ADX ${indicators.adx.toFixed(1)} (range-bound)`);
      } else {
        reasons.push(`ADX ${indicators.adx.toFixed(1)} (trending)`);
      }
    }

    // Near support level (20-period low) - 25 points
    if (indicators.support !== null) {
      if (this.isNearValue(currentPrice, indicators.support, 2.0)) {
        score += 25;
        reasons.push('Near support level');
      }
    }

    return {
      shouldEnter: score >= cfg.minScore,
      score,
      reasons,
      indicators
    };
  }

  /**
   * Get all indicators for a stock
   * @param {string} token - Instrument token
   * @param {number} currentPrice - Current price
   * @returns {Object|null} Indicators or null if insufficient data
   */
  getIndicators(token, currentPrice) {
    const buffer = technicalIndicators.getPriceBuffer(token);
    // Require at least 30 data points for reliable indicator calculations
    // (EMA-20 needs 20, RSI needs 15, but we want margin for accuracy)
    if (!buffer || buffer.prices.length < 30) {
      return null;
    }

    const prices = buffer.prices;
    const highs = buffer.highs;
    const lows = buffer.lows;
    const closes = buffer.closes;

    const adxResult = technicalIndicators.calculateADX(highs, lows, closes, 14);

    return {
      currentPrice,
      rsi: technicalIndicators.calculateRSI(prices, 14),
      ema20: technicalIndicators.calculateEMA(prices, 20),
      ema50: technicalIndicators.calculateEMA(prices, 50),
      adx: adxResult ? adxResult.adx : null,
      roc: technicalIndicators.calculateROC(prices, 10),
      volatility: technicalIndicators.calculateVolatility(prices, 20),
      support: prices.length >= 20 ? Math.min(...prices.slice(-20)) : null
    };
  }

  /**
   * Check if a value is near a target within threshold percent
   */
  isNearValue(price, target, thresholdPercent) {
    if (target === null || target === 0) return false;
    const diff = Math.abs((price - target) / target) * 100;
    return diff <= thresholdPercent;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      config: this.config,
      evaluationsTracked: this.lastEntryEvaluation.size
    };
  }

  /**
   * Reset evaluation tracking (for testing or EOD cleanup)
   */
  reset() {
    this.lastEntryEvaluation.clear();
    logger.info('Adaptive Entry Service reset');
  }
}

module.exports = new AdaptiveEntryService();
