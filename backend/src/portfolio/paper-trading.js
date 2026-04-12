const Decimal = require('decimal.js');
const logger = require('../../utils/logger');
const db = require('../database');
const config = require('../../config');

class PaperTrading {
  constructor() {
    this.initialized = false;
    this.enabled = true;
    this.cashBalance = 0;
    this.initialCapital = 0;
    this.amountPerTrade = 0;
    this.holdings = new Map();    // token string -> holding
    this.totalRealizedPnL = 0;
  }

  // ── Zerodha intraday brokerage ────────────────────────────────────────────

  _calcBrokerage(buy, sell, qty) {
    const turnover = (buy * qty) + (sell * qty);
    let brokerage = turnover * 0.0003;
    if (brokerage > 20) brokerage = 20;
    const exchange = turnover * 0.0000345;
    const sebi     = turnover * 0.0000001;
    const gst      = 0.18 * (brokerage + exchange);
    const total    = brokerage + exchange + sebi + gst;
    return {
      brokerage: parseFloat(brokerage.toFixed(2)),
      totalCharges: parseFloat(total.toFixed(2)),
      netPL: parseFloat(((sell - buy) * qty - total).toFixed(2))
    };
  }

  // ── Initialize ────────────────────────────────────────────────────────────

  initialize() {
    this.initialCapital = config.trading.initialCapital;
    this.amountPerTrade = config.trading.amountPerTrade;

    const state = db.getPortfolioState();
    if (state) {
      this.cashBalance = state.cash_balance;
      this.totalRealizedPnL = state.realized_pnl;
      this.initialCapital = state.initial_capital;

      db.getAllHoldings().forEach(h => {
        this.holdings.set(h.token.toString(), {
          symbol: h.symbol, qty: h.qty,
          avgPrice: h.avg_price, currentPrice: h.avg_price,
          investedValue: h.invested_value, currentValue: h.invested_value,
          unrealizedPnl: 0, unrealizedPnlPercent: 0
        });
      });
      logger.info(`Portfolio restored: cash=${this.cashBalance.toFixed(2)}, holdings=${this.holdings.size}, PnL=${this.totalRealizedPnL.toFixed(2)}`);
    } else {
      this.cashBalance = this.initialCapital;
      db.initializePortfolio(this.initialCapital);
      logger.info(`Fresh portfolio: capital=${this.initialCapital}`);
    }

    this.initialized = true;
    logger.info(`Paper trading: capital=${this.initialCapital}, perTrade=${this.amountPerTrade}`);
    return true;
  }

  // ── Order execution ───────────────────────────────────────────────────────

  async executeVirtualOrder(token, symbol, type, price, gridLevel = 0, referencePrice = null, options = {}) {
    if (!this.initialized) return { success: false, message: 'Not initialized' };
    if (!this.enabled)     return { success: false, message: 'Trading disabled' };

    try {
      const p = new Decimal(price);
      if (type === 'BUY')  return this._buy(token, symbol, p, gridLevel, options);
      if (type === 'SELL') return this._sell(token, symbol, p, gridLevel, referencePrice, options);
      return { success: false, message: 'Invalid type' };
    } catch (err) {
      logger.error(`Order failed ${symbol}:`, err.message);
      return { success: false, message: err.message };
    }
  }

  _buy(token, symbol, price, gridLevel, options) {
    if (this.cashBalance < this.amountPerTrade) return { success: false, message: 'Insufficient balance' };
    const qty = Math.floor(this.amountPerTrade / price.toNumber());
    if (qty === 0) return { success: false, message: 'Price too high' };

    const value = new Decimal(qty).mul(price);
    this.cashBalance = new Decimal(this.cashBalance).minus(value).toNumber();

    const existing = this.holdings.get(token.toString());
    if (existing) {
      const totalQty = existing.qty + qty;
      const totalInvested = new Decimal(existing.investedValue).plus(value);
      const avg = totalInvested.div(totalQty).toNumber();
      this.holdings.set(token.toString(), { ...existing, qty: totalQty, avgPrice: avg, investedValue: totalInvested.toNumber(), currentPrice: price.toNumber(), currentValue: new Decimal(totalQty).mul(price).toNumber() });
      db.upsertHolding(token, symbol, totalQty, avg, totalInvested.toNumber());
    } else {
      this.holdings.set(token.toString(), { symbol, qty, avgPrice: price.toNumber(), currentPrice: price.toNumber(), investedValue: value.toNumber(), currentValue: value.toNumber(), unrealizedPnl: 0, unrealizedPnlPercent: 0 });
      db.upsertHolding(token, symbol, qty, price.toNumber(), value.toNumber());
    }

    db.updateCashBalance(this.cashBalance);
    db.recordTransaction({ type: 'BUY', token, symbol, qty, price: price.toNumber(), value: value.toNumber(), balanceAfter: this.cashBalance, gridLevel, marketRegime: options.marketRegime || null });

    logger.info(`BUY ${symbol} qty=${qty} price=${price.toNumber()} balance=${this.cashBalance.toFixed(2)}`);
    return { success: true, qty, price: price.toNumber(), value: value.toNumber(), balance: this.cashBalance };
  }

