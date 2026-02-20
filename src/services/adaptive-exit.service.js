const Decimal = require('decimal.js');
const logger = require('../utils/logger');
const technicalIndicators = require('./technical-indicators.service');
const config = require('../config/adaptive-config');

/**
 * Adaptive Exit Service
 * Intelligent exit logic with trailing stops and rapid decline detection
 *
 * Features:
 * 1. Trailing Stop - Let winners run by moving stop up as price rises
 * 2. Rapid Decline - Cut losers quickly on momentum breakdown
 * 3. Momentum Exhaustion - Exit when RSI indicates overbought
 * 4. Gap Handling - Adjust stops after market gap openings
 * 5. Slippage Awareness - Account for execution slippage
 */
class AdaptiveExitService {
  constructor() {
    this.isInitialized = false;

    // Position tracking: token -> position data
    this.positions = new Map();

    // Configuration
    this.config = config.exit;

    // Database reference
    this.database = null;

    // Gap handling configuration
    this.gapConfig = {
      threshold: parseFloat(process.env.GAP_THRESHOLD) || 1.0, // 1% gap is significant
      pauseDuration: parseInt(process.env.GAP_PAUSE_DURATION) || 120000, // 2 minutes pause after gap
      adjustStopPercent: parseFloat(process.env.GAP_STOP_ADJUST) || 0.5 // Widen stop by 0.5% after gap
    };

    // Market open tracking
    this.marketOpenTime = null;
    this.previousClose = new Map(); // token -> previous close price
    this.gapDetected = new Map(); // token -> { gapPercent, detectedAt }
    this.trailingStopPaused = new Map(); // token -> pause until timestamp

    // Slippage configuration
    this.slippageConfig = {
      baseSlippage: parseFloat(process.env.EXIT_SLIPPAGE) || 0.05, // 0.05% base slippage
      volatilityMultiplier: parseFloat(process.env.SLIPPAGE_VOLATILITY_MULT) || 1.5
    };
  }

  /**
   * Initialize the service
   */
  initialize() {
    this.isInitialized = true;
    logger.info('Adaptive Exit Service initialized');
    logger.info(`Trailing stop: activates at ${this.config.trailingStop.activation}%, trails by ${this.config.trailingStop.distance}%`);
    logger.info(`Rapid decline: ${this.config.rapidDecline.threshold}% in ${this.config.rapidDecline.window}ms`);
    logger.info(`Gap handling: ${this.gapConfig.threshold}% threshold, ${this.gapConfig.pauseDuration / 1000}s pause`);
    logger.info(`Exit slippage: ${this.slippageConfig.baseSlippage}%`);
    return true;
  }

  /**
   * Set previous close price for gap detection
   * Called before market opens with previous day's close prices
   * @param {string} token - Instrument token
   * @param {number} closePrice - Previous day's close price
   */
  setPreviousClose(token, closePrice) {
    this.previousClose.set(token, closePrice);
  }

  /**
   * Set market open time
   * @param {number} timestamp - Market open timestamp
   */
  setMarketOpen(timestamp = Date.now()) {
    this.marketOpenTime = timestamp;
    logger.info(`Market open time set: ${new Date(timestamp).toISOString()}`);
  }

  /**
   * Detect gap opening for a stock
   * @param {string} token - Instrument token
   * @param {number} openPrice - Today's opening price
   * @returns {Object|null} Gap info if detected
   */
  detectGap(token, openPrice) {
    const prevClose = this.previousClose.get(token);
    if (!prevClose) return null;

    const gapPercent = ((openPrice - prevClose) / prevClose) * 100;
    const absGap = Math.abs(gapPercent);

    if (absGap >= this.gapConfig.threshold) {
      const gapInfo = {
        token,
        previousClose: prevClose,
        openPrice,
        gapPercent,
        direction: gapPercent > 0 ? 'UP' : 'DOWN',
        detectedAt: Date.now()
      };

      this.gapDetected.set(token, gapInfo);

      // Pause trailing stops for this stock
      const pauseUntil = Date.now() + this.gapConfig.pauseDuration;
      this.trailingStopPaused.set(token, pauseUntil);

      logger.info(`Gap detected for ${token}: ${gapPercent.toFixed(2)}% ${gapInfo.direction} (prev: ${prevClose}, open: ${openPrice})`);
      logger.info(`Trailing stop paused until ${new Date(pauseUntil).toISOString()}`);

      return gapInfo;
    }

    return null;
  }

