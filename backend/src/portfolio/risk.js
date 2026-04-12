const logger = require('../../utils/logger');
const config = require('../../config');

/**
 * Daily drawdown guard + portfolio heat monitor.
 * Halts trading when daily loss exceeds maxDailyDrawdown %.
 */
class Risk {
  constructor() {
    this.initialized = false;
    this.paperTrading = null;
    this.database = null;

    this.maxDailyDrawdown = config.risk.maxDailyDrawdown;  // 3.0%
    this.maxPortfolioHeat = config.risk.maxPortfolioHeat;  // 80%
    this.cooldownMs = config.risk.cooldownPeriodMs;         // 1h

    this.dayStartValue = 0;
    this.currentValue  = 0;
    this.highWaterMark = 0;
    this.lowWaterMark  = 0;
    this.dailyPnL      = 0;
    this.dailyPnLPct   = 0;
    this.drawdown      = 0;
    this.maxDrawdownHit = 0;

    this.halted    = false;
    this.haltReason = null;
    this.haltTime  = null;
    this.sessionDate = null;
  }

  setDatabase(db) { this.database = db; }

  initialize(paperTrading) {
    this.paperTrading = paperTrading;
    const p = paperTrading.getPortfolio();
    this.dayStartValue = p.totalValue;
    this.currentValue  = p.totalValue;
    this.highWaterMark = p.totalValue;
    this.lowWaterMark  = p.totalValue;
    this.sessionDate   = new Date().toISOString().split('T')[0];
    this.initialized   = true;
    logger.info(`Risk: maxDrawdown=${this.maxDailyDrawdown}%, maxHeat=${this.maxPortfolioHeat}%, start=${this.dayStartValue.toFixed(2)}`);
    return true;
  }

  updateAndCheck(portfolio) {
    if (!this.initialized) return { tradingAllowed: true };

    const today = new Date().toISOString().split('T')[0];
    if (today !== this.sessionDate) this._resetDay(portfolio);

    this.currentValue = portfolio.totalValue;
    if (this.currentValue > this.highWaterMark) this.highWaterMark = this.currentValue;
    if (this.currentValue < this.lowWaterMark)  this.lowWaterMark  = this.currentValue;

    this.dailyPnL    = this.currentValue - this.dayStartValue;
    this.dailyPnLPct = this.dayStartValue > 0 ? (this.dailyPnL / this.dayStartValue) * 100 : 0;
    this.drawdown    = this.highWaterMark > 0 ? ((this.highWaterMark - this.currentValue) / this.highWaterMark) * 100 : 0;
    if (this.drawdown > this.maxDrawdownHit) this.maxDrawdownHit = this.drawdown;

    return this._assess(portfolio);
  }

  _assess(portfolio) {
    const result = { tradingAllowed: true, warnings: [], haltReason: null };

    if (this.dailyPnLPct <= -this.maxDailyDrawdown) {
      result.tradingAllowed = false;
      result.haltReason = 'DAILY_DRAWDOWN_LIMIT';
      this._halt('DAILY_DRAWDOWN_LIMIT', `Daily loss ${Math.abs(this.dailyPnLPct).toFixed(2)}% exceeds ${this.maxDailyDrawdown}%`);
    }

    const heat = portfolio.totalValue > 0 ? (portfolio.investedValue / portfolio.totalValue) * 100 : 0;
    if (heat > this.maxPortfolioHeat) {
      result.warnings.push({ type: 'HIGH_PORTFOLIO_HEAT', message: `Heat ${heat.toFixed(1)}% > ${this.maxPortfolioHeat}%` });
      result.preventNewBuys = true;
    }

    if (this.drawdown >= this.maxDailyDrawdown * 0.8) {
      result.warnings.push({ type: 'APPROACHING_DRAWDOWN', message: `Drawdown ${this.drawdown.toFixed(2)}% near limit` });
    }

    if (this.halted) {
      const remaining = this._cooldownRemaining();
      if (remaining > 0) {
        result.tradingAllowed = false;
        result.haltReason = this.haltReason;
        result.cooldownRemaining = remaining;
      } else {
        const recovered = this.dailyPnLPct > -(this.maxDailyDrawdown * 0.5);
        if (recovered) {
          this.resume();
          result.warnings.push({ type: 'TRADING_RESUMED', message: 'Resumed after cooldown' });
        } else {
          result.tradingAllowed = false;
          result.haltReason = 'STILL_IN_DRAWDOWN';
        }
      }
    }

    return result;
  }

