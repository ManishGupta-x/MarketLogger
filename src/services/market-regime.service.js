const logger = require('../utils/logger');
const technicalIndicators = require('./technical-indicators.service');
const config = require('../config/adaptive-config');

/**
 * Market Regime Detection Service
 * Detects whether the market is BULLISH, BEARISH, or SIDEWAYS
 * Uses combined NIFTY 50 (60%) and NIFTY Bank (40%) signals
 */
class MarketRegimeService {
  constructor() {
    this.isInitialized = false;
    this.currentRegime = 'SIDEWAYS';
    this.regimeConfidence = 0;
    this.lastRegimeChange = null;
    this.regimeHistory = [];
    this.maxHistorySize = 100;

    // Manual override
    this.manualOverride = null;
    this.manualOverrideExpiry = null;

    // Index tokens
    this.nifty50Token = config.regime.nifty50Token.toString();
    this.niftyBankToken = config.regime.niftyBankToken.toString();

    // Latest index prices
    this.nifty50Price = null;
    this.niftyBankPrice = null;

    // Hysteresis tracking
    this.lastRegimeChangeTime = 0;

    // Database reference (set externally)
    this.database = null;
  }

  /**
   * Initialize the service
   */
  initialize() {
    this.isInitialized = true;
    this.lastRegimeChangeTime = Date.now();
    logger.info('Market Regime Service initialized');
    logger.info(`Monitoring NIFTY 50 (token: ${this.nifty50Token}) and NIFTY Bank (token: ${this.niftyBankToken})`);
    return true;
  }

  /**
   * Set database reference
   */
  setDatabase(database) {
    this.database = database;
  }

  /**
   * Process incoming ticks and update index price buffers
   * @param {Array} ticks - Array of tick data
   */
  processTicks(ticks) {
    if (!this.isInitialized) return;

    ticks.forEach(tick => {
      const token = tick.instrument_token.toString();

      // Update price buffers for indices
      if (token === this.nifty50Token || token === this.niftyBankToken) {
        technicalIndicators.updatePriceBuffer(token, tick);

        if (token === this.nifty50Token) {
          this.nifty50Price = tick.last_price;
        } else {
          this.niftyBankPrice = tick.last_price;
        }
      }
    });
  }

  /**
   * Calculate regime signal for a single index
   * @param {string} token - Index token
   * @returns {Object} Signal data { bullishScore, bearishScore, signals }
   */
  calculateIndexSignal(token) {
    const buffer = technicalIndicators.getPriceBuffer(token);
    if (!buffer || buffer.prices.length < config.regime.emaLong) {
      return { bullishScore: 0, bearishScore: 0, signals: [], ready: false };
    }

    const prices = buffer.prices;
    const highs = buffer.highs;
    const lows = buffer.lows;
    const closes = buffer.closes;
    const currentPrice = prices[prices.length - 1];

    // Calculate indicators
    const ema20 = technicalIndicators.calculateEMA(prices, config.regime.emaShort);
    const ema50 = technicalIndicators.calculateEMA(prices, config.regime.emaLong);
    const rsi = technicalIndicators.calculateRSI(prices, config.regime.rsiPeriod);
    const adxData = technicalIndicators.calculateADX(highs, lows, closes, config.regime.adxPeriod);

    let bullishScore = 0;
    let bearishScore = 0;
    const signals = [];

    // Trend Signal (40% weight)
    if (ema20 && ema50) {
      if (currentPrice > ema20 && ema20 > ema50) {
        bullishScore += 40;
        signals.push({ type: 'TREND', direction: 'BULLISH', detail: 'Price > EMA20 > EMA50' });
      } else if (currentPrice < ema20 && ema20 < ema50) {
        bearishScore += 40;
        signals.push({ type: 'TREND', direction: 'BEARISH', detail: 'Price < EMA20 < EMA50' });
      } else {
        signals.push({ type: 'TREND', direction: 'NEUTRAL', detail: 'Mixed trend signals' });
      }
    }

    // ADX Signal (30% weight)
    if (adxData) {
      const { adx, plusDI, minusDI } = adxData;
      if (adx > config.regime.adxThreshold) {
        // Strong trend
        if (plusDI > minusDI) {
          bullishScore += 30;
          signals.push({ type: 'ADX', direction: 'BULLISH', detail: `ADX=${adx.toFixed(1)}, +DI>${-minusDI}` });
        } else {
          bearishScore += 30;
          signals.push({ type: 'ADX', direction: 'BEARISH', detail: `ADX=${adx.toFixed(1)}, -DI>+DI` });
        }
      } else {
        signals.push({ type: 'ADX', direction: 'NEUTRAL', detail: `ADX=${adx.toFixed(1)} (weak trend)` });
      }
    }

    // RSI Signal (30% weight)
    if (rsi !== null) {
      if (rsi > config.regime.rsiBullish) {
        bullishScore += 30;
        signals.push({ type: 'RSI', direction: 'BULLISH', detail: `RSI=${rsi.toFixed(1)}` });
      } else if (rsi < config.regime.rsiBearish) {
        bearishScore += 30;
        signals.push({ type: 'RSI', direction: 'BEARISH', detail: `RSI=${rsi.toFixed(1)}` });
      } else {
        signals.push({ type: 'RSI', direction: 'NEUTRAL', detail: `RSI=${rsi.toFixed(1)}` });
      }
    }

    return {
      bullishScore,
      bearishScore,
      signals,
      ready: true,
      indicators: { ema20, ema50, rsi, adx: adxData?.adx, currentPrice }
    };
  }