  /**
   * Check if trailing stop is paused for a position
   * @param {string} token - Instrument token
   * @returns {boolean} True if paused
   */
  isTrailingStopPaused(token) {
    const pauseUntil = this.trailingStopPaused.get(token);
    if (!pauseUntil) return false;

    if (Date.now() >= pauseUntil) {
      // Pause expired
      this.trailingStopPaused.delete(token);
      logger.debug(`Trailing stop resumed for ${token}`);
      return false;
    }

    return true;
  }

  /**
   * Apply slippage to exit price
   * @param {number} price - Target exit price
   * @param {Object} position - Position data
   * @returns {Object} Adjusted price with slippage
   */
  applyExitSlippage(price, position) {
    // Base slippage
    let slippagePercent = this.slippageConfig.baseSlippage;

    // Increase slippage during rapid decline (market stress)
    const buffer = technicalIndicators.getPriceBuffer(position.token);
    if (buffer && buffer.prices.length >= 10) {
      const recentPrices = buffer.prices.slice(-10);
      const volatility = this.calculateRecentVolatility(recentPrices);

      // High volatility = more slippage
      if (volatility > 2) { // More than 2% move in recent prices
        slippagePercent *= this.slippageConfig.volatilityMultiplier;
      }
    }

    // Cap slippage
    slippagePercent = Math.min(slippagePercent, 0.3);

    // For sells, slippage works against us (lower price)
    const adjustedPrice = price * (1 - slippagePercent / 100);
    const slippageAmount = price - adjustedPrice;

    return {
      originalPrice: price,
      adjustedPrice,
      slippagePercent,
      slippageAmount: slippageAmount * (position.qty || 1)
    };
  }