  _halt(reason, msg) {
    if (this.halted) return;
    this.halted = true;
    this.haltReason = reason;
    this.haltTime = Date.now();
    logger.warn(`TRADING HALTED: ${reason} — ${msg}`);
    if (this.database) {
      try {
        this.database.recordRiskEvent({ type: reason, message: msg, portfolioValue: this.currentValue, dailyPnL: this.dailyPnL, dailyPnLPercent: this.dailyPnLPct });
      } catch(e) {}
    }
  }

  resume() { this.halted = false; this.haltReason = null; this.haltTime = null; logger.info('Trading resumed'); }
  forceResumeTrading() { this.resume(); logger.warn('Trading force-resumed by manual override'); }

  _cooldownRemaining() {
    if (!this.haltTime) return 0;
    return Math.max(0, this.cooldownMs - (Date.now() - this.haltTime));
  }

  canBuy(orderValue) {
    if (this.halted) return { allowed: false, reason: this.haltReason, message: 'Trading halted' };
    const p = this.paperTrading?.getPortfolio();
    if (p && p.totalValue > 0) {
      const newHeat = ((p.investedValue + orderValue) / p.totalValue) * 100;
      if (newHeat > this.maxPortfolioHeat) {
        return { allowed: false, reason: 'PORTFOLIO_HEAT_LIMIT', message: `Heat would reach ${newHeat.toFixed(1)}%` };
      }
    }
    return { allowed: true };
  }

  _resetDay(portfolio) {
    logger.info(`New session. Day P&L: ${this.dailyPnL.toFixed(2)} (${this.dailyPnLPct.toFixed(2)}%), maxDrawdown: ${this.maxDrawdownHit.toFixed(2)}%`);
    this.sessionDate   = new Date().toISOString().split('T')[0];
    this.dayStartValue = portfolio.totalValue;
    this.highWaterMark = portfolio.totalValue;
    this.lowWaterMark  = portfolio.totalValue;
    this.dailyPnL = this.dailyPnLPct = this.maxDrawdownHit = 0;
    this.halted = false; this.haltReason = null; this.haltTime = null;
    logger.info(`New day: ${this.sessionDate}, start=${this.dayStartValue.toFixed(2)}`);
  }

  getStatus() {
    return {
      initialized: this.initialized, sessionDate: this.sessionDate,
      tradingHalted: this.halted, haltReason: this.haltReason,
      cooldownRemaining: this._cooldownRemaining(),
      dayStartValue: this.dayStartValue, currentValue: this.currentValue,
      highWaterMark: this.highWaterMark, lowWaterMark: this.lowWaterMark,
      dailyPnL: this.dailyPnL, dailyPnLPercent: this.dailyPnLPct,
      currentDrawdown: this.drawdown, maxDrawdownHit: this.maxDrawdownHit,
      limits: { maxDailyDrawdown: this.maxDailyDrawdown, maxPortfolioHeat: this.maxPortfolioHeat, cooldownMs: this.cooldownMs }
    };
  }

  getMetrics() {
    const p = this.paperTrading?.getPortfolio();
    const heat = p && p.totalValue > 0 ? (p.investedValue / p.totalValue) * 100 : 0;
    return {
      dailyPnL: this.dailyPnL, dailyPnLPercent: this.dailyPnLPct,
      drawdown: this.drawdown, maxDrawdownToday: this.maxDrawdownHit,
      portfolioHeat: heat, tradingHalted: this.halted,
      distanceToLimit: this.maxDailyDrawdown - Math.abs(this.dailyPnLPct)
    };
  }
}

module.exports = new Risk();