  /**
   * Detect current market regime
   * Uses weighted combination of NIFTY 50 and NIFTY Bank
   * @returns {Object} Regime detection result
   */
  detectRegime() {
    // Check for manual override
    if (this.manualOverride && (!this.manualOverrideExpiry || Date.now() < this.manualOverrideExpiry)) {
      return {
        regime: this.manualOverride,
        confidence: 100,
        source: 'manual_override',
        signals: []
      };
    }

    // Get signals from both indices
    const nifty50Signal = this.calculateIndexSignal(this.nifty50Token);
    const niftyBankSignal = this.calculateIndexSignal(this.niftyBankToken);

    // Check if we have enough data
    if (!nifty50Signal.ready && !niftyBankSignal.ready) {
      return {
        regime: this.currentRegime,
        confidence: 0,
        source: 'insufficient_data',
        signals: []
      };
    }

    // Calculate weighted scores
    const nifty50Weight = config.regime.nifty50Weight / 100;
    const niftyBankWeight = config.regime.niftyBankWeight / 100;

    let totalBullish = 0;
    let totalBearish = 0;
    let totalWeight = 0;

    if (nifty50Signal.ready) {
      totalBullish += nifty50Signal.bullishScore * nifty50Weight;
      totalBearish += nifty50Signal.bearishScore * nifty50Weight;
      totalWeight += nifty50Weight;
    }

    if (niftyBankSignal.ready) {
      totalBullish += niftyBankSignal.bullishScore * niftyBankWeight;
      totalBearish += niftyBankSignal.bearishScore * niftyBankWeight;
      totalWeight += niftyBankWeight;
    }

    // Normalize scores
    if (totalWeight > 0) {
      totalBullish = totalBullish / totalWeight;
      totalBearish = totalBearish / totalWeight;
    }

    // Determine regime
    let newRegime = 'SIDEWAYS';
    let confidence = 0;

    if (totalBullish >= config.regime.bullishThreshold) {
      newRegime = 'BULLISH';
      confidence = Math.min(100, totalBullish);
    } else if (totalBearish >= config.regime.bearishThreshold) {
      newRegime = 'BEARISH';
      confidence = Math.min(100, totalBearish);
    } else {
      // Sideways - confidence based on how far from thresholds
      const maxScore = Math.max(totalBullish, totalBearish);
      confidence = Math.max(0, 100 - maxScore);
    }

    // Combine signals
    const allSignals = [
      ...nifty50Signal.signals.map(s => ({ ...s, index: 'NIFTY50' })),
      ...niftyBankSignal.signals.map(s => ({ ...s, index: 'NIFTYBANK' }))
    ];

    return {
      regime: newRegime,
      confidence,
      source: 'calculated',
      signals: allSignals,
      scores: { bullish: totalBullish, bearish: totalBearish },
      indicators: {
        nifty50: nifty50Signal.indicators,
        niftyBank: niftyBankSignal.indicators
      }
    };
  }

