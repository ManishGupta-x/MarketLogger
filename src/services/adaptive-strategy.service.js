const Decimal = require('decimal.js');
const zerodhaService = require('./zerodha.service');
const logger = require('../utils/logger');
const marketRegimeService = require('./market-regime.service');
const stockScreenerService = require('./stock-screener.service');
const adaptiveExitService = require('./adaptive-exit.service');
const adaptiveEntryService = require('./adaptive-entry.service');
const technicalIndicatorsService = require('./technical-indicators.service');
const adaptiveConfig = require('../config/adaptive-config');
const portfolioRiskService = require('./portfolio-risk.service');
const costCalculatorService = require('./cost-calculator.service');

/**
 * Adaptive Strategy Service
 * Manages the complete adaptive trading system:
 * - Market regime detection (BULLISH/BEARISH/SIDEWAYS)
 * - Stock screening and selection (top 10 per regime)
 * - Signal-based entry (RSI, EMA, momentum)
 * - Adaptive exits (trailing stop, rapid decline, momentum exhaustion)
 */
class AdaptiveStrategyService {
  constructor() {
    this.isInitialized = false;
    this.isActive = false;
    this.tokenToSymbolMap = new Map();
    this.lastProcessedTime = new Map();
    this.minIntervalMs = 5000; // Minimum 5 seconds between trades for same stock
    this.paperTradingService = null;
    this.sseServer = null;
    this.database = null;

    // Position tracking (replaces old grids Map)
    this.positions = new Map(); // token -> position data

    // Adaptive trading properties
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

  /**
   * Restore position tracking from existing holdings
   */
  restorePositionsFromHoldings() {
    if (!this.paperTradingService) {
      return;
    }

    const holdings = this.paperTradingService.getHoldings();
    if (holdings.length === 0) {
      return;
    }

    logger.info(`Restoring positions for ${holdings.length} existing holdings...`);

    holdings.forEach(holding => {
      const token = holding.token.toString();
      const symbol = holding.symbol;
      const avgPrice = holding.avgPrice;

      const positionData = {
        symbol: symbol,
        lastBuyPrice: avgPrice,
        lastSellPrice: null,
        buyCount: 1,
        sellCount: 0,
        totalPnl: 0,
        isActive: true
      };

      this.positions.set(token, positionData);
      logger.info(`Restored position for ${symbol}: avgPrice=${avgPrice.toFixed(2)}`);
    });
  }

  async loadInstruments() {
    try {
      logger.info('Loading NSE instruments...');
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

  async initialize() {
    try {
      logger.info('Initializing Adaptive Strategy Service...');

      // Load instruments to build token mapping
      await this.loadInstruments();

      this.isInitialized = true;
      this.isActive = true;

      // Restore positions for existing holdings
      this.restorePositionsFromHoldings();

      // Initialize all adaptive services
      await this.initializeAdaptiveServices();

      logger.info('Adaptive Strategy Service initialized');

      return true;
    } catch (error) {
      logger.error('Failed to initialize adaptive strategy:', error);
      throw error;
    }
  }

  async initializeAdaptiveServices() {
    logger.info('Initializing Adaptive Trading Services...');

    try {
      // Initialize market regime service
      marketRegimeService.initialize();

      // Initialize stock screener with token mapping
      stockScreenerService.initialize(this.tokenToSymbolMap);

      // Initialize adaptive exit service
      adaptiveExitService.initialize();

      // Initialize adaptive entry service
      adaptiveEntryService.initialize();

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

      logger.info('All adaptive services initialized');
      logger.info(`Regime check frequency: ${this.regimeCheckFrequency / 1000}s`);
      logger.info(`Stock screening frequency: ${adaptiveConfig.screening.screenFrequency / 1000}s`);
      logger.info(`Sector diversification: ${process.env.SECTOR_DIVERSIFICATION !== 'false' ? 'enabled' : 'disabled'}`);

    } catch (error) {
      logger.error('Failed to initialize adaptive services:', error);
      throw error;
    }
  }

  startRegimeMonitoring() {
    if (this.regimeCheckInterval) {
      clearInterval(this.regimeCheckInterval);
    }

    this.regimeCheckInterval = setInterval(() => {
      this.updateRegimeAndStocks();
    }, this.regimeCheckFrequency);

    logger.info('Regime monitoring started');
  }

  startStockScreening() {
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
    // If no screening done yet, don't allow trades (wait for first screening)
    if (this.activeStockList.length === 0) {
      return false;
    }
    return this.activeStockList.some(s => s.token === token);
  }

  initializePositionForToken(token, symbol) {
    if (this.positions.has(token)) {
      return;
    }

    const positionData = {
      symbol: symbol,
      lastBuyPrice: null,
      lastSellPrice: null,
      buyCount: 0,
      sellCount: 0,
      totalPnl: 0,
      isActive: true
    };

    this.positions.set(token, positionData);
  }

  processTicks(ticks) {
    if (!this.isInitialized || !this.isActive) {
      return;
    }

    // Feed ticks to adaptive services
    marketRegimeService.processTicks(ticks);
    stockScreenerService.processTicks(ticks);

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
        adaptiveExitService.updatePosition(token, currentPrice);
      }

      // Check if we should skip this tick (too soon after last trade)
      const lastProcessed = this.lastProcessedTime.get(token);
      if (lastProcessed && (Date.now() - lastProcessed) < this.minIntervalMs) {
        return;
      }

      // Initialize position tracking if needed
      if (!this.positions.has(token)) {
        this.initializePositionForToken(token, symbol);
      }

      // Evaluate entry and exit signals
      this.evaluateSignals(token, symbol, currentPrice);
    });
  }

