const Decimal = require('decimal.js');
const zerodhaService = require('./zerodha.service');
const logger = require('../utils/logger');
const marketRegimeService = require('./market-regime.service');
const stockScreenerService = require('./stock-screener.service');
const adaptiveExitService = require('./adaptive-exit.service');
const technicalIndicatorsService = require('./technical-indicators.service');
const adaptiveConfig = require('../config/adaptive-config');
const portfolioRiskService = require('./portfolio-risk.service');
const costCalculatorService = require('./cost-calculator.service');

class GridStrategyService {
  constructor() {
    this.isInitialized = false;
    this.isActive = false;
    this.grids = new Map();
    this.gridPercentage = 0.25; // Default 0.25% for buying
    this.targetPercentage = 0.25; // Default 0.25% for selling (target)
    this.stopLossPercentage = 1; // Default 1% stop loss
    this.tokenToSymbolMap = new Map();
    this.lastProcessedTime = new Map();
    this.minIntervalMs = 5000; // Minimum 5 seconds between trades for same stock
    this.paperTradingService = null;
    this.sseServer = null;
    this.database = null;

    // Adaptive trading properties
    this.adaptiveMode = process.env.ADAPTIVE_MODE !== 'false'; // Default enabled
    this.currentRegime = 'SIDEWAYS';
    this.activeStockList = [];
    this.regimeCheckInterval = null;
    this.lastRegimeCheck = 0;
    this.regimeCheckFrequency = adaptiveConfig.regime.checkFrequency;
    this.screeningInterval = null;
  }

  setPaperTradingService(paperTradingService) {
    this.paperTradingService = paperTradingService;
  }

  setSSEServer(sseServer) {
    this.sseServer = sseServer;
  }

