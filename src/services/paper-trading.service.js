const Decimal = require('decimal.js');
const db = require('./database.service');
const discordService = require('./discord.service');
const logger = require('../utils/logger');

class PaperTradingService {
  constructor(channelId = 'default') {
    this.channelId = channelId;
    this.isInitialized = false;
    this.isEnabled = false;
    this.cashBalance = 0;
    this.initialCapital = 0;
    this.amountPerTrade = 0;
    this.holdings = new Map();
    this.shortPositions = new Map(); // Track short positions
    this.totalRealizedPnL = 0;
    this.totalInvested = 0;
    this.orderChannelId = process.env.DISCORD_ORDER_CHANNEL_ID || '1424357736820379668';
  }

  async initialize(initialCapital = null, amountPerTrade = null) {
    try {
      logger.info(`💼 Initializing Paper Trading Service for channel ${this.channelId}...`);

      // Load configuration
      this.loadConfig(initialCapital, amountPerTrade);

      // Load existing portfolio state
      await this.loadPortfolio();

      this.isInitialized = true;
      logger.info(`✅ Paper Trading Service initialized for channel ${this.channelId}`);

      return true;
    } catch (error) {
      logger.error(`❌ Failed to initialize paper trading for channel ${this.channelId}:`, error);
      throw error;
    }
  }

  loadConfig(initialCapital = null, amountPerTrade = null) {
    const config = db.getAllConfig(this.channelId);

    // Priority: Parameter -> ENV -> DB -> Default
    // Load initial capital
    if (initialCapital !== null) {
      this.initialCapital = initialCapital;
      logger.info(`💰 Initial Capital from PARAM: ₹${this.initialCapital.toLocaleString()}`);
    } else if (process.env.INITIAL_CAPITAL) {
      this.initialCapital = parseFloat(process.env.INITIAL_CAPITAL);
      logger.info(`💰 Initial Capital from ENV: ₹${this.initialCapital.toLocaleString()}`);
    } else if (config.initial_capital) {
      this.initialCapital = parseFloat(config.initial_capital);
      logger.info(`💰 Initial Capital from DB: ₹${this.initialCapital.toLocaleString()}`);
    } else {
      this.initialCapital = 500000;
      logger.info(`💰 Initial Capital from DEFAULT: ₹${this.initialCapital.toLocaleString()}`);
    }

    // Load amount per trade
    if (amountPerTrade !== null) {
      this.amountPerTrade = amountPerTrade;
      logger.info(`📊 Amount per Trade from PARAM: ₹${this.amountPerTrade.toLocaleString()}`);
    } else if (process.env.AMOUNT_PER_TRADE) {
      this.amountPerTrade = parseFloat(process.env.AMOUNT_PER_TRADE);
      logger.info(`📊 Amount per Trade from ENV: ₹${this.amountPerTrade.toLocaleString()}`);
    } else if (config.amount_per_trade) {
      this.amountPerTrade = parseFloat(config.amount_per_trade);
      logger.info(`📊 Amount per Trade from DB: ₹${this.amountPerTrade.toLocaleString()}`);
    } else {
      this.amountPerTrade = 10000;
      logger.info(`📊 Amount per Trade from DEFAULT: ₹${this.amountPerTrade.toLocaleString()}`);
    }

    // Load grid percentage
    if (process.env.GRID_PERCENTAGE) {
      this.gridPercentage = parseFloat(process.env.GRID_PERCENTAGE);
      logger.info(`📈 Grid Percentage from ENV: ${this.gridPercentage}%`);
    } else if (config.grid_percentage) {
      this.gridPercentage = parseFloat(config.grid_percentage);
      logger.info(`📈 Grid Percentage from DB: ${this.gridPercentage}%`);
    } else {
      this.gridPercentage = 5.0;
      logger.info(`📈 Grid Percentage from DEFAULT: ${this.gridPercentage}%`);
    }

    // Load trading enabled status
    if (process.env.PAPER_TRADING_ENABLED !== undefined) {
      this.isEnabled = process.env.PAPER_TRADING_ENABLED === 'true';
      logger.info(`🎯 Trading Enabled from ENV: ${this.isEnabled}`);
    } else if (config.trading_enabled !== undefined) {
      this.isEnabled = config.trading_enabled === 'true';
      logger.info(`🎯 Trading Enabled from DB: ${this.isEnabled}`);
    } else {
      this.isEnabled = false;
      logger.info(`🎯 Trading Enabled from DEFAULT: ${this.isEnabled}`);
    }
  }