  evaluateSignals(token, symbol, currentPrice) {
    const positionData = this.positions.get(token);
    if (!positionData || !positionData.isActive) {
      return;
    }

    // Check for BUY signal
    if (this.isStockActiveForTrading(token)) {
      // Only evaluate if we don't already hold this stock
      if (!this.paperTradingService || !this.paperTradingService.hasHolding(token)) {
        const entryResult = adaptiveEntryService.evaluateEntry(token, currentPrice, this.currentRegime);

        if (entryResult.shouldEnter) {
          logger.info(`Entry signal: ${symbol} [${this.currentRegime}] Score: ${entryResult.score}`);
          if (entryResult.reasons && entryResult.reasons.length > 0) {
            logger.debug(`Entry reasons: ${entryResult.reasons.join(', ')}`);
          }
          this.executeBuy(token, symbol, currentPrice, positionData, entryResult);
          return;
        }
      }
    }

    // Check for SELL signal
    if (this.paperTradingService && this.paperTradingService.hasHolding(token)) {
      // Get buy price from position or holding
      let buyPriceToUse = positionData.lastBuyPrice;
      if (!buyPriceToUse) {
        const holdings = this.paperTradingService.getHoldings();
        const holding = holdings.find(h => h.token.toString() === token.toString());
        if (holding) {
          buyPriceToUse = holding.avgPrice;
          positionData.lastBuyPrice = holding.avgPrice;
          this.positions.set(token, positionData);
        }
      }

      if (buyPriceToUse) {
        const exitResult = adaptiveExitService.evaluateExit(token, currentPrice);

        if (exitResult.shouldExit) {
          this.executeSell(token, symbol, exitResult.exitPrice, positionData, exitResult.reason, exitResult);
          return;
        }
      }
    }
  }

  async executeBuy(token, symbol, currentPrice, positionData, entryResult) {
    this.lastProcessedTime.set(token, Date.now());

    logger.info(`BUY signal: ${symbol} @ ${currentPrice} [${this.currentRegime}] Score: ${entryResult.score}/100`);

    if (!this.paperTradingService) {
      logger.warn('Paper trading service not set');
      return;
    }

    // Check portfolio risk before buying
    const portfolio = this.paperTradingService.getPortfolio();
    const riskCheck = portfolioRiskService.updateAndCheck(portfolio);

    if (!riskCheck.tradingAllowed) {
      logger.warn(`BUY blocked by risk management: ${riskCheck.haltReason}`);
      return;
    }

    // Check if this specific buy is allowed
    const orderValue = this.paperTradingService.amountPerTrade;
    const canBuyResult = portfolioRiskService.canBuy(orderValue);
    if (!canBuyResult.allowed) {
      logger.warn(`BUY blocked: ${canBuyResult.reason} - ${canBuyResult.message}`);
      return;
    }

    // Log any warnings
    if (riskCheck.warnings && riskCheck.warnings.length > 0) {
      riskCheck.warnings.forEach(w => logger.info(`Risk warning: ${w.message}`));
    }

    const result = await this.paperTradingService.executeVirtualOrder(
      token,
      symbol,
      'BUY',
      currentPrice,
      positionData.buyCount + 1,
      currentPrice
    );

    if (result.success) {
      positionData.lastBuyPrice = currentPrice;
      positionData.buyCount++;
      this.positions.set(token, positionData);
      logger.info(`BUY executed: ${symbol} @ ${currentPrice} | Qty: ${result.qty}`);

      // Track position for adaptive exits
      adaptiveExitService.onPositionEntry(token, symbol, currentPrice, result.qty);

      // Broadcast order notification
      if (this.sseServer) {
        this.sseServer.broadcastOrder({
          type: 'BUY',
          symbol,
          price: currentPrice,
          qty: result.qty,
          value: result.value,
          regime: this.currentRegime,
          entryScore: entryResult.score,
          timestamp: Date.now()
        });
      }
    } else {
      logger.warn(`BUY failed for ${symbol}: ${result.message}`);
    }
  }

