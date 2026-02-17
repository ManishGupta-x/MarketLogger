const Decimal = require('decimal.js');
const logger = require('../utils/logger');

class PaperTradingService {
  constructor() {
    this.isInitialized = false;
    this.isEnabled = true;
    this.cashBalance = 0;
    this.initialCapital = 0;
    this.amountPerTrade = 0;
    this.gridPercentage = 0.25;
    this.holdings = new Map();
    this.totalRealizedPnL = 0;
    this.orders = []; // In-memory order history
  }

  // Calculate Zerodha Intraday brokerage charges
  calculateZerodhaIntraday(buy, sell, qty) {
    const turnover = (buy * qty) + (sell * qty);

    let brokerage = turnover * 0.0003;
    if (brokerage > 20) brokerage = 20;

    const exchangeTxn = turnover * 0.0000345;
    const sebiCharges = turnover * 0.0000001;
    const gst = 0.18 * (brokerage + exchangeTxn);
    const totalCharges = brokerage + exchangeTxn + sebiCharges + gst;
    const grossPL = (sell - buy) * qty;
    const netPL = grossPL - totalCharges;

    return {
      turnover: parseFloat(turnover.toFixed(2)),
      brokerage: parseFloat(brokerage.toFixed(2)),
      totalCharges: parseFloat(totalCharges.toFixed(2)),
      grossPL: parseFloat(grossPL.toFixed(2)),
      netPL: parseFloat(netPL.toFixed(2))
    };
  }

  async initialize(initialCapital = null, amountPerTrade = null, gridPercentage = null) {
    logger.info('Initializing Paper Trading Service...');

    // Load configuration
    this.initialCapital = initialCapital || parseFloat(process.env.INITIAL_CAPITAL) || 100000;
    this.amountPerTrade = amountPerTrade || parseFloat(process.env.AMOUNT_PER_TRADE) || 5000;
    this.gridPercentage = gridPercentage || parseFloat(process.env.GRID_PERCENTAGE) || 0.25;

    this.cashBalance = this.initialCapital;
    this.isEnabled = true;
    this.isInitialized = true;

    logger.info(`Initial Capital: ${this.initialCapital}`);
    logger.info(`Amount per Trade: ${this.amountPerTrade}`);
    logger.info(`Grid Percentage: ${this.gridPercentage}%`);
    logger.info('Paper Trading Service initialized (in-memory)');

    return true;
  }

  async executeVirtualOrder(token, symbol, type, price, gridLevel = 0, referencePrice = null) {
    if (!this.isInitialized) {
      return { success: false, message: 'Paper trading not initialized' };
    }

    if (!this.isEnabled) {
      return { success: false, message: 'Paper trading is disabled' };
    }

    try {
      const priceDecimal = new Decimal(price);

      if (type === 'BUY') {
        return this.executeBuy(token, symbol, priceDecimal, gridLevel, referencePrice);
      } else if (type === 'SELL') {
        return this.executeSell(token, symbol, priceDecimal, gridLevel, referencePrice);
      } else {
        return { success: false, message: 'Invalid order type' };
      }
    } catch (error) {
      logger.error(`Order execution failed for ${symbol}:`, error);
      return { success: false, message: error.message };
    }
  }

  executeBuy(token, symbol, price, gridLevel, referencePrice) {
    if (this.cashBalance < this.amountPerTrade) {
      return { success: false, message: 'Insufficient balance' };
    }

    const qty = Math.floor(this.amountPerTrade / price.toNumber());
    if (qty === 0) {
      return { success: false, message: 'Stock price too high' };
    }

    const orderValue = new Decimal(qty).mul(price);
    this.cashBalance = new Decimal(this.cashBalance).minus(orderValue).toNumber();

    const existingHolding = this.holdings.get(token);

    if (existingHolding) {
      const totalQty = existingHolding.qty + qty;
      const totalInvested = new Decimal(existingHolding.investedValue).plus(orderValue);
      const avgPrice = totalInvested.div(totalQty);

      this.holdings.set(token, {
        symbol,
        qty: totalQty,
        avgPrice: avgPrice.toNumber(),
        currentPrice: price.toNumber(),
        investedValue: totalInvested.toNumber(),
        currentValue: new Decimal(totalQty).mul(price).toNumber(),
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0
      });
    } else {
      this.holdings.set(token, {
        symbol,
        qty,
        avgPrice: price.toNumber(),
        currentPrice: price.toNumber(),
        investedValue: orderValue.toNumber(),
        currentValue: orderValue.toNumber(),
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0
      });
    }

    // Record order
    this.orders.push({
      id: this.orders.length + 1,
      type: 'BUY',
      token,
      symbol,
      qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      balance: this.cashBalance,
      pnl: 0,
      timestamp: new Date().toISOString()
    });

    logger.info(`BUY ${symbol} | Qty: ${qty} | Price: ${price.toNumber()} | Balance: ${this.cashBalance.toFixed(2)}`);

    return {
      success: true,
      qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      balance: this.cashBalance
    };
  }