  async loadPortfolio() {
    // Check if we have any previous portfolio state
    const latestPortfolio = db.getLatestPortfolio(this.channelId);

    if (latestPortfolio) {
      // Resume from last known state
      this.cashBalance = latestPortfolio.cash_balance;
      logger.info(`📊 Loaded portfolio with cash balance: ₹${this.cashBalance.toLocaleString()}`);
    } else {
      // Initialize with initial capital
      this.cashBalance = this.initialCapital;
      logger.info(`💵 Starting with initial capital: ₹${this.cashBalance.toLocaleString()}`);
    }

    // Load holdings
    const holdings = db.getAllHoldings(this.channelId);
    this.holdings.clear();

    holdings.forEach(holding => {
      this.holdings.set(holding.token, {
        symbol: holding.symbol,
        qty: holding.qty,
        avgPrice: holding.avg_price,
        currentPrice: holding.current_price,
        investedValue: holding.invested_value,
        currentValue: holding.current_value,
        unrealizedPnl: holding.unrealized_pnl,
        unrealizedPnlPercent: holding.unrealized_pnl_percent
      });
    });

    logger.info(`📦 Loaded ${this.holdings.size} holdings`);

    // Load short positions
    const shortPositions = db.getAllShortPositions(this.channelId);
    this.shortPositions.clear();

    shortPositions.forEach(position => {
      this.shortPositions.set(position.token, {
        symbol: position.symbol,
        qty: position.qty,
        entryPrice: position.entry_price,
        currentPrice: position.current_price,
        shortValue: position.short_value,
        unrealizedPnl: position.unrealized_pnl,
        unrealizedPnlPercent: position.unrealized_pnl_percent
      });
    });

    logger.info(`🔻 Loaded ${this.shortPositions.size} short positions`);

    // Calculate total invested and realized P&L
    const stats = db.getTotalPnL(this.channelId);
    this.totalRealizedPnL = stats.realized_pnl || 0;
    this.totalInvested = this.initialCapital - this.cashBalance;

    logger.info(`💹 Total Realized P&L: ₹${this.totalRealizedPnL.toFixed(2)}`);
  }

  async executeVirtualOrder(token, symbol, type, price, gridLevel = 0, referencePrice = null, executionReason = null) {
    if (!this.isInitialized) {
      logger.warn('Paper trading not initialized');
      return { success: false, message: 'Paper trading not initialized' };
    }

    if (!this.isEnabled) {
      logger.warn('Paper trading is disabled');
      return { success: false, message: 'Paper trading is disabled' };
    }

    try {
      const priceDecimal = new Decimal(price);

      if (type === 'BUY') {
        return await this.executeBuy(token, symbol, priceDecimal, gridLevel, referencePrice, executionReason);
      } else if (type === 'SELL') {
        return await this.executeSell(token, symbol, priceDecimal, gridLevel, referencePrice, executionReason);
      } else if (type === 'SHORT') {
        return await this.executeShort(token, symbol, priceDecimal, gridLevel, referencePrice, executionReason);
      } else if (type === 'COVER') {
        return await this.executeCover(token, symbol, priceDecimal, gridLevel, referencePrice, executionReason);
      } else {
        return { success: false, message: 'Invalid order type' };
      }
    } catch (error) {
      logger.error(`❌ Order execution failed for ${symbol}:`, error);
      return { success: false, message: error.message };
    }
  }

