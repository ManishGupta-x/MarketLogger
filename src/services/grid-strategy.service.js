const Decimal = require('decimal.js');
const zerodhaService = require('./zerodha.service');
const logger = require('../utils/logger');

class GridStrategyService {
  constructor() {
    this.isInitialized = false;
    this.isActive = false;
    this.grids = new Map();
    this.gridPercentage = 0.25; // Default 0.25%
    this.tokenToSymbolMap = new Map();
    this.lastProcessedTime = new Map();
    this.minIntervalMs = 5000; // Minimum 5 seconds between trades for same stock
    this.paperTradingService = null;
  }

  setPaperTradingService(paperTradingService) {
    this.paperTradingService = paperTradingService;
  }

  async loadInstruments() {
    try {
      logger.info('Loading NSE instruments for grid strategy...');
      const instruments = await zerodhaService.kite.getInstruments('NSE');

      instruments.forEach(inst => {
        const symbol = `NSE:${inst.tradingsymbol}`;
        const token = typeof inst.instrument_token === 'number'
          ? inst.instrument_token
          : parseInt(inst.instrument_token);

        this.tokenToSymbolMap.set(token, symbol);
      });

      logger.info(`Mapped ${this.tokenToSymbolMap.size} instruments`);
    } catch (error) {
      logger.error('Error loading instruments:', error);
      throw error;
    }
  }

  async initialize(gridPercentage = null) {
    try {
      logger.info('Initializing Grid Strategy Service...');

      // Load instruments to build token mapping
      await this.loadInstruments();

      // Load grid percentage: parameter > environment variable > default
      if (gridPercentage !== null) {
        this.gridPercentage = parseFloat(gridPercentage);
      } else if (process.env.GRID_PERCENTAGE) {
        this.gridPercentage = parseFloat(process.env.GRID_PERCENTAGE);
      }

      logger.info(`Grid percentage: ${this.gridPercentage}%`);

      this.isInitialized = true;
      this.isActive = true;
      logger.info('Grid Strategy Service initialized');

      return true;
    } catch (error) {
      logger.error('Failed to initialize grid strategy:', error);
      throw error;
    }
  }

  initializeGridForToken(token, symbol, currentPrice) {
    if (this.grids.has(token)) {
      return;
    }

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
    logger.info(`Initialized grid for ${symbol} at ${currentPrice}`);
  }

  processTicks(ticks) {
    if (!this.isInitialized || !this.isActive) {
      return;
    }

    ticks.forEach(tick => {
      const token = tick.instrument_token.toString();
      const currentPrice = tick.last_price;

      // Get symbol from token
      let symbol = this.tokenToSymbolMap.get(parseInt(token));
      if (symbol) {
        symbol = symbol.replace('NSE:', '');
      } else {
        return;
      }

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

    if (price.lte(buyThreshold)) {
      this.triggerBuy(token, symbol, price.toNumber(), gridData);
      return;
    }

    // Check for SELL trigger (X% rise from last buy price)
    if (gridData.lastBuyPrice && this.paperTradingService && this.paperTradingService.hasHolding(token)) {
      const lastBuyPrice = new Decimal(gridData.lastBuyPrice);
      const sellThreshold = lastBuyPrice.mul(new Decimal(1).plus(gridPercent));

      if (price.gte(sellThreshold)) {
        this.triggerSell(token, symbol, price.toNumber(), gridData);
        return;
      }
    }
  }

  async triggerBuy(token, symbol, currentPrice, gridData) {
    this.lastProcessedTime.set(token, Date.now());

    const dropPercent = ((gridData.referencePrice - currentPrice) / gridData.referencePrice * 100).toFixed(2);
    logger.info(`BUY trigger: ${symbol} dropped ${dropPercent}% (${gridData.referencePrice} -> ${currentPrice})`);

    if (!this.paperTradingService) {
      logger.warn('Paper trading service not set');
      return;
    }

    const result = await this.paperTradingService.executeVirtualOrder(
      token,
      symbol,
      'BUY',
      currentPrice,
      gridData.buyCount + 1,
      gridData.referencePrice
    );

    if (result.success) {
      gridData.lastBuyPrice = currentPrice;
      gridData.referencePrice = currentPrice;
      gridData.buyCount++;
      this.grids.set(token, gridData);
      logger.info(`BUY executed: ${symbol} @ ${currentPrice} | Grid level ${gridData.buyCount}`);
    } else {
      if (result.message === 'Insufficient balance') {
        gridData.referencePrice = currentPrice;
        this.grids.set(token, gridData);
      }
      logger.warn(`BUY failed for ${symbol}: ${result.message}`);
    }
  }

  async triggerSell(token, symbol, currentPrice, gridData) {
    if (!this.paperTradingService || !this.paperTradingService.hasHolding(token)) {
      return;
    }

    this.lastProcessedTime.set(token, Date.now());

    const risePercent = ((currentPrice - gridData.lastBuyPrice) / gridData.lastBuyPrice * 100).toFixed(2);
    logger.info(`SELL trigger: ${symbol} rose ${risePercent}% (${gridData.lastBuyPrice} -> ${currentPrice})`);

    const result = await this.paperTradingService.executeVirtualOrder(
      token,
      symbol,
      'SELL',
      currentPrice,
      gridData.sellCount + 1,
      gridData.lastBuyPrice
    );

    if (result.success) {
      gridData.lastSellPrice = currentPrice;
      gridData.referencePrice = currentPrice;
      gridData.sellCount++;
      gridData.totalPnl = new Decimal(gridData.totalPnl).plus(result.pnl || 0).toNumber();
      this.grids.set(token, gridData);
      logger.info(`SELL executed: ${symbol} @ ${currentPrice} | P&L: ${result.pnl?.toFixed(2)}`);
    } else {
      logger.warn(`SELL failed for ${symbol}: ${result.message}`);
    }
  }

  getGridInfo(symbol) {
    for (const [token, gridSymbol] of this.tokenToSymbolMap.entries()) {
      const cleanSymbol = gridSymbol.replace('NSE:', '');
      if (cleanSymbol.toUpperCase() === symbol.toUpperCase()) {
        const gridData = this.grids.get(token.toString());
        if (gridData) {
          return {
            symbol: gridData.symbol,
            lastBuyPrice: gridData.lastBuyPrice,
            lastSellPrice: gridData.lastSellPrice,
            referencePrice: gridData.referencePrice,
            buyCount: gridData.buyCount,
            sellCount: gridData.sellCount,
            totalPnl: gridData.totalPnl,
            isActive: gridData.isActive
          };
        }
      }
    }
    return null;
  }

  getAllGrids() {
    const grids = [];
    for (const [token, gridData] of this.grids.entries()) {
      grids.push({
        token,
        symbol: gridData.symbol,
        lastBuyPrice: gridData.lastBuyPrice,
        referencePrice: gridData.referencePrice,
        buyCount: gridData.buyCount,
        sellCount: gridData.sellCount,
        totalPnl: gridData.totalPnl
      });
    }
    return grids.sort((a, b) => b.totalPnl - a.totalPnl);
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      active: this.isActive,
      gridPercentage: this.gridPercentage,
      totalGrids: this.grids.size,
      tokensMapped: this.tokenToSymbolMap.size
    };
  }

  start() {
    this.isActive = true;
    logger.info('Grid strategy started');
  }

  stop() {
    this.isActive = false;
    logger.info('Grid strategy stopped');
  }
}

module.exports = new GridStrategyService();
