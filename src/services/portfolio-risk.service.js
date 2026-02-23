const Decimal = require('decimal.js');
const logger = require('../utils/logger');

/**
 * Portfolio Risk Management Service
 * Monitors total portfolio drawdown and enforces risk limits
 *
 * Features:
 * 1. Daily Drawdown Limit - Stop trading if portfolio drops X% in a day
 * 2. Portfolio Heat Monitor - Track total exposure
 * 3. Risk-adjusted position sizing
 */
class PortfolioRiskService {
  constructor() {
    this.isInitialized = false;

    // Configuration
    this.maxDailyDrawdown = parseFloat(process.env.MAX_DAILY_DRAWDOWN) || 3.0; // 3% default
    this.maxPortfolioHeat = parseFloat(process.env.MAX_PORTFOLIO_HEAT) || 80; // 80% invested max
    this.cooldownPeriodMs = parseInt(process.env.DRAWDOWN_COOLDOWN) || 3600000; // 1 hour cooldown

    // State tracking
    this.dayStartValue = 0;
    this.currentValue = 0;
    this.highWaterMark = 0;
    this.lowWaterMark = 0;
    this.dailyPnL = 0;
    this.dailyPnLPercent = 0;
    this.currentDrawdown = 0;
    this.maxDrawdownHit = 0;

    // Trading halt state
    this.tradingHalted = false;
    this.haltReason = null;
    this.haltTime = null;
    this.haltedAt = null;

    // Session tracking
    this.sessionDate = null;
    this.realizedPnLToday = 0;
    this.unrealizedPnL = 0;

    // Database reference
    this.database = null;

    // Paper trading reference
    this.paperTradingService = null;
  }

  /**
   * Initialize the service
   * @param {Object} paperTradingService - Reference to paper trading service
   */
  initialize(paperTradingService) {
    this.paperTradingService = paperTradingService;

    // Get current portfolio state
    const portfolio = paperTradingService.getPortfolio();
    this.dayStartValue = portfolio.totalValue;
    this.currentValue = portfolio.totalValue;
    this.highWaterMark = portfolio.totalValue;
    this.lowWaterMark = portfolio.totalValue;

    // Set session date
    this.sessionDate = new Date().toISOString().split('T')[0];

    this.isInitialized = true;

    logger.info(`Portfolio Risk Service initialized`);
    logger.info(`Max daily drawdown: ${this.maxDailyDrawdown}%`);
    logger.info(`Max portfolio heat: ${this.maxPortfolioHeat}%`);
    logger.info(`Starting portfolio value: ${this.dayStartValue.toFixed(2)}`);

    return true;
  }

  /**
   * Set database reference
   */
  setDatabase(database) {
    this.database = database;
  }

  /**
   * Update portfolio value and check risk limits
   * Should be called on every price update
   * @param {Object} portfolio - Current portfolio state
   * @returns {Object} Risk assessment result
   */
  updateAndCheck(portfolio) {
    if (!this.isInitialized) {
      return { tradingAllowed: true };
    }

    // Check if new trading day
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.sessionDate) {
      this.resetDailyTracking(portfolio);
    }

    // Update current values
    this.currentValue = portfolio.totalValue;
    this.unrealizedPnL = portfolio.unrealizedPnl;
    this.realizedPnLToday = portfolio.dayPnl || 0;

    // Track high/low water marks
    if (this.currentValue > this.highWaterMark) {
      this.highWaterMark = this.currentValue;
    }
    if (this.currentValue < this.lowWaterMark) {
      this.lowWaterMark = this.currentValue;
    }

    // Calculate daily P&L
    this.dailyPnL = this.currentValue - this.dayStartValue;
    this.dailyPnLPercent = this.dayStartValue > 0
      ? (this.dailyPnL / this.dayStartValue) * 100
      : 0;

    // Calculate current drawdown from high water mark
    this.currentDrawdown = this.highWaterMark > 0
      ? ((this.highWaterMark - this.currentValue) / this.highWaterMark) * 100
      : 0;

    // Track max drawdown hit today
    if (this.currentDrawdown > this.maxDrawdownHit) {
      this.maxDrawdownHit = this.currentDrawdown;
    }

    // Check if trading should be halted
    const riskResult = this.assessRisk(portfolio);