  async executeBuy(token, symbol, price, gridLevel, referencePrice, executionReason = null) {
    // Check if we have enough balance
    if (this.cashBalance < this.amountPerTrade) {
      logger.warn(`Insufficient balance for ${symbol}: ₹${this.cashBalance.toFixed(2)} < ₹${this.amountPerTrade}`);
      return { success: false, message: 'Insufficient balance' };
    }

    // Calculate quantity
    const qty = Math.floor(this.amountPerTrade / price.toNumber());

    if (qty === 0) {
      logger.warn(`Stock price too high for ${symbol}: ₹${price.toNumber()}`);
      return { success: false, message: 'Stock price too high' };
    }

    const orderValue = new Decimal(qty).mul(price);

    // Update cash balance
    this.cashBalance = new Decimal(this.cashBalance).minus(orderValue).toNumber();

    // Update holdings
    const existingHolding = this.holdings.get(token);

    if (existingHolding) {
      // Average price calculation
      const totalQty = existingHolding.qty + qty;
      const totalInvested = new Decimal(existingHolding.investedValue).plus(orderValue);
      const avgPrice = totalInvested.div(totalQty);

      this.holdings.set(token, {
        symbol: symbol,
        qty: totalQty,
        avgPrice: avgPrice.toNumber(),
        currentPrice: price.toNumber(),
        investedValue: totalInvested.toNumber(),
        currentValue: new Decimal(totalQty).mul(price).toNumber(),
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0
      });
    } else {
      // New holding
      this.holdings.set(token, {
        symbol: symbol,
        qty: qty,
        avgPrice: price.toNumber(),
        currentPrice: price.toNumber(),
        investedValue: orderValue.toNumber(),
        currentValue: orderValue.toNumber(),
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0
      });
    }

    // Save to database
    const holding = this.holdings.get(token);
    db.upsertHolding({
      token: token,
      symbol: symbol,
      qty: holding.qty,
      avg_price: holding.avgPrice,
      current_price: holding.currentPrice,
      invested_value: holding.investedValue,
      current_value: holding.currentValue,
      unrealized_pnl: holding.unrealizedPnl,
      unrealized_pnl_percent: holding.unrealizedPnlPercent
    }, this.channelId);

    // Insert order record
    const orderId = db.insertOrder({
      type: 'BUY',
      token: token,
      symbol: symbol,
      qty: qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      balance: this.cashBalance,
      pnl: 0,
      pnl_percent: 0,
      grid_level: gridLevel,
      reference_price: referencePrice,
      notes: `Grid level ${gridLevel}`
    }, this.channelId);

    // Save portfolio snapshot
    this.savePortfolioSnapshot();

    // Log to Discord
    await this.logOrderToDiscord('BUY', symbol, qty, price.toNumber(), 0, 0, this.cashBalance, executionReason);

    logger.info(`🟢 BUY ${symbol} | Qty: ${qty} | Price: ₹${price.toNumber()} | Value: ₹${orderValue.toNumber().toFixed(2)} | Balance: ₹${this.cashBalance.toFixed(2)}`);

    return {
      success: true,
      orderId: orderId,
      qty: qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      balance: this.cashBalance
    };
  }

  async executeSell(token, symbol, price, gridLevel, referencePrice, executionReason = null) {
    // Check if we have holdings
    const holding = this.holdings.get(token);

    if (!holding || holding.qty === 0) {
      logger.warn(`No holdings to sell for ${symbol}`);
      return { success: false, message: 'No holdings to sell' };
    }

    // Sell all holdings for this stock
    const qty = holding.qty;
    const orderValue = new Decimal(qty).mul(price);

    // Calculate P&L
    const investedValue = new Decimal(holding.investedValue);
    const pnl = orderValue.minus(investedValue);
    const pnlPercent = pnl.div(investedValue).mul(100);

    // Update cash balance
    this.cashBalance = new Decimal(this.cashBalance).plus(orderValue).toNumber();

    // Update realized P&L
    this.totalRealizedPnL = new Decimal(this.totalRealizedPnL).plus(pnl).toNumber();

    // Remove holding
    this.holdings.delete(token);
    db.deleteHolding(token, this.channelId);

    // Insert order record
    const orderId = db.insertOrder({
      type: 'SELL',
      token: token,
      symbol: symbol,
      qty: qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      balance: this.cashBalance,
      pnl: pnl.toNumber(),
      pnl_percent: pnlPercent.toNumber(),
      grid_level: gridLevel,
      reference_price: referencePrice,
      notes: `Grid level ${gridLevel} | P&L: ₹${pnl.toNumber().toFixed(2)}`
    }, this.channelId);

    // Save portfolio snapshot
    this.savePortfolioSnapshot();

    // Log to Discord with special emoji for significant gains/losses
    await this.logOrderToDiscord('SELL', symbol, qty, price.toNumber(), pnl.toNumber(), pnlPercent.toNumber(), this.cashBalance, executionReason);

    logger.info(`🔴 SELL ${symbol} | Qty: ${qty} | Price: ₹${price.toNumber()} | P&L: ₹${pnl.toNumber().toFixed(2)} (${pnlPercent.toNumber().toFixed(2)}%) | Balance: ₹${this.cashBalance.toFixed(2)}`);

    return {
      success: true,
      orderId: orderId,
      qty: qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      pnl: pnl.toNumber(),
      pnlPercent: pnlPercent.toNumber(),
      balance: this.cashBalance
    };
  }