  executeSell(token, symbol, price, gridLevel, referencePrice) {
    const holding = this.holdings.get(token);

    if (!holding || holding.qty === 0) {
      return { success: false, message: 'No holdings to sell' };
    }

    const qty = holding.qty;
    const orderValue = new Decimal(qty).mul(price);

    const brokerageCalc = this.calculateZerodhaIntraday(
      holding.avgPrice,
      price.toNumber(),
      qty
    );

    const investedValue = new Decimal(holding.investedValue);
    const netPnl = new Decimal(brokerageCalc.netPL);
    const netPnlPercent = netPnl.div(investedValue).mul(100);

    // Return invested amount to cash
    this.cashBalance = new Decimal(this.cashBalance).plus(investedValue).toNumber();
    this.totalRealizedPnL = new Decimal(this.totalRealizedPnL).plus(netPnl).toNumber();

    this.holdings.delete(token);

    // Record order
    this.orders.push({
      id: this.orders.length + 1,
      type: 'SELL',
      token,
      symbol,
      qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      balance: this.cashBalance,
      pnl: netPnl.toNumber(),
      pnlPercent: netPnlPercent.toNumber(),
      brokerage: brokerageCalc.totalCharges,
      timestamp: new Date().toISOString()
    });

    logger.info(`SELL ${symbol} | Qty: ${qty} | Price: ${price.toNumber()} | P&L: ${netPnl.toNumber().toFixed(2)} | Balance: ${this.cashBalance.toFixed(2)}`);

    return {
      success: true,
      qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      pnl: netPnl.toNumber(),
      pnlPercent: netPnlPercent.toNumber(),
      brokerage: brokerageCalc.totalCharges,
      balance: this.cashBalance
    };
  }

  updateHoldingPrice(token, currentPrice) {
    const holding = this.holdings.get(token);
    if (!holding) return;

    const currentValue = new Decimal(holding.qty).mul(currentPrice);
    const unrealizedPnl = currentValue.minus(holding.investedValue);
    const unrealizedPnlPercent = unrealizedPnl.div(holding.investedValue).mul(100);

    holding.currentPrice = currentPrice;
    holding.currentValue = currentValue.toNumber();
    holding.unrealizedPnl = unrealizedPnl.toNumber();
    holding.unrealizedPnlPercent = unrealizedPnlPercent.toNumber();

    this.holdings.set(token, holding);
  }

  getPortfolio() {
    let holdingsValue = new Decimal(0);
    let unrealizedPnl = new Decimal(0);

    this.holdings.forEach(holding => {
      const currentPrice = holding.currentPrice || holding.avgPrice;
      const currentValue = new Decimal(holding.qty).mul(currentPrice);
      const pnl = currentValue.minus(holding.investedValue);

      holdingsValue = holdingsValue.plus(currentValue);
      unrealizedPnl = unrealizedPnl.plus(pnl);
    });

    const totalValue = new Decimal(this.cashBalance).plus(holdingsValue).plus(this.totalRealizedPnL);
    const totalPnl = new Decimal(this.totalRealizedPnL).plus(unrealizedPnl);
    const totalPnlPercent = this.initialCapital > 0 ? totalPnl.div(this.initialCapital).mul(100) : new Decimal(0);

    return {
      cash: this.cashBalance,
      holdingsValue: holdingsValue.toNumber(),
      totalValue: totalValue.toNumber(),
      totalPnl: totalPnl.toNumber(),
      pnlPercent: totalPnlPercent.toNumber(),
      realizedPnl: this.totalRealizedPnL,
      unrealizedPnl: unrealizedPnl.toNumber(),
      holdingsCount: this.holdings.size,
      initialCapital: this.initialCapital
    };
  }

  getHoldings() {
    return Array.from(this.holdings.entries()).map(([token, holding]) => {
      const currentPrice = holding.currentPrice || holding.avgPrice;
      const currentValue = holding.qty * currentPrice;
      const unrealizedPnl = currentValue - holding.investedValue;
      const unrealizedPnlPercent = holding.investedValue > 0 ? (unrealizedPnl / holding.investedValue) * 100 : 0;

      return {
        token,
        symbol: holding.symbol,
        qty: holding.qty,
        avgPrice: holding.avgPrice,
        currentPrice,
        investedValue: holding.investedValue,
        currentValue,
        unrealizedPnl,
        unrealizedPnlPercent
      };
    });
  }

  getOrders() {
    return this.orders.slice(-100); // Last 100 orders
  }

  hasHolding(token) {
    const holding = this.holdings.get(token);
    return holding && holding.qty > 0;
  }

  enableTrading() {
    this.isEnabled = true;
    logger.info('Paper trading enabled');
  }

  disableTrading() {
    this.isEnabled = false;
    logger.info('Paper trading disabled');
  }

  resetPortfolio() {
    this.cashBalance = this.initialCapital;
    this.holdings.clear();
    this.totalRealizedPnL = 0;
    this.orders = [];
    logger.info('Portfolio reset');
  }
}

module.exports = new PaperTradingService();
