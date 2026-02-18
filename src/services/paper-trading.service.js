const Decimal = require('decimal.js');
const logger = require('../utils/logger');
const database = require('./database.service');

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
    this.orders = []; // In-memory order history (recent orders)
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

    // Initialize database
    database.initialize();

    // Load configuration
    this.initialCapital = initialCapital || parseFloat(process.env.INITIAL_CAPITAL) || 100000;
    this.amountPerTrade = amountPerTrade || parseFloat(process.env.AMOUNT_PER_TRADE) || 5000;
    this.gridPercentage = gridPercentage || parseFloat(process.env.GRID_PERCENTAGE) || 0.25;

    // Check if we have existing portfolio state in database
    const portfolioState = database.getPortfolioState();

    if (portfolioState) {
      // Restore from database
      this.cashBalance = portfolioState.cash_balance;
      this.totalRealizedPnL = portfolioState.realized_pnl;
      this.initialCapital = portfolioState.initial_capital;

      // Restore holdings from database
      const dbHoldings = database.getAllHoldings();
      this.holdings.clear();
      dbHoldings.forEach(h => {
        this.holdings.set(h.token, {
          symbol: h.symbol,
          qty: h.qty,
          avgPrice: h.avg_price,
          currentPrice: h.avg_price,
          investedValue: h.invested_value,
          currentValue: h.invested_value,
          unrealizedPnl: 0,
          unrealizedPnlPercent: 0
        });
      });

      // Load recent orders from database
      const recentTransactions = database.getTransactions(100, 0);
      this.orders = recentTransactions.map(t => ({
        id: t.id,
        type: t.type,
        token: t.token,
        symbol: t.symbol,
        qty: t.qty,
        price: t.price,
        value: t.value,
        balance: t.balance_after,
        pnl: t.pnl,
        pnlPercent: t.pnl_percent,
        brokerage: t.brokerage,
        timestamp: t.created_at
      }));

      logger.info(`Restored portfolio from database: Cash=${this.cashBalance.toFixed(2)}, Holdings=${this.holdings.size}, Realized P&L=${this.totalRealizedPnL.toFixed(2)}`);
    } else {
      // Initialize fresh portfolio
      this.cashBalance = this.initialCapital;
      database.initializePortfolio(this.initialCapital);
      logger.info(`Initialized fresh portfolio with capital: ${this.initialCapital}`);
    }

    this.isEnabled = true;
    this.isInitialized = true;

    logger.info(`Initial Capital: ${this.initialCapital}`);
    logger.info(`Amount per Trade: ${this.amountPerTrade}`);
    logger.info(`Grid Percentage: ${this.gridPercentage}%`);
    logger.info('Paper Trading Service initialized with SQLite persistence');

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

      const updatedHolding = {
        symbol,
        qty: totalQty,
        avgPrice: avgPrice.toNumber(),
        currentPrice: price.toNumber(),
        investedValue: totalInvested.toNumber(),
        currentValue: new Decimal(totalQty).mul(price).toNumber(),
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0
      };

      this.holdings.set(token, updatedHolding);

      // Update in database
      database.upsertHolding(token, symbol, totalQty, avgPrice.toNumber(), totalInvested.toNumber());
    } else {
      const newHolding = {
        symbol,
        qty,
        avgPrice: price.toNumber(),
        currentPrice: price.toNumber(),
        investedValue: orderValue.toNumber(),
        currentValue: orderValue.toNumber(),
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0
      };

      this.holdings.set(token, newHolding);

      // Insert into database
      database.upsertHolding(token, symbol, qty, price.toNumber(), orderValue.toNumber());
    }

    // Update cash balance in database
    database.updateCashBalance(this.cashBalance);

    // Record transaction in database
    const order = {
      id: Date.now(),
      type: 'BUY',
      token,
      symbol,
      qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      balance: this.cashBalance,
      pnl: 0,
      timestamp: new Date().toISOString()
    };

    database.recordTransaction({
      type: 'BUY',
      token,
      symbol,
      qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      balanceAfter: this.cashBalance,
      gridLevel
    });

    // Keep recent orders in memory
    this.orders.unshift(order);
    if (this.orders.length > 100) this.orders.pop();

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

    // Update database
    database.deleteHolding(token);
    database.updateCashBalance(this.cashBalance);
    database.addRealizedPnl(netPnl.toNumber());

    // Record transaction in database
    const order = {
      id: Date.now(),
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
    };

    database.recordTransaction({
      type: 'SELL',
      token,
      symbol,
      qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      brokerage: brokerageCalc.totalCharges,
      pnl: netPnl.toNumber(),
      pnlPercent: netPnlPercent.toNumber(),
      balanceAfter: this.cashBalance,
      gridLevel
    });

    // Keep recent orders in memory
    this.orders.unshift(order);
    if (this.orders.length > 100) this.orders.pop();

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
    let investedValue = new Decimal(0);

    this.holdings.forEach(holding => {
      const currentPrice = holding.currentPrice || holding.avgPrice;
      const currentValue = new Decimal(holding.qty).mul(currentPrice);
      const pnl = currentValue.minus(holding.investedValue);

      holdingsValue = holdingsValue.plus(currentValue);
      unrealizedPnl = unrealizedPnl.plus(pnl);
      investedValue = investedValue.plus(holding.investedValue);
    });

    const totalValue = new Decimal(this.cashBalance).plus(holdingsValue).plus(this.totalRealizedPnL);
    const totalPnl = new Decimal(this.totalRealizedPnL).plus(unrealizedPnl);
    const totalPnlPercent = this.initialCapital > 0 ? totalPnl.div(this.initialCapital).mul(100) : new Decimal(0);
    const dayPnl = database.getTodayPnl();

    return {
      cash: this.cashBalance,
      holdingsValue: holdingsValue.toNumber(),
      investedValue: investedValue.toNumber(),
      totalValue: totalValue.toNumber(),
      totalPnl: totalPnl.toNumber(),
      pnlPercent: totalPnlPercent.toNumber(),
      realizedPnl: this.totalRealizedPnL,
      unrealizedPnl: unrealizedPnl.toNumber(),
      holdingsCount: this.holdings.size,
      initialCapital: this.initialCapital,
      dayPnl: dayPnl.realized_pnl || 0,
      dayTrades: dayPnl.trades_count || 0,
      // Strategy config
      gridPercentage: this.gridPercentage,
      amountPerTrade: this.amountPerTrade,
      stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE) || 1
    };
  }

  getHoldings() {
    return Array.from(this.holdings.entries()).map(([token, holding]) => {
      const currentPrice = holding.currentPrice || holding.avgPrice;
      const currentValue = holding.qty * currentPrice;
      const unrealizedPnl = currentValue - holding.investedValue;
      const unrealizedPnlPercent = holding.investedValue > 0 ? (unrealizedPnl / holding.investedValue) * 100 : 0;
      const dayChange = ((currentPrice - holding.avgPrice) / holding.avgPrice) * 100;

      // Calculate target sell price based on grid percentage
      const targetPrice = holding.avgPrice * (1 + this.gridPercentage / 100);
      const targetPnl = (targetPrice - holding.avgPrice) * holding.qty;
      const distanceToTarget = ((targetPrice - currentPrice) / currentPrice) * 100;

      // Calculate stop loss price (1% below avg price by default)
      const stopLossPercentage = parseFloat(process.env.STOP_LOSS_PERCENTAGE) || 1;
      const stopLossPrice = holding.avgPrice * (1 - stopLossPercentage / 100);
      const distanceToStopLoss = ((currentPrice - stopLossPrice) / currentPrice) * 100;

      // For sorting: use minimum absolute distance (closest to either target or stop loss)
      const minDistance = Math.min(Math.abs(distanceToTarget), Math.abs(distanceToStopLoss));

      return {
        token,
        symbol: holding.symbol,
        qty: holding.qty,
        avgPrice: holding.avgPrice,
        currentPrice,
        investedValue: holding.investedValue,
        currentValue,
        unrealizedPnl,
        unrealizedPnlPercent,
        dayChange,
        targetPrice,
        targetPnl,
        distanceToTarget,
        stopLossPrice,
        distanceToStopLoss,
        minDistance
      };
    });
  }

  getOrders(limit = 100) {
    // Get from database for complete history
    const transactions = database.getTransactions(limit, 0);
    return transactions.map(t => ({
      id: t.id,
      type: t.type,
      token: t.token,
      symbol: t.symbol,
      qty: t.qty,
      price: t.price,
      value: t.value,
      balance: t.balance_after,
      pnl: t.pnl,
      pnlPercent: t.pnl_percent,
      brokerage: t.brokerage,
      timestamp: t.created_at
    }));
  }

  getTodayOrders() {
    const transactions = database.getTodayTransactions();
    return transactions.map(t => ({
      id: t.id,
      type: t.type,
      token: t.token,
      symbol: t.symbol,
      qty: t.qty,
      price: t.price,
      value: t.value,
      balance: t.balance_after,
      pnl: t.pnl,
      pnlPercent: t.pnl_percent,
      brokerage: t.brokerage,
      timestamp: t.created_at
    }));
  }

  getStats() {
    return database.getStats();
  }

  getDailyPnl(days = 30) {
    return database.getDailyPnl(days);
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
    database.resetPortfolio(this.initialCapital);
    logger.info('Portfolio reset');
  }
}

module.exports = new PaperTradingService();