  async executeShort(token, symbol, price, gridLevel, referencePrice, executionReason = null) {
    // Check if we already have a short position
    if (this.shortPositions.has(token)) {
      logger.warn(`Already have short position for ${symbol}`);
      return { success: false, message: 'Already have short position' };
    }

    // Check if we have a long position (can't short if we own it)
    if (this.hasHolding(token)) {
      logger.warn(`Cannot short ${symbol} - already have long position`);
      return { success: false, message: 'Cannot short - have long position' };
    }

    // Calculate quantity based on amount per trade
    const qty = Math.floor(this.amountPerTrade / price.toNumber());

    if (qty === 0) {
      logger.warn(`Stock price too high for ${symbol}: ₹${price.toNumber()}`);
      return { success: false, message: 'Stock price too high' };
    }

    const orderValue = new Decimal(qty).mul(price);

    // For shorting, we receive cash upfront (but need margin - simplified here)
    // In real trading, you'd need margin. Here we'll track the liability.
    this.cashBalance = new Decimal(this.cashBalance).plus(orderValue).toNumber();

    // Create short position
    this.shortPositions.set(token, {
      symbol: symbol,
      qty: qty,
      entryPrice: price.toNumber(),
      currentPrice: price.toNumber(),
      shortValue: orderValue.toNumber(),
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0
    });

    // Save short position to database
    db.upsertShortPosition({
      token: token,
      symbol: symbol,
      qty: qty,
      entry_price: price.toNumber(),
      current_price: price.toNumber(),
      short_value: orderValue.toNumber(),
      current_value: orderValue.toNumber(),
      unrealized_pnl: 0,
      unrealized_pnl_percent: 0
    }, this.channelId);

    // Insert order record
    const orderId = db.insertOrder({
      type: 'SHORT',
      token: token,
      symbol: symbol,
      qty: qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      balance: this.cashBalance,
      pnl: 0,
      pnl_percent: 0,
      grid_level: gridLevel,
      reference_price: referencePrice,
      notes: `Short at grid level ${gridLevel}`
    }, this.channelId);

    // Save portfolio snapshot
    this.savePortfolioSnapshot();

    // Log to Discord
    await this.logOrderToDiscord('SHORT', symbol, qty, price.toNumber(), 0, 0, this.cashBalance, executionReason);

    logger.info(`🔻 SHORT ${symbol} | Qty: ${qty} | Price: ₹${price.toNumber()} | Value: ₹${orderValue.toNumber().toFixed(2)} | Balance: ₹${this.cashBalance.toFixed(2)}`);

    return {
      success: true,
      orderId: orderId,
      qty: qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      balance: this.cashBalance
    };
  }

  async executeCover(token, symbol, price, gridLevel, referencePrice, executionReason = null) {
    // Check if we have a short position to cover
    const shortPosition = this.shortPositions.get(token);

    if (!shortPosition || shortPosition.qty === 0) {
      logger.warn(`No short position to cover for ${symbol}`);
      return { success: false, message: 'No short position to cover' };
    }

    const qty = shortPosition.qty;
    const orderValue = new Decimal(qty).mul(price);

    // Calculate P&L (profit when price drops, loss when price rises)
    const shortValue = new Decimal(shortPosition.shortValue);
    const pnl = shortValue.minus(orderValue); // Profit = sell price - buy price
    const pnlPercent = pnl.div(shortValue).mul(100);

    // Update cash balance (pay to buy back shares)
    this.cashBalance = new Decimal(this.cashBalance).minus(orderValue).toNumber();

    // Update realized P&L
    this.totalRealizedPnL = new Decimal(this.totalRealizedPnL).plus(pnl).toNumber();

    // Remove short position
    this.shortPositions.delete(token);
    db.deleteShortPosition(token, this.channelId);

    // Insert order record
    const orderId = db.insertOrder({
      type: 'COVER',
      token: token,
      symbol: symbol,
      qty: qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      balance: this.cashBalance,
      pnl: pnl.toNumber(),
      pnl_percent: pnlPercent.toNumber(),
      grid_level: gridLevel,
      reference_price: referencePrice,
      notes: `Cover at grid level ${gridLevel} | P&L: ₹${pnl.toNumber().toFixed(2)}`
    }, this.channelId);

    // Save portfolio snapshot
    this.savePortfolioSnapshot();

    // Log to Discord
    await this.logOrderToDiscord('COVER', symbol, qty, price.toNumber(), pnl.toNumber(), pnlPercent.toNumber(), this.cashBalance, executionReason);

    logger.info(`🔺 COVER ${symbol} | Qty: ${qty} | Price: ₹${price.toNumber()} | P&L: ₹${pnl.toNumber().toFixed(2)} (${pnlPercent.toNumber().toFixed(2)}%) | Balance: ₹${this.cashBalance.toFixed(2)}`);

    return {
      success: true,
      orderId: orderId,
      qty: qty,
      price: price.toNumber(),
      value: orderValue.toNumber(),
      pnl: pnl.toNumber(),
      pnlPercent: pnlPercent.toNumber(),
      balance: this.cashBalance
    };
  }