  _sell(token, symbol, price, gridLevel, referencePrice, options) {
    const h = this.holdings.get(token.toString());
    if (!h || h.qty === 0) return { success: false, message: 'No holdings' };

    const qty = h.qty;
    const value = new Decimal(qty).mul(price);
    const brok = this._calcBrokerage(h.avgPrice, price.toNumber(), qty);
    const netPnl = new Decimal(brok.netPL);
    const netPnlPct = netPnl.div(h.investedValue).mul(100);

    this.cashBalance = new Decimal(this.cashBalance).plus(h.investedValue).toNumber();
    this.totalRealizedPnL = new Decimal(this.totalRealizedPnL).plus(netPnl).toNumber();
    this.holdings.delete(token.toString());

    db.deleteHolding(token);
    db.updateCashBalance(this.cashBalance);
    db.addRealizedPnl(netPnl.toNumber());
    db.recordTransaction({
      type: 'SELL', token, symbol, qty, price: price.toNumber(), value: value.toNumber(),
      brokerage: brok.totalCharges, pnl: netPnl.toNumber(), pnlPercent: netPnlPct.toNumber(),
      balanceAfter: this.cashBalance, gridLevel, exitReason: options.exitReason || null,
      marketRegime: options.marketRegime || null
    });

    logger.info(`SELL [${options.exitReason || ''}] ${symbol} qty=${qty} price=${price.toNumber()} P&L=${netPnl.toNumber().toFixed(2)} balance=${this.cashBalance.toFixed(2)}`);
    return { success: true, qty, price: price.toNumber(), value: value.toNumber(), pnl: netPnl.toNumber(), pnlPercent: netPnlPct.toNumber(), brokerage: brok.totalCharges, balance: this.cashBalance };
  }

  // ── Price updates ─────────────────────────────────────────────────────────

  updateHoldingPrice(token, price) {
    const h = this.holdings.get(token.toString());
    if (!h) return;
    const curVal = new Decimal(h.qty).mul(price);
    const unrealized = curVal.minus(h.investedValue);
    const unrealizedPct = unrealized.div(h.investedValue).mul(100);
    h.currentPrice = price;
    h.currentValue = curVal.toNumber();
    h.unrealizedPnl = unrealized.toNumber();
    h.unrealizedPnlPercent = unrealizedPct.toNumber();
    this.holdings.set(token.toString(), h);
  }

  // ── Portfolio view ────────────────────────────────────────────────────────

  getPortfolio() {
    let holdingsValue = new Decimal(0), unrealized = new Decimal(0), invested = new Decimal(0);
    this.holdings.forEach(h => {
      const cur = new Decimal(h.qty).mul(h.currentPrice || h.avgPrice);
      holdingsValue = holdingsValue.plus(cur);
      unrealized = unrealized.plus(cur.minus(h.investedValue));
      invested = invested.plus(h.investedValue);
    });
    const totalValue  = new Decimal(this.cashBalance).plus(holdingsValue).plus(this.totalRealizedPnL);
    const totalPnl    = new Decimal(this.totalRealizedPnL).plus(unrealized);
    const totalPnlPct = this.initialCapital > 0 ? totalPnl.div(this.initialCapital).mul(100) : new Decimal(0);
    const day = db.getTodayPnl();
    return {
      cash: this.cashBalance, holdingsValue: holdingsValue.toNumber(),
      investedValue: invested.toNumber(), totalValue: totalValue.toNumber(),
      totalPnl: totalPnl.toNumber(), pnlPercent: totalPnlPct.toNumber(),
      realizedPnl: this.totalRealizedPnL, unrealizedPnl: unrealized.toNumber(),
      holdingsCount: this.holdings.size, initialCapital: this.initialCapital,
      dayPnl: day.realized_pnl || 0, dayTrades: day.trades_count || 0,
      amountPerTrade: this.amountPerTrade
    };
  }

  getHoldings() {
    return Array.from(this.holdings.entries()).map(([token, h]) => {
      const cur = h.currentPrice || h.avgPrice;
      const curVal = h.qty * cur;
      const pnl = curVal - h.investedValue;
      const pnlPct = h.investedValue > 0 ? (pnl / h.investedValue) * 100 : 0;
      return { token, symbol: h.symbol, qty: h.qty, avgPrice: h.avgPrice, currentPrice: cur, investedValue: h.investedValue, currentValue: curVal, unrealizedPnl: pnl, unrealizedPnlPercent: pnlPct };
    });
  }

  getOrders(limit = 100) {
    return db.getTransactions(limit, 0).map(t => ({
      id: t.id, type: t.type, token: t.token, symbol: t.symbol,
      qty: t.qty, price: t.price, value: t.value, balance: t.balance_after,
      pnl: t.pnl, pnlPercent: t.pnl_percent, brokerage: t.brokerage,
      exitReason: t.exit_reason, marketRegime: t.market_regime, timestamp: t.created_at
    }));
  }

  getTodayOrders() {
    return db.getTodayTransactions().map(t => ({
      id: t.id, type: t.type, token: t.token, symbol: t.symbol,
      qty: t.qty, price: t.price, value: t.value, balance: t.balance_after,
      pnl: t.pnl, pnlPercent: t.pnl_percent, brokerage: t.brokerage,
      exitReason: t.exit_reason, marketRegime: t.market_regime, timestamp: t.created_at
    }));
  }

  getStats() { return db.getStats(); }
  getDailyPnl(days = 30) { return db.getDailyPnl(days); }
  hasHolding(token) { const h = this.holdings.get((token || '').toString()); return !!(h && h.qty > 0); }

  enable()  { this.enabled = true;  logger.info('Paper trading enabled'); }
  disable() { this.enabled = false; logger.info('Paper trading disabled'); }

  reset() {
    this.cashBalance = this.initialCapital;
    this.holdings.clear();
    this.totalRealizedPnL = 0;
    db.resetPortfolio(this.initialCapital);
    logger.info('Portfolio reset');
  }
}

module.exports = new PaperTrading();