  async executeSell(token, symbol, currentPrice, positionData, reason, exitData = null) {
    if (!this.paperTradingService || !this.paperTradingService.hasHolding(token)) {
      return;
    }

    this.lastProcessedTime.set(token, Date.now());

    // Use slippage-adjusted price if provided
    const effectivePrice = exitData?.exitPrice || currentPrice;
    const slippage = exitData?.slippage || 0;

    const changePercent = ((effectivePrice - positionData.lastBuyPrice) / positionData.lastBuyPrice * 100).toFixed(2);
    const reasonText = reason === 'STOPLOSS' || reason === 'BACKSTOP_STOPLOSS' ? 'STOP LOSS' : reason;

    let logMessage = `SELL [${reasonText}]: ${symbol} ${changePercent}% (${positionData.lastBuyPrice} -> ${effectivePrice})`;
    if (slippage > 0) {
      logMessage += ` [slippage: ${slippage.toFixed(2)}]`;
    }
    logger.info(logMessage);

    const result = await this.paperTradingService.executeVirtualOrder(
      token,
      symbol,
      'SELL',
      currentPrice,
      positionData.sellCount + 1,
      positionData.lastBuyPrice
    );

    if (result.success) {
      positionData.lastSellPrice = currentPrice;
      positionData.sellCount++;
      positionData.totalPnl = new Decimal(positionData.totalPnl).plus(result.pnl || 0).toNumber();
      this.positions.set(token, positionData);
      const pnlText = result.pnl >= 0 ? `+${result.pnl?.toFixed(2)}` : result.pnl?.toFixed(2);
      logger.info(`SELL [${reasonText}] executed: ${symbol} @ ${currentPrice} | P&L: ${pnlText}`);

      // Close position tracking for adaptive exits
      adaptiveExitService.closePosition(token, currentPrice, reason);

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

  getPositionInfo(symbol) {
    for (const [token, tokenSymbol] of this.tokenToSymbolMap.entries()) {
      const cleanSymbol = tokenSymbol.replace('NSE:', '');
      if (cleanSymbol.toUpperCase() === symbol.toUpperCase()) {
        const positionData = this.positions.get(token.toString());
        if (positionData) {
          return {
            symbol: positionData.symbol,
            lastBuyPrice: positionData.lastBuyPrice,
            lastSellPrice: positionData.lastSellPrice,
            buyCount: positionData.buyCount,
            sellCount: positionData.sellCount,
            totalPnl: positionData.totalPnl,
            isActive: positionData.isActive
          };
        }
      }
    }
    return null;
  }

  getAllPositions() {
    const positions = [];
    for (const [token, positionData] of this.positions.entries()) {
      positions.push({
        token,
        symbol: positionData.symbol,
        lastBuyPrice: positionData.lastBuyPrice,
        buyCount: positionData.buyCount,
        sellCount: positionData.sellCount,
        totalPnl: positionData.totalPnl
      });
    }
    return positions.sort((a, b) => b.totalPnl - a.totalPnl);
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      active: this.isActive,
      tokensMapped: this.tokenToSymbolMap.size,
      regime: {
        current: this.currentRegime,
        ...marketRegimeService.getRegime()
      },
      activeStocks: this.activeStockList.map(s => s.symbol),
      adaptiveEntry: adaptiveEntryService.getStatus(),
      adaptiveExit: adaptiveExitService.getStatus(),
      portfolioRisk: portfolioRiskService.getStatus(),
      costCalculator: costCalculatorService.getStatus()
    };
  }

  start() {
    this.isActive = true;
    logger.info('Adaptive strategy started');
  }

  stop() {
    this.isActive = false;

    // Clean up intervals
    if (this.regimeCheckInterval) {
      clearInterval(this.regimeCheckInterval);
      this.regimeCheckInterval = null;
    }
    if (this.screeningInterval) {
      clearInterval(this.screeningInterval);
      this.screeningInterval = null;
    }

    logger.info('Adaptive strategy stopped');
  }

  getAdaptiveInfo() {
    return {
      enabled: true,
      regime: marketRegimeService.getRegime(),
      regimeHistory: marketRegimeService.getRegimeHistory(10),
      activeStocks: this.activeStockList,
      rankings: stockScreenerService.getAllRankings(),
      entryStatus: adaptiveEntryService.getStatus(),
      positions: adaptiveExitService.getAllPositions(),
      dataStatus: marketRegimeService.getDataStatus(),
      riskMetrics: portfolioRiskService.getMetrics(),
      gapStatus: adaptiveExitService.getGapStatus(),
      costInfo: costCalculatorService.getChargeRates()
    };
  }

  getRiskStatus() {
    return portfolioRiskService.getStatus();
  }

  forceResumeTrading() {
    portfolioRiskService.forceResumeTrading();
    return { success: true, message: 'Trading resumed' };
  }

  estimateTradeCosts(price, qty, targetPercent = 0.25) {
    return costCalculatorService.estimateTradeCosts(price, qty, targetPercent);
  }
}

module.exports = new AdaptiveStrategyService();