  hasShortPosition(token) {
    const position = this.shortPositions.get(token);
    return position && position.qty > 0;
  }

  getShortPosition(token) {
    return this.shortPositions.get(token);
  }

  updateShortPositionPrice(token, currentPrice) {
    const position = this.shortPositions.get(token);
    if (!position) return;

    const currentValue = new Decimal(position.qty).mul(currentPrice);
    // For shorts: profit when price drops (shortValue - currentValue)
    const unrealizedPnl = new Decimal(position.shortValue).minus(currentValue);
    const unrealizedPnlPercent = unrealizedPnl.div(position.shortValue).mul(100);

    position.currentPrice = currentPrice;
    position.unrealizedPnl = unrealizedPnl.toNumber();
    position.unrealizedPnlPercent = unrealizedPnlPercent.toNumber();

    this.shortPositions.set(token, position);

    // Update in database
    db.updateShortPositionPrice(token, currentPrice, this.channelId);
  }

  async logOrderToDiscord(type, symbol, qty, price, pnl, pnlPercent, balance, executionReason = null) {
    if (!discordService.isReady) return;

    // Log to the trading channel (channelId) instead of a dedicated order channel
    const targetChannelId = this.channelId;

    // Log execution reason BEFORE the order message
    if (executionReason) {
      let reasonMessage = '';
      if (executionReason.type === 'BUY') {
        reasonMessage = `📉 **${symbol} dropped ${executionReason.changePercent}%**\n`;
        reasonMessage += `Price: ₹${executionReason.referencePrice.toFixed(2)} → ₹${executionReason.currentPrice.toFixed(2)}\n`;
        reasonMessage += `Grid threshold: ${executionReason.gridPercent}% drop triggered BUY`;
      } else if (executionReason.type === 'SELL') {
        reasonMessage = `📈 **${symbol} rose ${executionReason.changePercent}%**\n`;
        reasonMessage += `Price: ₹${executionReason.referencePrice.toFixed(2)} → ₹${executionReason.currentPrice.toFixed(2)}\n`;
        reasonMessage += `Grid threshold: ${executionReason.gridPercent}% rise triggered SELL`;
      } else if (executionReason.type === 'SHORT') {
        reasonMessage = `📈 **${symbol} rose ${executionReason.changePercent}%**\n`;
        reasonMessage += `Price: ₹${executionReason.referencePrice.toFixed(2)} → ₹${executionReason.currentPrice.toFixed(2)}\n`;
        reasonMessage += `Grid threshold: ${executionReason.gridPercent}% rise triggered SHORT`;
      } else if (executionReason.type === 'COVER') {
        reasonMessage = `📉 **${symbol} dropped ${executionReason.changePercent}%**\n`;
        reasonMessage += `Price: ₹${executionReason.referencePrice.toFixed(2)} → ₹${executionReason.currentPrice.toFixed(2)}\n`;
        reasonMessage += `Grid threshold: ${executionReason.gridPercent}% drop triggered COVER`;
      }
      await discordService.logToChannel(targetChannelId, reasonMessage, 'info');
    }

    // Set emoji based on order type
    let emoji;
    if (type === 'BUY') emoji = '🟢';
    else if (type === 'SELL') emoji = '🔴';
    else if (type === 'SHORT') emoji = '🔻';
    else if (type === 'COVER') emoji = '🔺';
    else emoji = '📊';

    const value = qty * price;

    let message = `${emoji} **${type} ${symbol}**\n`;
    message += `**Qty:** ${qty} @ ₹${price.toFixed(2)}\n`;
    message += `**Value:** ₹${value.toFixed(2)}\n`;

    if (type === 'SELL' || type === 'COVER') {
      const pnlEmoji = pnl >= 0 ? '📈' : '📉';
      const alertEmoji = Math.abs(pnlPercent) > 2 ? '🎉' : '';
      message += `${pnlEmoji} **P&L:** ₹${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%) ${alertEmoji}\n`;
    }

    message += `**Balance:** ₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const logType = type === 'BUY' ? 'info' : (pnl >= 0 ? 'success' : 'warning');

    // Log to the trading channel
    await discordService.logToChannel(targetChannelId, message, logType);
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

    // Update in database
    db.updateHoldingPrice(token, currentPrice, this.channelId);
  }

  savePortfolioSnapshot() {
    let holdingsValue = new Decimal(0);
    let unrealizedPnl = new Decimal(0);

    // Calculate long holdings value and unrealized P&L
    this.holdings.forEach(holding => {
      holdingsValue = holdingsValue.plus(holding.currentValue || holding.investedValue);
      unrealizedPnl = unrealizedPnl.plus(holding.unrealizedPnl || 0);
    });

    // Calculate short positions liability and unrealized P&L
    let shortLiability = new Decimal(0);
    this.shortPositions.forEach(position => {
      // Current value is what we'd need to pay to cover
      const currentValue = new Decimal(position.qty).mul(position.currentPrice);
      shortLiability = shortLiability.plus(currentValue);
      // For shorts: profit when price drops (shortValue - currentValue)
      unrealizedPnl = unrealizedPnl.plus(position.unrealizedPnl || 0);
    });

    // Total value = cash + holdings - short liabilities
    const totalValue = new Decimal(this.cashBalance).plus(holdingsValue).minus(shortLiability);
    const totalPnl = new Decimal(this.totalRealizedPnL).plus(unrealizedPnl);
    const totalPnlPercent = totalPnl.div(this.initialCapital).mul(100);

    db.insertPortfolioSnapshot({
      cash_balance: this.cashBalance,
      holdings_value: holdingsValue.toNumber(),
      total_value: totalValue.toNumber(),
      total_pnl: totalPnl.toNumber(),
      total_pnl_percent: totalPnlPercent.toNumber(),
      realized_pnl: this.totalRealizedPnL,
      unrealized_pnl: unrealizedPnl.toNumber(),
      holdings_count: this.holdings.size
    }, this.channelId);
  }

  getPortfolio() {
    let holdingsValue = new Decimal(0);
    let unrealizedPnl = new Decimal(0);

    // Calculate long holdings value and unrealized P&L
    this.holdings.forEach(holding => {
      holdingsValue = holdingsValue.plus(holding.currentValue || holding.investedValue);
      unrealizedPnl = unrealizedPnl.plus(holding.unrealizedPnl || 0);
    });

    // Calculate short positions liability and unrealized P&L
    let shortLiability = new Decimal(0);
    this.shortPositions.forEach(position => {
      // Current value is what we'd need to pay to cover
      const currentValue = new Decimal(position.qty).mul(position.currentPrice);
      shortLiability = shortLiability.plus(currentValue);
      // For shorts: profit when price drops (shortValue - currentValue)
      unrealizedPnl = unrealizedPnl.plus(position.unrealizedPnl || 0);
    });

    // Total value = cash + holdings - short liabilities
    const totalValue = new Decimal(this.cashBalance).plus(holdingsValue).minus(shortLiability);
    const totalPnl = new Decimal(this.totalRealizedPnL).plus(unrealizedPnl);
    const totalPnlPercent = totalPnl.div(this.initialCapital).mul(100);

    const todayStats = db.getTodayStats(this.channelId);

    return {
      cash: this.cashBalance,
      holdings_value: holdingsValue.toNumber(),
      short_liability: shortLiability.toNumber(),
      total_value: totalValue.toNumber(),
      total_pnl: totalPnl.toNumber(),
      pnl_percent: totalPnlPercent.toNumber(),
      realized_pnl: this.totalRealizedPnL,
      unrealized_pnl: unrealizedPnl.toNumber(),
      holdings_count: this.holdings.size,
      short_count: this.shortPositions.size,
      today_pnl: todayStats.today_pnl || 0,
      today_orders: todayStats.today_orders || 0,
      today_buys: todayStats.today_buys || 0,
      today_sells: todayStats.today_sells || 0,
      initial_capital: this.initialCapital
    };
  }

  getHoldings() {
    return Array.from(this.holdings.entries()).map(([token, holding]) => ({
      token: token,
      symbol: holding.symbol,
      qty: holding.qty,
      avg_price: holding.avgPrice,
      current_price: holding.currentPrice,
      invested_value: holding.investedValue,
      current_value: holding.currentValue,
      unrealized_pnl: holding.unrealizedPnl,
      unrealized_pnl_percent: holding.unrealizedPnlPercent
    }));
  }

  getHolding(token) {
    return this.holdings.get(token);
  }

  hasHolding(token) {
    const holding = this.holdings.get(token);
    return holding && holding.qty > 0;
  }

  async enableTrading() {
    this.isEnabled = true;
    db.setConfig('trading_enabled', 'true', this.channelId);
    await discordService.log('✅ **Paper Trading Enabled**', 'success');
    logger.info('✅ Paper trading enabled');
  }

  async disableTrading() {
    this.isEnabled = false;
    db.setConfig('trading_enabled', 'false', this.channelId);
    await discordService.log('⏸️ **Paper Trading Disabled**', 'warning');
    logger.info('⏸️ Paper trading disabled');
  }

  async resetPortfolio() {
    db.resetPortfolio(this.channelId);
    this.cashBalance = this.initialCapital;
    this.holdings.clear();
    this.shortPositions.clear();
    this.totalRealizedPnL = 0;
    this.totalInvested = 0;

    await discordService.log('🔄 **Portfolio Reset Complete**\nStarting fresh with initial capital', 'warning');
    logger.info('🔄 Portfolio reset complete');
  }

  async sendDailySummary() {
    const portfolio = this.getPortfolio();
    const todayStats = db.getTodayStats(this.channelId);
    const topPerformers = db.getTopPerformers(5, this.channelId);
    const worstPerformers = db.getWorstPerformers(5, this.channelId);

    let summary = '📊 **Daily Trading Summary**\n\n';
    summary += `**Portfolio:**\n`;
    summary += `💵 Cash: ₹${portfolio.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
    summary += `📊 Holdings: ₹${portfolio.holdings_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
    summary += `💰 Total: ₹${portfolio.total_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
    summary += `📈 Total P&L: ₹${portfolio.total_pnl.toFixed(2)} (${portfolio.pnl_percent.toFixed(2)}%)\n\n`;

    summary += `**Today's Activity:**\n`;
    summary += `📝 Orders: ${todayStats.today_orders || 0} (${todayStats.today_buys || 0} buys, ${todayStats.today_sells || 0} sells)\n`;
    summary += `💹 Realized P&L: ₹${(todayStats.today_pnl || 0).toFixed(2)}\n\n`;

    if (topPerformers && topPerformers.length > 0 && topPerformers[0].total_pnl > 0) {
      summary += `**Top Performers:**\n`;
      topPerformers.slice(0, 3).forEach((stock, index) => {
        summary += `${index + 1}. ${stock.symbol}: ₹${stock.total_pnl.toFixed(2)}\n`;
      });
      summary += '\n';
    }

    if (worstPerformers && worstPerformers.length > 0 && worstPerformers[0].total_pnl < 0) {
      summary += `**Worst Performers:**\n`;
      worstPerformers.slice(0, 3).forEach((stock, index) => {
        summary += `${index + 1}. ${stock.symbol}: ₹${stock.total_pnl.toFixed(2)}\n`;
      });
    }

    await discordService.log(summary, portfolio.today_pnl >= 0 ? 'success' : 'warning');
    logger.info('📊 Daily summary sent');
  }

  getConfig() {
    return {
      initial_capital: this.initialCapital,
      amount_per_trade: this.amountPerTrade,
      grid_percentage: this.gridPercentage,
      trading_enabled: this.isEnabled
    };
  }

  updateConfig(key, value) {
    switch (key) {
      case 'amount_per_trade':
        this.amountPerTrade = parseFloat(value);
        db.setConfig('amount_per_trade', value, this.channelId);
        logger.info(`💵 Amount per trade updated to: ₹${this.amountPerTrade}`);
        break;
      case 'grid_percentage':
        this.gridPercentage = parseFloat(value);
        db.setConfig('grid_percentage', value, this.channelId);
        logger.info(`📈 Grid percentage updated to: ${this.gridPercentage}%`);
        break;
      default:
        logger.warn(`Unknown config key: ${key}`);
    }
  }
}

module.exports = PaperTradingService;
