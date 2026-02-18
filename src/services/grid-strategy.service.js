const Decimal = require('decimal.js');
const zerodhaService = require('./zerodha.service');
const logger = require('../utils/logger');

class GridStrategyService {
  constructor() {
    this.isInitialized = false;
    this.isActive = false;
    this.grids = new Map();
    this.gridPercentage = 0.25; // Default 0.25%
    this.stopLossPercentage = 1; // Default 1% stop loss
    this.tokenToSymbolMap = new Map();
    this.lastProcessedTime = new Map();
    this.minIntervalMs = 5000; // Minimum 5 seconds between trades for same stock
    this.paperTradingService = null;
    this.sseServer = null;
  }

  setPaperTradingService(paperTradingService) {
    this.paperTradingService = paperTradingService;
  }

  setSSEServer(sseServer) {
    this.sseServer = sseServer;
  }

  restoreGridsFromHoldings() {
    if (!this.paperTradingService) {
      return;
    }

    const holdings = this.paperTradingService.getHoldings();
    if (holdings.length === 0) {
      return;
    }

    logger.info(`Restoring grids for ${holdings.length} existing holdings...`);

    holdings.forEach(holding => {
      const token = holding.token.toString();
      const symbol = holding.symbol;
      const avgPrice = holding.avgPrice;

      // Initialize grid with the holding's avg price as both reference and lastBuyPrice
      const gridData = {
        symbol: symbol,
        lastBuyPrice: avgPrice,
        lastSellPrice: null,
        referencePrice: avgPrice,
        buyCount: 1,
        sellCount: 0,
        totalPnl: 0,
        isActive: true
      };

      this.grids.set(token, gridData);
      logger.info(`Restored grid for ${symbol}: lastBuyPrice=${avgPrice.toFixed(2)}`);
    });
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

      // Load stop loss percentage
      if (process.env.STOP_LOSS_PERCENTAGE) {
        this.stopLossPercentage = parseFloat(process.env.STOP_LOSS_PERCENTAGE);
      }

      logger.info(`Grid percentage: ${this.gridPercentage}%`);
      logger.info(`Stop loss percentage: ${this.stopLossPercentage}%`);

      this.isInitialized = true;
      this.isActive = true;

      // Restore grids for existing holdings
      this.restoreGridsFromHoldings();

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

    // Check for SELL trigger (X% rise from last buy price or avg price)
    if (this.paperTradingService && this.paperTradingService.hasHolding(token)) {
      // If we don't have lastBuyPrice (e.g., after restart), use the holding's avgPrice
      let buyPriceToUse = gridData.lastBuyPrice;
      if (!buyPriceToUse) {
        const holdings = this.paperTradingService.getHoldings();
        const holding = holdings.find(h => h.token.toString() === token.toString());
        if (holding) {
          buyPriceToUse = holding.avgPrice;
          gridData.lastBuyPrice = holding.avgPrice; // Cache it for next time
          this.grids.set(token, gridData);
        }
      }

      if (buyPriceToUse) {
        const lastBuyPrice = new Decimal(buyPriceToUse);
        const sellThreshold = lastBuyPrice.mul(new Decimal(1).plus(gridPercent));
        const stopLossPercent = new Decimal(this.stopLossPercentage).div(100);
        const stopLossThreshold = lastBuyPrice.mul(new Decimal(1).minus(stopLossPercent));

        // Check for profit target
        if (price.gte(sellThreshold)) {
          this.triggerSell(token, symbol, price.toNumber(), gridData, 'TARGET');
          return;
        }

        // Check for stop loss
        if (price.lte(stopLossThreshold)) {
          this.triggerSell(token, symbol, price.toNumber(), gridData, 'STOPLOSS');
          return;
        }
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

      // Broadcast order notification
      if (this.sseServer) {
        this.sseServer.broadcastOrder({
          type: 'BUY',
          symbol,
          price: currentPrice,
          qty: result.qty,
          value: result.value,
          timestamp: Date.now()
        });
      }
    } else {
      if (result.message === 'Insufficient balance') {
        gridData.referencePrice = currentPrice;
        this.grids.set(token, gridData);
      }
      logger.warn(`BUY failed for ${symbol}: ${result.message}`);
    }
  }

  async triggerSell(token, symbol, currentPrice, gridData, reason = 'TARGET') {
    if (!this.paperTradingService || !this.paperTradingService.hasHolding(token)) {
      return;
    }

    this.lastProcessedTime.set(token, Date.now());

    const changePercent = ((currentPrice - gridData.lastBuyPrice) / gridData.lastBuyPrice * 100).toFixed(2);
    const reasonText = reason === 'STOPLOSS' ? 'STOP LOSS' : 'TARGET';
    logger.info(`SELL [${reasonText}]: ${symbol} ${changePercent}% (${gridData.lastBuyPrice} -> ${currentPrice})`);

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
      const pnlText = result.pnl >= 0 ? `+${result.pnl?.toFixed(2)}` : result.pnl?.toFixed(2);
      logger.info(`SELL [${reasonText}] executed: ${symbol} @ ${currentPrice} | P&L: ${pnlText}`);

      // Broadcast order notification
      if (this.sseServer) {
        this.sseServer.broadcastOrder({
          type: 'SELL',
          reason: reasonText,
          symbol,
          price: currentPrice,
          qty: result.qty,
          value: result.value,
          pnl: result.pnl,
          pnlPercent: result.pnlPercent,
          timestamp: Date.now()
        });
      }
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