    return riskResult;
  }

  /**
   * Assess risk and determine if trading should continue
   * @param {Object} portfolio - Current portfolio state
   * @returns {Object} Risk assessment
   */
  assessRisk(portfolio) {
    const result = {
      tradingAllowed: true,
      warnings: [],
      haltReason: null
    };

    // Check 1: Daily drawdown limit
    if (this.dailyPnLPercent <= -this.maxDailyDrawdown) {
      result.tradingAllowed = false;
      result.haltReason = 'DAILY_DRAWDOWN_LIMIT';
      this.haltTrading('DAILY_DRAWDOWN_LIMIT',
        `Daily loss of ${Math.abs(this.dailyPnLPercent).toFixed(2)}% exceeds ${this.maxDailyDrawdown}% limit`);
    }

    // Check 2: Portfolio heat (too much invested)
    const portfolioHeat = portfolio.investedValue > 0 && portfolio.totalValue > 0
      ? (portfolio.investedValue / portfolio.totalValue) * 100
      : 0;

    if (portfolioHeat > this.maxPortfolioHeat) {
      result.warnings.push({
        type: 'HIGH_PORTFOLIO_HEAT',
        message: `Portfolio heat at ${portfolioHeat.toFixed(1)}% (limit: ${this.maxPortfolioHeat}%)`,
        level: 'warning'
      });
      // Don't halt, just warn - prevents new buys but allows sells
      result.preventNewBuys = true;
    }

    // Check 3: Drawdown from session high
    if (this.currentDrawdown >= this.maxDailyDrawdown * 0.8) {
      result.warnings.push({
        type: 'APPROACHING_DRAWDOWN_LIMIT',
        message: `Drawdown at ${this.currentDrawdown.toFixed(2)}%, approaching ${this.maxDailyDrawdown}% limit`,
        level: 'warning'
      });
    }

    // If trading was halted, check cooldown
    if (this.tradingHalted) {
      const cooldownRemaining = this.getCooldownRemaining();
      if (cooldownRemaining > 0) {
        result.tradingAllowed = false;
        result.haltReason = this.haltReason;
        result.cooldownRemaining = cooldownRemaining;
      } else {
        // Check if we can resume (only if loss recovered somewhat)
        const recovered = this.dailyPnLPercent > -(this.maxDailyDrawdown * 0.5);
        if (recovered) {
          this.resumeTrading();
          result.warnings.push({
            type: 'TRADING_RESUMED',
            message: 'Trading resumed after cooldown',
            level: 'info'
          });
        } else {
          result.tradingAllowed = false;
          result.haltReason = 'STILL_IN_DRAWDOWN';
        }
      }
    }

    return result;
  }

  /**
   * Halt trading
   * @param {string} reason - Reason for halt
   * @param {string} message - Detailed message
   */
  haltTrading(reason, message) {
    if (this.tradingHalted) return; // Already halted

    this.tradingHalted = true;
    this.haltReason = reason;
    this.haltTime = Date.now();
    this.haltedAt = {
      value: this.currentValue,
      dailyPnL: this.dailyPnL,
      dailyPnLPercent: this.dailyPnLPercent
    };

    logger.warn(`TRADING HALTED: ${reason}`);
    logger.warn(message);

    // Record to database if available
    if (this.database) {
      try {
        this.database.recordRiskEvent({
          type: reason,
          message,
          portfolioValue: this.currentValue,
          dailyPnL: this.dailyPnL,
          dailyPnLPercent: this.dailyPnLPercent,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Failed to record risk event:', error);
      }
    }
  }

  /**
   * Resume trading after halt
   */
  resumeTrading() {
    this.tradingHalted = false;
    this.haltReason = null;
    this.haltTime = null;
    this.haltedAt = null;
    logger.info('Trading resumed');
  }

  /**
   * Get remaining cooldown time in milliseconds
   * @returns {number} Remaining cooldown in ms
   */
  getCooldownRemaining() {
    if (!this.haltTime) return 0;
    const elapsed = Date.now() - this.haltTime;
    return Math.max(0, this.cooldownPeriodMs - elapsed);
  }

  /**
   * Reset daily tracking for new session
   * @param {Object} portfolio - Current portfolio state
   */
  resetDailyTracking(portfolio) {
    const previousDate = this.sessionDate;
    this.sessionDate = new Date().toISOString().split('T')[0];

    // Log previous day summary
    if (previousDate) {
      logger.info(`Previous session ${previousDate} summary:`);
      logger.info(`  Day P&L: ${this.dailyPnL.toFixed(2)} (${this.dailyPnLPercent.toFixed(2)}%)`);
      logger.info(`  Max Drawdown: ${this.maxDrawdownHit.toFixed(2)}%`);
    }

    // Reset for new day
    this.dayStartValue = portfolio.totalValue;
    this.highWaterMark = portfolio.totalValue;
    this.lowWaterMark = portfolio.totalValue;
    this.dailyPnL = 0;
    this.dailyPnLPercent = 0;
    this.maxDrawdownHit = 0;
    this.realizedPnLToday = 0;

    // Clear halt status for new day
    this.tradingHalted = false;
    this.haltReason = null;
    this.haltTime = null;
    this.haltedAt = null;

    logger.info(`New trading session started: ${this.sessionDate}`);
    logger.info(`Starting value: ${this.dayStartValue.toFixed(2)}`);
  }

  /**
   * Force reset halt status (manual override)
   */
  forceResumeTrading() {
    this.tradingHalted = false;
    this.haltReason = null;
    this.haltTime = null;
    logger.warn('Trading force resumed by manual override');
  }

  /**
   * Check if a new buy order is allowed
   * @param {number} orderValue - Value of the proposed order
   * @returns {Object} Permission result
   */
  canBuy(orderValue) {
    if (this.tradingHalted) {
      return {
        allowed: false,
        reason: this.haltReason,
        message: 'Trading is halted due to risk limits'
      };
    }

    // Check portfolio heat after this order
    const portfolio = this.paperTradingService?.getPortfolio();
    if (portfolio && portfolio.totalValue > 0) {
      const newInvestedValue = portfolio.investedValue + orderValue;
      const newHeat = (newInvestedValue / portfolio.totalValue) * 100;

      if (newHeat > this.maxPortfolioHeat) {
        return {
          allowed: false,
          reason: 'PORTFOLIO_HEAT_LIMIT',
          message: `Order would increase portfolio heat to ${newHeat.toFixed(1)}% (limit: ${this.maxPortfolioHeat}%)`
        };
      }
    } else if (portfolio && portfolio.totalValue <= 0) {
      return {
        allowed: false,
        reason: 'ZERO_PORTFOLIO_VALUE',
        message: 'Cannot buy with zero or negative portfolio value'
      };
    }

    return { allowed: true };
  }

  /**
   * Get risk status summary
   * @returns {Object} Risk status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      sessionDate: this.sessionDate,
      tradingHalted: this.tradingHalted,
      haltReason: this.haltReason,
      cooldownRemaining: this.getCooldownRemaining(),

      dayStartValue: this.dayStartValue,
      currentValue: this.currentValue,
      highWaterMark: this.highWaterMark,
      lowWaterMark: this.lowWaterMark,

      dailyPnL: this.dailyPnL,
      dailyPnLPercent: this.dailyPnLPercent,
      currentDrawdown: this.currentDrawdown,
      maxDrawdownHit: this.maxDrawdownHit,

      limits: {
        maxDailyDrawdown: this.maxDailyDrawdown,
        maxPortfolioHeat: this.maxPortfolioHeat,
        cooldownPeriodMs: this.cooldownPeriodMs
      },

      haltedAt: this.haltedAt
    };
  }

  /**
   * Get risk metrics for display
   * @returns {Object} Risk metrics
   */
  getMetrics() {
    const portfolio = this.paperTradingService?.getPortfolio();
    const portfolioHeat = portfolio && portfolio.totalValue > 0
      ? (portfolio.investedValue / portfolio.totalValue) * 100
      : 0;

    return {
      dailyPnL: this.dailyPnL,
      dailyPnLPercent: this.dailyPnLPercent,
      drawdown: this.currentDrawdown,
      maxDrawdownToday: this.maxDrawdownHit,
      portfolioHeat,
      tradingHalted: this.tradingHalted,
      distanceToLimit: this.maxDailyDrawdown - Math.abs(this.dailyPnLPercent)
    };
  }
}

module.exports = new PortfolioRiskService();
