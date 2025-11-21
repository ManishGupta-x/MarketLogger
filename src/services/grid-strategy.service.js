const Decimal = require('decimal.js');
const discordService = require('./discord.service');
const zerodhaService = require('./zerodha.service');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class GridStrategyService {
  constructor(channelId = 'default') {
    this.channelId = channelId;
    this.isInitialized = false;
    this.isActive = false;
    this.grids = new Map();
    this.gridPercentage = 5.0;
    this.tokenToSymbolMap = new Map();
    this.lastProcessedTime = new Map();
    this.minIntervalMs = 5000; // Minimum 5 seconds between trades for same stock
    this.paperTradingService = null; // Will be set by ChannelManager

    // Price read tracking
    this.priceReadCounts = new Map();
    this.totalReadsProcessed = 0;
    this.statsFilePath = path.join(__dirname, '../../grid-stats.json');
    this.lastStatsSaveTime = Date.now();
    this.statsSaveInterval = 60000; // Save stats every 60 seconds
  }

  setPaperTradingService(paperTradingService) {
    this.paperTradingService = paperTradingService;
  }

  async loadInstruments() {
    try {
      logger.info('📥 Loading NSE instruments for grid strategy...');
      const instruments = await zerodhaService.kite.getInstruments('NSE');

      instruments.forEach(inst => {
        const symbol = `NSE:${inst.tradingsymbol}`;
        const token = typeof inst.instrument_token === 'number'
          ? inst.instrument_token
          : parseInt(inst.instrument_token);

        this.tokenToSymbolMap.set(token, symbol);
      });

      logger.info(`✅ Mapped ${this.tokenToSymbolMap.size} instruments for grid strategy`);
    } catch (error) {
      logger.error('❌ Error loading instruments:', error);
      throw error;
    }
  }

  async initialize(gridPercentage = null) {
    try {
      logger.info('📊 Initializing Grid Strategy Service...');

      // Load instruments to build token mapping
      await this.loadInstruments();

      // Load grid percentage: parameter > environment variable > default
      if (gridPercentage !== null) {
        this.gridPercentage = parseFloat(gridPercentage);
        logger.info(`📈 Grid percentage from parameter: ${this.gridPercentage}%`);
      } else {
        const envGridPercentage = process.env.GRID_PERCENTAGE;
        if (envGridPercentage) {
          this.gridPercentage = parseFloat(envGridPercentage);
          logger.info(`📈 Grid percentage from ENV: ${this.gridPercentage}%`);
        } else {
          logger.info(`📈 Grid percentage (default): ${this.gridPercentage}%`);
        }
      }

      this.isInitialized = true;
      logger.info('✅ Grid Strategy Service initialized');

      return true;
    } catch (error) {
      logger.error('❌ Failed to initialize grid strategy:', error);
      throw error;
    }
  }

  initializeGridForToken(token, symbol, currentPrice) {
    // Check if grid already exists
    if (this.grids.has(token)) {
      return;
    }

    // Initialize new grid
    const gridData = {
      symbol: symbol,
      lastBuyPrice: null,
      lastSellPrice: null,
      referencePrice: currentPrice,
      buyCount: 0,
      sellCount: 0,
      totalPnl: 0,
      isActive: true
    };

    this.grids.set(token, gridData);

    logger.info(`🆕 Initialized grid for ${symbol} at ₹${currentPrice}`);
  }

  processTicks(ticks) {
    if (!this.isInitialized || !this.isActive) {
      return;
    }

    this.totalReadsProcessed += ticks.length;

    ticks.forEach(tick => {
      const token = tick.instrument_token.toString();
      const currentPrice = tick.last_price;

      // Get symbol from token
      let symbol = this.tokenToSymbolMap.get(parseInt(token));
      if (symbol) {
        symbol = symbol.replace('NSE:', '');
      } else {
        return; // Skip if we don't have the symbol
      }

      // Track price reads per token
      const currentCount = this.priceReadCounts.get(token) || 0;
      this.priceReadCounts.set(token, currentCount + 1);

      // Update holding price if we have it
      if (this.paperTradingService && this.paperTradingService.hasHolding(token)) {
        this.paperTradingService.updateHoldingPrice(token, currentPrice);
      }

      // Check if we should skip this tick (too soon after last trade)
      const lastProcessed = this.lastProcessedTime.get(token);
      if (lastProcessed && (Date.now() - lastProcessed) < this.minIntervalMs) {
        return;
      }

      // Initialize grid if needed
      if (!this.grids.has(token)) {
        this.initializeGridForToken(token, symbol, currentPrice);
      }

      // Check grid levels
      this.checkGridLevels(token, symbol, currentPrice);
    });

    // Save stats periodically
    if (Date.now() - this.lastStatsSaveTime > this.statsSaveInterval) {
      this.saveStats();
    }
  }

  checkGridLevels(token, symbol, currentPrice) {
    const gridData = this.grids.get(token);
    if (!gridData || !gridData.isActive) {
      return;
    }

    const price = new Decimal(currentPrice);
    const refPrice = new Decimal(gridData.referencePrice);
    const gridPercent = new Decimal(this.gridPercentage).div(100);

    // Check for BUY trigger (X% drop from reference)
    const buyThreshold = refPrice.mul(new Decimal(1).minus(gridPercent));
    const dropPercent = refPrice.minus(price).div(refPrice).mul(100);

    if (price.lte(buyThreshold)) {
      console.log(`  🟢 [BUY TRIGGER] ${symbol} hit buy threshold!`);
      this.triggerBuy(token, symbol, price.toNumber(), gridData);
      return;
    }

    // Check for SELL trigger (X% rise from last buy price) - only if have holdings
    if (gridData.lastBuyPrice && this.paperTradingService && this.paperTradingService.hasHolding(token)) {
      const lastBuyPrice = new Decimal(gridData.lastBuyPrice);
      const sellThreshold = lastBuyPrice.mul(new Decimal(1).plus(gridPercent));
      const risePercent = price.minus(lastBuyPrice).div(lastBuyPrice).mul(100);

      console.log(`  🎯 [GRID] ${symbol} | LastBuy: ₹${gridData.lastBuyPrice.toFixed(2)} | Sell@: ₹${sellThreshold.toFixed(2)} | Rise: ${risePercent.toFixed(2)}%`);

      if (price.gte(sellThreshold)) {
        console.log(`  🔴 [SELL TRIGGER] ${symbol} hit sell threshold!`);
        this.triggerSell(token, symbol, price.toNumber(), gridData);
        return;
      }
    }
  }

  async triggerBuy(token, symbol, currentPrice, gridData) {
    // Record last processed time
    this.lastProcessedTime.set(token, Date.now());

    logger.info(`🎯 BUY trigger for ${symbol} at ₹${currentPrice} (ref: ₹${gridData.referencePrice})`);

    // Execute virtual buy order
    if (!this.paperTradingService) {
      logger.warn('⚠️ Paper trading service not set for grid strategy');
      return;
    }

    // Calculate execution reason details
    const dropPercent = ((gridData.referencePrice - currentPrice) / gridData.referencePrice * 100).toFixed(2);
    const executionReason = {
      type: 'BUY',
      referencePrice: gridData.referencePrice,
      currentPrice: currentPrice,
      changePercent: dropPercent,
      gridPercent: this.gridPercentage
    };

    const result = await this.paperTradingService.executeVirtualOrder(
      token,
      symbol,
      'BUY',
      currentPrice,
      gridData.buyCount + 1,
      gridData.referencePrice,
      executionReason
    );

    if (result.success) {
      // Update grid levels
      gridData.lastBuyPrice = currentPrice;
      gridData.referencePrice = currentPrice;
      gridData.buyCount++;

      this.grids.set(token, gridData);

      logger.info(`✅ BUY executed for ${symbol} | Grid level ${gridData.buyCount} | Ref updated to ₹${currentPrice}`);
    } else {
      logger.warn(`⚠️ BUY failed for ${symbol}: ${result.message}`);
    }
  }

  async triggerSell(token, symbol, currentPrice, gridData) {
    // Check if we have holdings to sell
    if (!this.paperTradingService) {
      logger.warn('⚠️ Paper trading service not set for grid strategy');
      return;
    }

    if (!this.paperTradingService.hasHolding(token)) {
      logger.warn(`No holdings to sell for ${symbol}`);
      return;
    }

    // Record last processed time
    this.lastProcessedTime.set(token, Date.now());

    logger.info(`🎯 SELL trigger for ${symbol} at ₹${currentPrice} (buy: ₹${gridData.lastBuyPrice})`);

    // Calculate execution reason details
    const risePercent = ((currentPrice - gridData.lastBuyPrice) / gridData.lastBuyPrice * 100).toFixed(2);
    const executionReason = {
      type: 'SELL',
      referencePrice: gridData.lastBuyPrice,
      currentPrice: currentPrice,
      changePercent: risePercent,
      gridPercent: this.gridPercentage
    };

    // Execute virtual sell order
    const result = await this.paperTradingService.executeVirtualOrder(
      token,
      symbol,
      'SELL',
      currentPrice,
      gridData.sellCount + 1,
      gridData.lastBuyPrice,
      executionReason
    );

    if (result.success) {
      // Update grid levels
      gridData.lastSellPrice = currentPrice;
      gridData.referencePrice = currentPrice;
      gridData.sellCount++;
      gridData.totalPnl = new Decimal(gridData.totalPnl).plus(result.pnl || 0).toNumber();

      this.grids.set(token, gridData);

      logger.info(`✅ SELL executed for ${symbol} | Grid level ${gridData.sellCount} | P&L: ₹${result.pnl.toFixed(2)} | Ref updated to ₹${currentPrice}`);
    } else {
      logger.warn(`⚠️ SELL failed for ${symbol}: ${result.message}`);
    }
  }

  getGridInfo(symbol) {
    // Find token by symbol
    let targetToken = null;

    for (const [token, gridSymbol] of this.tokenToSymbolMap.entries()) {
      const cleanSymbol = gridSymbol.replace('NSE:', '');
      if (cleanSymbol.toUpperCase() === symbol.toUpperCase()) {
        targetToken = token.toString();
        break;
      }
    }

    if (!targetToken) {
      return null;
    }

    const gridData = this.grids.get(targetToken);
    if (!gridData) {
      return null;
    }

    return {
      symbol: gridData.symbol,
      last_buy_price: gridData.lastBuyPrice,
      last_sell_price: gridData.lastSellPrice,
      reference_price: gridData.referencePrice,
      buy_count: gridData.buyCount,
      sell_count: gridData.sellCount,
      total_pnl: gridData.totalPnl,
      is_active: gridData.isActive,
      buy_threshold: gridData.referencePrice * (1 - this.gridPercentage / 100),
      sell_threshold: gridData.lastBuyPrice ? gridData.lastBuyPrice * (1 + this.gridPercentage / 100) : null
    };
  }

  getAllGrids() {
    const grids = [];

    for (const [token, gridData] of this.grids.entries()) {
      grids.push({
        token: token,
        symbol: gridData.symbol,
        last_buy_price: gridData.lastBuyPrice,
        last_sell_price: gridData.lastSellPrice,
        reference_price: gridData.referencePrice,
        buy_count: gridData.buyCount,
        sell_count: gridData.sellCount,
        total_pnl: gridData.totalPnl,
        is_active: gridData.isActive
      });
    }

    // Sort by total P&L descending
    grids.sort((a, b) => b.total_pnl - a.total_pnl);

    return grids;
  }

  getActiveGridsCount() {
    let count = 0;
    for (const [token, gridData] of this.grids.entries()) {
      if (gridData.isActive) {
        count++;
      }
    }
    return count;
  }

  async start() {
    if (!this.isInitialized) {
      logger.warn('Grid strategy not initialized');
      return false;
    }

    this.isActive = true;
    console.log(`\n🎯 ============================================`);
    console.log(`🎯 GRID TRADING STRATEGY STARTED`);
    console.log(`🎯 Grid Percentage: ${this.gridPercentage}%`);
    console.log(`🎯 Active Grids: ${this.getActiveGridsCount()}`);
    console.log(`🎯 Monitoring ${this.tokenToSymbolMap.size} stocks`);
    console.log(`🎯 ============================================\n`);

    await discordService.log('🎯 **Grid Trading Strategy Started**\n' +
      `Grid Percentage: ${this.gridPercentage}%\n` +
      `Active Grids: ${this.getActiveGridsCount()}`, 'success');

    logger.info('🎯 Grid strategy started');
    return true;
  }

  async stop() {
    this.isActive = false;
    await discordService.log('⏸️ **Grid Trading Strategy Stopped**', 'warning');
    logger.info('⏸️ Grid strategy stopped');
    return true;
  }

  async resetGrid(symbol) {
    // Find token by symbol
    let targetToken = null;

    for (const [token, gridSymbol] of this.tokenToSymbolMap.entries()) {
      const cleanSymbol = gridSymbol.replace('NSE:', '');
      if (cleanSymbol.toUpperCase() === symbol.toUpperCase()) {
        targetToken = token.toString();
        break;
      }
    }

    if (!targetToken) {
      return { success: false, message: 'Symbol not found' };
    }

    // Remove from memory
    this.grids.delete(targetToken);

    logger.info(`🔄 Grid reset for ${symbol}`);

    return { success: true, message: `Grid reset for ${symbol}` };
  }

  async resetAllGrids() {
    this.grids.clear();
    this.lastProcessedTime.clear();

    // This will be re-initialized on next price tick
    logger.info('🔄 All grids reset');

    await discordService.log('🔄 **All Grid Levels Reset**', 'warning');

    return { success: true, message: 'All grids reset' };
  }

  updateGridPercentage(percentage) {
    this.gridPercentage = parseFloat(percentage);

    logger.info(`📈 Grid percentage updated to: ${this.gridPercentage}%`);

    return { success: true, message: `Grid percentage updated to ${this.gridPercentage}%` };
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      active: this.isActive,
      grid_percentage: this.gridPercentage,
      total_grids: this.grids.size,
      active_grids: this.getActiveGridsCount(),
      tokens_mapped: this.tokenToSymbolMap.size
    };
  }

  async getTopGrids(limit = 10) {
    const grids = this.getAllGrids();
    return grids.slice(0, limit);
  }

  saveStats() {
    try {
      const stats = {
        timestamp: new Date().toISOString(),
        total_reads_processed: this.totalReadsProcessed,
        active_tokens: this.priceReadCounts.size,
        price_reads_per_token: {}
      };

      // Convert Map to object and add symbol names
      for (const [token, count] of this.priceReadCounts.entries()) {
        const symbol = this.tokenToSymbolMap.get(parseInt(token));
        const cleanSymbol = symbol ? symbol.replace('NSE:', '') : token;
        stats.price_reads_per_token[cleanSymbol] = {
          token: token,
          read_count: count
        };
      }

      // Sort by read count
      const sortedStats = Object.entries(stats.price_reads_per_token)
        .sort((a, b) => b[1].read_count - a[1].read_count)
        .reduce((obj, [key, value]) => {
          obj[key] = value;
          return obj;
        }, {});

      stats.price_reads_per_token = sortedStats;

      // Write to file
      fs.writeFileSync(this.statsFilePath, JSON.stringify(stats, null, 2), 'utf8');

      console.log(`\n📊 [STATS SAVED] Total reads: ${this.totalReadsProcessed} | Active tokens: ${this.priceReadCounts.size} | File: grid-stats.json\n`);

      this.lastStatsSaveTime = Date.now();
    } catch (error) {
      logger.error('Failed to save stats:', error);
    }
  }

  getStats() {
    try {
      if (fs.existsSync(this.statsFilePath)) {
        const data = fs.readFileSync(this.statsFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Failed to read stats:', error);
    }
    return null;
  }
}

module.exports = GridStrategyService;