  /**
   * Calculate recent volatility from price array
   * @param {Array} prices - Recent prices
   * @returns {number} Volatility percentage
   */
  calculateRecentVolatility(prices) {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]) * 100);
    }

    return returns.reduce((a, b) => a + b, 0); // Sum of absolute returns
  }

  /**
   * Set database reference
   */
  setDatabase(database) {
    this.database = database;
  }

  /**
   * Track a new position entry
   * @param {string} token - Instrument token
   * @param {string} symbol - Stock symbol
   * @param {number} entryPrice - Entry price
   * @param {number} qty - Quantity
   */
  onPositionEntry(token, symbol, entryPrice, qty) {
    const now = Date.now();

    const position = {
      token,
      symbol,
      entryPrice,
      qty,
      entryTime: now,
      highestPrice: entryPrice,
      lowestPrice: entryPrice,
      currentPrice: entryPrice,
      trailingStopActive: false,
      trailingStopLevel: null,
      priceHistory: [{ price: entryPrice, time: now }],
      lastUpdate: now
    };

    this.positions.set(token, position);

    // Record to database if available
    if (this.database) {
      try {
        this.database.createPositionTracking({
          token,
          symbol,
          entryPrice,
          entryTime: new Date(now).toISOString(),
          highestPrice: entryPrice,
          lowestPrice: entryPrice
        });
      } catch (error) {
        logger.error('Failed to record position to database:', error);
      }
    }

    logger.debug(`Position tracking started: ${symbol} @ ${entryPrice}`);
  }

  /**
   * Update position with new price
   * @param {string} token - Instrument token
   * @param {number} currentPrice - Current price
   */
  updatePosition(token, currentPrice) {
    const position = this.positions.get(token);
    if (!position) return;

    const now = Date.now();

    // Update price tracking
    position.currentPrice = currentPrice;
    position.lastUpdate = now;

    // Update highest/lowest
    if (currentPrice > position.highestPrice) {
      position.highestPrice = currentPrice;
    }
    if (currentPrice < position.lowestPrice) {
      position.lowestPrice = currentPrice;
    }

    // Add to price history
    position.priceHistory.push({ price: currentPrice, time: now });

    // Trim price history
    while (position.priceHistory.length > config.position.maxPriceHistory) {
      position.priceHistory.shift();
    }

    // Update trailing stop level if active
    if (position.trailingStopActive) {
      const newTrailingStop = this.calculateTrailingStopLevel(position);
      if (newTrailingStop > position.trailingStopLevel) {
        position.trailingStopLevel = newTrailingStop;
        logger.debug(`Trailing stop updated for ${position.symbol}: ${newTrailingStop.toFixed(2)}`);
      }
    }

    this.positions.set(token, position);
  }

  /**
   * Calculate trailing stop level based on current position
   * @param {Object} position - Position data
   * @returns {number} Trailing stop level
   */
  calculateTrailingStopLevel(position) {
    const { trailingStop } = this.config;
    let trailDistance = trailingStop.distance;

    // Acceleration: tighten stop as profit grows
    if (trailingStop.accelerate) {
      const pnlPercent = ((position.highestPrice - position.entryPrice) / position.entryPrice) * 100;

      // Reduce trail distance by accelerationStep for each 1% gain
      const reduction = Math.floor(pnlPercent) * trailingStop.accelerationStep;
      trailDistance = Math.max(0.1, trailDistance - reduction); // Min 0.1%
    }

    return position.highestPrice * (1 - trailDistance / 100);
  }

  /**
   * Evaluate if position should exit
   * @param {string} token - Instrument token
   * @param {number} currentPrice - Current price
   * @returns {Object} Exit evaluation result
   */
  evaluateExit(token, currentPrice) {
    const position = this.positions.get(token);
    if (!position) {
      return { shouldExit: false, reason: 'NO_POSITION' };
    }

    // Update position first
    this.updatePosition(token, currentPrice);

    // Check trailing stop
    const trailingResult = this.checkTrailingStop(position, currentPrice);
    if (trailingResult.shouldExit) {
      return trailingResult;
    }

    // Check rapid decline
    const rapidResult = this.checkRapidDecline(position, currentPrice);
    if (rapidResult.shouldExit) {
      return rapidResult;
    }

    // Check momentum exhaustion
    const momentumResult = this.checkMomentumExhaustion(position, currentPrice);
    if (momentumResult.shouldExit) {
      return momentumResult;
    }

    // Check backstop stop loss
    const backstopResult = this.checkBackstopStopLoss(position, currentPrice);
    if (backstopResult.shouldExit) {
      return backstopResult;
    }

    return { shouldExit: false };
  }

  /**
   * Check trailing stop condition
   * @param {Object} position - Position data
   * @param {number} currentPrice - Current price
   * @returns {Object} Exit evaluation
   */
  checkTrailingStop(position, currentPrice) {
    const { trailingStop } = this.config;
    const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

    // Check if trailing stop is paused due to gap
    const isPaused = this.isTrailingStopPaused(position.token);

    // Activate trailing stop if gain exceeds activation threshold
    if (!position.trailingStopActive && pnlPercent >= trailingStop.activation) {
      position.trailingStopActive = true;
      position.trailingStopLevel = this.calculateTrailingStopLevel(position);

      // Widen stop if gap was detected for this stock
      const gapInfo = this.gapDetected.get(position.token);
      if (gapInfo) {
        const widening = position.trailingStopLevel * (this.gapConfig.adjustStopPercent / 100);
        position.trailingStopLevel -= widening;
        position.gapAdjusted = true;
        logger.info(`Trailing stop widened for ${position.symbol} due to gap: ${position.trailingStopLevel.toFixed(2)}`);
      }

      this.positions.set(position.token, position);
      logger.info(`Trailing stop activated for ${position.symbol}: ${position.trailingStopLevel.toFixed(2)} (${pnlPercent.toFixed(2)}% gain)`);
    }

    // Don't trigger trailing stop if paused
    if (isPaused) {
      return { shouldExit: false, paused: true, reason: 'GAP_PAUSE' };
    }

    // Check if price hit trailing stop
    if (position.trailingStopActive && currentPrice <= position.trailingStopLevel) {
      const exitPnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

      // Apply slippage to get realistic exit price
      const slippage = this.applyExitSlippage(currentPrice, position);

      return {
        shouldExit: true,
        reason: 'TRAILING_STOP',
        exitPrice: slippage.adjustedPrice,
        originalPrice: currentPrice,
        slippage: slippage.slippageAmount,
        details: {
          entryPrice: position.entryPrice,
          highestPrice: position.highestPrice,
          trailingStopLevel: position.trailingStopLevel,
          pnlPercent: exitPnlPercent,
          peakGain: ((position.highestPrice - position.entryPrice) / position.entryPrice) * 100,
          gapAdjusted: position.gapAdjusted || false
        }
      };
    }

    return { shouldExit: false };
  }

  /**
   * Check rapid decline condition
   * @param {Object} position - Position data
   * @param {number} currentPrice - Current price
   * @returns {Object} Exit evaluation
   */
  checkRapidDecline(position, currentPrice) {
    const { rapidDecline } = this.config;
    const now = Date.now();

    // Get recent prices within the window
    const recentPrices = position.priceHistory.filter(
      p => (now - p.time) < rapidDecline.window
    );

    // Need minimum data points
    if (recentPrices.length < rapidDecline.minDataPoints) {
      return { shouldExit: false };
    }

    // Find max price in window
    const maxPriceInWindow = Math.max(...recentPrices.map(p => p.price));

    // Calculate drop percentage
    const dropPercent = ((maxPriceInWindow - currentPrice) / maxPriceInWindow) * 100;

    if (dropPercent >= rapidDecline.threshold) {
      const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

      // Apply slippage (likely higher during rapid decline)
      const slippage = this.applyExitSlippage(currentPrice, position);

      return {
        shouldExit: true,
        reason: 'RAPID_DECLINE',
        exitPrice: slippage.adjustedPrice,
        originalPrice: currentPrice,
        slippage: slippage.slippageAmount,
        details: {
          entryPrice: position.entryPrice,
          maxPriceInWindow,
          dropPercent,
          windowMs: rapidDecline.window,
          pnlPercent
        }
      };
    }

    return { shouldExit: false };
  }

  /**
   * Check momentum exhaustion condition
   * @param {Object} position - Position data
   * @param {number} currentPrice - Current price
   * @returns {Object} Exit evaluation
   */
  checkMomentumExhaustion(position, currentPrice) {
    const { momentumExit } = this.config;

    if (!momentumExit.enabled) {
      return { shouldExit: false };
    }

    // Get RSI from technical indicators
    const buffer = technicalIndicators.getPriceBuffer(position.token);
    if (!buffer || buffer.prices.length < 15) {
      return { shouldExit: false };
    }

    const rsi = technicalIndicators.calculateRSI(buffer.prices, 14);

    if (rsi !== null && rsi > momentumExit.rsiThreshold) {
      const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

      // Only exit on momentum exhaustion if we're in profit
      if (pnlPercent > 0) {
        const slippage = this.applyExitSlippage(currentPrice, position);

        return {
          shouldExit: true,
          reason: 'MOMENTUM_EXHAUSTION',
          exitPrice: slippage.adjustedPrice,
          originalPrice: currentPrice,
          slippage: slippage.slippageAmount,
          details: {
            entryPrice: position.entryPrice,
            rsi,
            rsiThreshold: momentumExit.rsiThreshold,
            pnlPercent
          }
        };
      }
    }

    return { shouldExit: false };
  }

  /**
   * Check backstop stop loss (hard limit)
   * @param {Object} position - Position data
   * @param {number} currentPrice - Current price
   * @returns {Object} Exit evaluation
   */
  checkBackstopStopLoss(position, currentPrice) {
    const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

    if (pnlPercent <= -this.config.backstopStopLoss) {
      const slippage = this.applyExitSlippage(currentPrice, position);

      return {
        shouldExit: true,
        reason: 'BACKSTOP_STOPLOSS',
        exitPrice: slippage.adjustedPrice,
        originalPrice: currentPrice,
        slippage: slippage.slippageAmount,
        details: {
          entryPrice: position.entryPrice,
          stopLossPercent: this.config.backstopStopLoss,
          pnlPercent
        }
      };
    }

    return { shouldExit: false };
  }

  /**
   * Get gap detection status
   * @returns {Object} Gap info
   */
  getGapStatus() {
    const gaps = [];
    for (const [token, gapInfo] of this.gapDetected.entries()) {
      const pausedUntil = this.trailingStopPaused.get(token);
      gaps.push({
        ...gapInfo,
        pausedUntil,
        stillPaused: pausedUntil ? Date.now() < pausedUntil : false
      });
    }
    return {
      marketOpenTime: this.marketOpenTime,
      gapsDetected: gaps.length,
      gaps
    };
  }

  /**
   * Clear gap data (call at end of day)
   */
  clearGapData() {
    this.gapDetected.clear();
    this.trailingStopPaused.clear();
    this.previousClose.clear();
    logger.info('Gap data cleared');
  }

  /**
   * Close position tracking
   * @param {string} token - Instrument token
   * @param {number} exitPrice - Exit price
   * @param {string} exitReason - Reason for exit
   */
  closePosition(token, exitPrice, exitReason) {
    const position = this.positions.get(token);
    if (!position) return;

    const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;

    // Record to database if available
    if (this.database) {
      try {
        this.database.closePositionTracking(token, {
          exitPrice,
          exitTime: new Date().toISOString(),
          exitReason,
          pnlPercent,
          highestPrice: position.highestPrice,
          lowestPrice: position.lowestPrice
        });
      } catch (error) {
        logger.error('Failed to record position close to database:', error);
      }
    }

    logger.info(`Position closed: ${position.symbol} @ ${exitPrice} (${exitReason}, P&L: ${pnlPercent.toFixed(2)}%)`);

    // Remove from tracking
    this.positions.delete(token);
  }

  /**
   * Get position info
   * @param {string} token - Instrument token
   * @returns {Object|null} Position data
   */
  getPosition(token) {
    return this.positions.get(token) || null;
  }

  /**
   * Get all positions
   * @returns {Array} All tracked positions
   */
  getAllPositions() {
    const positions = [];
    for (const [token, position] of this.positions.entries()) {
      const pnlPercent = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
      positions.push({
        token,
        symbol: position.symbol,
        entryPrice: position.entryPrice,
        currentPrice: position.currentPrice,
        highestPrice: position.highestPrice,
        pnlPercent,
        trailingStopActive: position.trailingStopActive,
        trailingStopLevel: position.trailingStopLevel,
        holdingTime: Date.now() - position.entryTime
      });
    }
    return positions;
  }

  /**
   * Get service status
   * @returns {Object} Status info
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      trackedPositions: this.positions.size,
      config: {
        trailingStop: this.config.trailingStop,
        rapidDecline: this.config.rapidDecline,
        momentumExit: this.config.momentumExit,
        backstopStopLoss: this.config.backstopStopLoss
      }
    };
  }

  /**
   * Reset all position tracking
   */
  reset() {
    this.positions.clear();
    logger.info('Adaptive Exit Service reset - all position tracking cleared');
  }
}

module.exports = new AdaptiveExitService();