  /**
   * Update regime (call this periodically)
   * Applies hysteresis to prevent flip-flopping
   * @returns {Object|null} Regime change info if changed, null otherwise
   */
  updateRegime() {
    const detection = this.detectRegime();
    const now = Date.now();

    // Check hysteresis period
    const timeSinceLastChange = now - this.lastRegimeChangeTime;
    const canChange = timeSinceLastChange >= config.regime.hysteresisPeriod;

    // Only change regime if hysteresis period has passed
    if (detection.regime !== this.currentRegime && canChange && detection.source === 'calculated') {
      const previousRegime = this.currentRegime;

      this.currentRegime = detection.regime;
      this.regimeConfidence = detection.confidence;
      this.lastRegimeChange = now;
      this.lastRegimeChangeTime = now;

      // Record in history
      const historyEntry = {
        timestamp: now,
        previousRegime,
        newRegime: detection.regime,
        confidence: detection.confidence,
        signals: detection.signals,
        nifty50Price: this.nifty50Price,
        niftyBankPrice: this.niftyBankPrice
      };

      this.regimeHistory.unshift(historyEntry);
      if (this.regimeHistory.length > this.maxHistorySize) {
        this.regimeHistory.pop();
      }

      // Log to database if available
      if (this.database) {
        try {
          this.database.recordRegimeChange(historyEntry);
        } catch (error) {
          logger.error('Failed to record regime change to database:', error);
        }
      }

      logger.info(`Market regime changed: ${previousRegime} -> ${detection.regime} (confidence: ${detection.confidence.toFixed(1)}%)`);

      return {
        changed: true,
        previousRegime,
        newRegime: detection.regime,
        confidence: detection.confidence,
        signals: detection.signals
      };
    }

    // Update confidence even if regime hasn't changed
    this.regimeConfidence = detection.confidence;

    return {
      changed: false,
      regime: this.currentRegime,
      confidence: detection.confidence,
      signals: detection.signals
    };
  }

  /**
   * Set manual regime override
   * @param {string} regime - BULLISH, BEARISH, or SIDEWAYS
   * @param {number} durationMs - Duration in ms (null for indefinite)
   */
  setManualRegime(regime, durationMs = null) {
    const validRegimes = ['BULLISH', 'BEARISH', 'SIDEWAYS'];
    if (!validRegimes.includes(regime)) {
      throw new Error(`Invalid regime: ${regime}. Must be one of: ${validRegimes.join(', ')}`);
    }

    this.manualOverride = regime;
    this.manualOverrideExpiry = durationMs ? Date.now() + durationMs : null;

    const previousRegime = this.currentRegime;
    this.currentRegime = regime;
    this.regimeConfidence = 100;
    this.lastRegimeChangeTime = Date.now();

    logger.info(`Manual regime override set: ${regime} (duration: ${durationMs ? `${durationMs / 1000}s` : 'indefinite'})`);

    return { previousRegime, newRegime: regime };
  }

  /**
   * Clear manual regime override
   */
  clearManualOverride() {
    if (this.manualOverride) {
      logger.info(`Manual regime override cleared (was: ${this.manualOverride})`);
      this.manualOverride = null;
      this.manualOverrideExpiry = null;

      // Immediately recalculate regime
      this.lastRegimeChangeTime = 0; // Allow immediate change
      return this.updateRegime();
    }
    return null;
  }

  /**
   * Get current regime
   * @returns {Object} Current regime info
   */
  getRegime() {
    return {
      regime: this.currentRegime,
      confidence: this.regimeConfidence,
      lastChange: this.lastRegimeChange,
      isManualOverride: !!this.manualOverride,
      nifty50Price: this.nifty50Price,
      niftyBankPrice: this.niftyBankPrice
    };
  }

  /**
   * Get regime history
   * @param {number} count - Number of entries to return
   * @returns {Array} Regime history
   */
  getRegimeHistory(count = 20) {
    return this.regimeHistory.slice(0, count);
  }

  /**
   * Get required index tokens for WebSocket subscription
   * @returns {Array} Array of index tokens
   */
  getRequiredTokens() {
    return [
      parseInt(this.nifty50Token),
      parseInt(this.niftyBankToken)
    ];
  }

  /**
   * Check if indices have enough data for regime detection
   * @returns {Object} Data readiness status
   */
  getDataStatus() {
    const nifty50Buffer = technicalIndicators.getPriceBuffer(this.nifty50Token);
    const niftyBankBuffer = technicalIndicators.getPriceBuffer(this.niftyBankToken);

    return {
      nifty50: {
        dataPoints: nifty50Buffer?.prices.length || 0,
        required: config.regime.emaLong,
        ready: (nifty50Buffer?.prices.length || 0) >= config.regime.emaLong
      },
      niftyBank: {
        dataPoints: niftyBankBuffer?.prices.length || 0,
        required: config.regime.emaLong,
        ready: (niftyBankBuffer?.prices.length || 0) >= config.regime.emaLong
      }
    };
  }
}

module.exports = new MarketRegimeService();