  setDatabase(database) {
    this.database = database;
    // Pass database to adaptive services
    marketRegimeService.setDatabase(database);
    stockScreenerService.setDatabase(database);
    adaptiveExitService.setDatabase(database);
    portfolioRiskService.setDatabase(database);
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

      // Load target percentage (for selling)
      if (process.env.TARGET_PERCENTAGE) {
        this.targetPercentage = parseFloat(process.env.TARGET_PERCENTAGE);
      } else {
        this.targetPercentage = this.gridPercentage; // Default to grid percentage
      }

      // Load stop loss percentage
      if (process.env.STOP_LOSS_PERCENTAGE) {
        this.stopLossPercentage = parseFloat(process.env.STOP_LOSS_PERCENTAGE);
      }

      logger.info(`Grid percentage (buy): ${this.gridPercentage}%`);
      logger.info(`Target percentage (sell): ${this.targetPercentage}%`);
      logger.info(`Stop loss percentage: ${this.stopLossPercentage}%`);

      this.isInitialized = true;
      this.isActive = true;

      // Restore grids for existing holdings
      this.restoreGridsFromHoldings();

      // Initialize adaptive trading services
      if (this.adaptiveMode) {
        await this.initializeAdaptiveMode();
      }

      logger.info('Grid Strategy Service initialized');

      return true;
    } catch (error) {
      logger.error('Failed to initialize grid strategy:', error);
      throw error;
    }
  }

  async initializeAdaptiveMode() {
    logger.info('Initializing Adaptive Trading Mode...');

    try {
      // Initialize market regime service
      marketRegimeService.initialize();

      // Initialize stock screener with token mapping
      stockScreenerService.initialize(this.tokenToSymbolMap);

      // Initialize adaptive exit service
      adaptiveExitService.initialize();

      // Initialize portfolio risk service
      if (this.paperTradingService) {
        portfolioRiskService.initialize(this.paperTradingService);
      }

      // Initialize cost calculator
      costCalculatorService.initialize();

      // Start regime monitoring
      this.startRegimeMonitoring();

      // Start periodic stock screening
      this.startStockScreening();

      logger.info('Adaptive Trading Mode initialized');
      logger.info(`Regime check frequency: ${this.regimeCheckFrequency / 1000}s`);
      logger.info(`Stock screening frequency: ${adaptiveConfig.screening.screenFrequency / 1000}s`);
      logger.info(`Sector diversification: ${process.env.SECTOR_DIVERSIFICATION !== 'false' ? 'enabled' : 'disabled'}`);

    } catch (error) {
      logger.error('Failed to initialize adaptive mode:', error);
      // Fall back to non-adaptive mode
      this.adaptiveMode = false;
    }
  }

  startRegimeMonitoring() {
    // Clear existing interval if any
    if (this.regimeCheckInterval) {
      clearInterval(this.regimeCheckInterval);
    }

    this.regimeCheckInterval = setInterval(() => {
      this.updateRegimeAndStocks();
    }, this.regimeCheckFrequency);

    logger.info('Regime monitoring started');
  }

  startStockScreening() {
    // Clear existing interval if any
    if (this.screeningInterval) {
      clearInterval(this.screeningInterval);
    }

    // Run initial screening after a delay (allow price data to accumulate)
    setTimeout(async () => {
      await this.runStockScreening();
    }, 60000); // Wait 1 minute for initial data

    this.screeningInterval = setInterval(async () => {
      await this.runStockScreening();
    }, adaptiveConfig.screening.screenFrequency);

    logger.info('Stock screening started');
  }

  async runStockScreening() {
    try {
      const results = await stockScreenerService.screenStocks();
      if (results) {
        this.updateActiveStocksForRegime(this.currentRegime);
      }
    } catch (error) {
      logger.error('Stock screening failed:', error);
    }
  }

  updateRegimeAndStocks() {
    if (!this.adaptiveMode) return;

    try {
      const regimeResult = marketRegimeService.updateRegime();

      if (regimeResult.changed) {
        const previousRegime = this.currentRegime;
        this.currentRegime = regimeResult.newRegime;

        logger.info(`Market regime changed: ${previousRegime} -> ${this.currentRegime} (confidence: ${regimeResult.confidence.toFixed(1)}%)`);

        // Update active stocks for new regime
        this.updateActiveStocksForRegime(this.currentRegime);

        // Broadcast regime change via SSE
        if (this.sseServer) {
          this.sseServer.broadcastRegimeChange({
            previousRegime,
            newRegime: this.currentRegime,
            confidence: regimeResult.confidence,
            activeStocks: this.activeStockList.map(s => s.symbol),
            timestamp: Date.now()
          });
        }
      }
    } catch (error) {
      logger.error('Error updating regime:', error);
    }
  }

  updateActiveStocksForRegime(regime) {
    this.activeStockList = stockScreenerService.getTopStocks(regime);
    const symbols = this.activeStockList.map(s => s.symbol).join(', ');
    logger.info(`Active stocks for ${regime}: ${symbols || 'None (screening pending)'}`);
  }

  isStockActiveForTrading(token) {
    // If adaptive mode is off or no screening done yet, allow all stocks
    if (!this.adaptiveMode || this.activeStockList.length === 0) {
      return true;
    }
    return this.activeStockList.some(s => s.token === token);
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

    // Feed ticks to adaptive services if enabled
    if (this.adaptiveMode) {
      marketRegimeService.processTicks(ticks);
      stockScreenerService.processTicks(ticks);
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

      // Skip index tokens for trading (only used for regime detection)
      const nifty50Token = adaptiveConfig.regime.nifty50Token.toString();
      const niftyBankToken = adaptiveConfig.regime.niftyBankToken.toString();
      if (token === nifty50Token || token === niftyBankToken) {
        return;
      }

      // Update holding price if we have it
      if (this.paperTradingService && this.paperTradingService.hasHolding(token)) {
        this.paperTradingService.updateHoldingPrice(token, currentPrice);

        // Update adaptive exit service
        if (this.adaptiveMode) {
          adaptiveExitService.updatePosition(token, currentPrice);
        }
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
      // In adaptive mode, only buy stocks in active list
      if (this.adaptiveMode && !this.isStockActiveForTrading(token)) {
        // Update reference price but don't buy
        gridData.referencePrice = currentPrice;
        this.grids.set(token, gridData);
        return;
      }
      this.triggerBuy(token, symbol, price.toNumber(), gridData);
      return;
    }

    // Check for SELL trigger
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
        // Use adaptive exit logic if enabled
        if (this.adaptiveMode) {
          const exitResult = adaptiveExitService.evaluateExit(token, currentPrice);

          if (exitResult.shouldExit) {
            // Pass the full exit result for slippage tracking
            this.triggerSell(token, symbol, exitResult.exitPrice, gridData, exitResult.reason, exitResult);
            return;
          }
        } else {
          // Original fixed stop loss / target logic
          const lastBuyPrice = new Decimal(buyPriceToUse);
          const targetPercent = new Decimal(this.targetPercentage).div(100);
          const sellThreshold = lastBuyPrice.mul(new Decimal(1).plus(targetPercent));
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
  }

  async triggerBuy(token, symbol, currentPrice, gridData) {
    this.lastProcessedTime.set(token, Date.now());

    const dropPercent = ((gridData.referencePrice - currentPrice) / gridData.referencePrice * 100).toFixed(2);
    logger.info(`BUY trigger: ${symbol} dropped ${dropPercent}% (${gridData.referencePrice} -> ${currentPrice})`);

    if (!this.paperTradingService) {
      logger.warn('Paper trading service not set');
      return;
    }

    // Check portfolio risk before buying
    if (this.adaptiveMode) {
      const portfolio = this.paperTradingService.getPortfolio();
      const riskCheck = portfolioRiskService.updateAndCheck(portfolio);

      if (!riskCheck.tradingAllowed) {
        logger.warn(`BUY blocked by risk management: ${riskCheck.haltReason}`);
        // Update reference price but don't buy
        gridData.referencePrice = currentPrice;
        this.grids.set(token, gridData);
        return;
      }

      // Check if this specific buy is allowed
      const orderValue = this.paperTradingService.amountPerTrade;
      const canBuyResult = portfolioRiskService.canBuy(orderValue);
      if (!canBuyResult.allowed) {
        logger.warn(`BUY blocked: ${canBuyResult.reason} - ${canBuyResult.message}`);
        gridData.referencePrice = currentPrice;
        this.grids.set(token, gridData);
        return;
      }

      // Log any warnings
      if (riskCheck.warnings && riskCheck.warnings.length > 0) {
        riskCheck.warnings.forEach(w => logger.info(`Risk warning: ${w.message}`));
      }
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

      // Track position for adaptive exits
      if (this.adaptiveMode) {
        adaptiveExitService.onPositionEntry(token, symbol, currentPrice, result.qty);
      }

      // Broadcast order notification
      if (this.sseServer) {
        this.sseServer.broadcastOrder({
          type: 'BUY',
          symbol,
          price: currentPrice,
          qty: result.qty,
          value: result.value,
          regime: this.currentRegime,
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

  async triggerSell(token, symbol, currentPrice, gridData, reason = 'TARGET', exitData = null) {
    if (!this.paperTradingService || !this.paperTradingService.hasHolding(token)) {
      return;
    }

    this.lastProcessedTime.set(token, Date.now());

    // Use slippage-adjusted price if provided
    const effectivePrice = exitData?.exitPrice || currentPrice;
    const originalPrice = exitData?.originalPrice || currentPrice;
    const slippage = exitData?.slippage || 0;

    const changePercent = ((effectivePrice - gridData.lastBuyPrice) / gridData.lastBuyPrice * 100).toFixed(2);
    const reasonText = reason === 'STOPLOSS' || reason === 'BACKSTOP_STOPLOSS' ? 'STOP LOSS' : reason;

    let logMessage = `SELL [${reasonText}]: ${symbol} ${changePercent}% (${gridData.lastBuyPrice} -> ${effectivePrice})`;
    if (slippage > 0) {
      logMessage += ` [slippage: ${slippage.toFixed(2)}]`;
    }
    logger.info(logMessage);

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

      // Close position tracking for adaptive exits
      if (this.adaptiveMode) {
        adaptiveExitService.closePosition(token, currentPrice, reason);
      }

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
          regime: this.currentRegime,
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
    const status = {
      initialized: this.isInitialized,
      active: this.isActive,
      gridPercentage: this.gridPercentage,
      totalGrids: this.grids.size,
      tokensMapped: this.tokenToSymbolMap.size,
      adaptiveMode: this.adaptiveMode
    };

    if (this.adaptiveMode) {
      status.regime = {
        current: this.currentRegime,
        ...marketRegimeService.getRegime()
      };
      status.activeStocks = this.activeStockList.map(s => s.symbol);
      status.adaptiveExit = adaptiveExitService.getStatus();
      status.portfolioRisk = portfolioRiskService.getStatus();
      status.costCalculator = costCalculatorService.getStatus();
    }

    return status;
  }

  start() {
    this.isActive = true;
    logger.info('Grid strategy started');
  }

  stop() {
    this.isActive = false;

    // Clean up adaptive mode intervals
    if (this.regimeCheckInterval) {
      clearInterval(this.regimeCheckInterval);
      this.regimeCheckInterval = null;
    }
    if (this.screeningInterval) {
      clearInterval(this.screeningInterval);
      this.screeningInterval = null;
    }

    logger.info('Grid strategy stopped');
  }

  // Get adaptive trading info
  getAdaptiveInfo() {
    if (!this.adaptiveMode) {
      return { enabled: false };
    }

    return {
      enabled: true,
      regime: marketRegimeService.getRegime(),
      regimeHistory: marketRegimeService.getRegimeHistory(10),
      activeStocks: this.activeStockList,
      rankings: stockScreenerService.getAllRankings(),
      positions: adaptiveExitService.getAllPositions(),
      dataStatus: marketRegimeService.getDataStatus(),
      riskMetrics: portfolioRiskService.getMetrics(),
      gapStatus: adaptiveExitService.getGapStatus(),
      costInfo: costCalculatorService.getChargeRates()
    };
  }

  // Get risk status for API
  getRiskStatus() {
    return portfolioRiskService.getStatus();
  }

  // Manually resume trading after halt
  forceResumeTrading() {
    portfolioRiskService.forceResumeTrading();
    return { success: true, message: 'Trading resumed' };
  }

  // Estimate costs for a trade
  estimateTradeCosts(price, qty, targetPercent = 0.25) {
    return costCalculatorService.estimateTradeCosts(price, qty, targetPercent);
  }
}

module.exports = new GridStrategyService();
