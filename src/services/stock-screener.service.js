const logger = require('../utils/logger');
const technicalIndicators = require('./technical-indicators.service');
const marketRegime = require('./market-regime.service');
const config = require('../config/adaptive-config');
const { getSector, applyDiversification } = require('../config/sector-mapping');

/**
 * Stock Screener Service
 * Screens and ranks stocks based on current market regime
 * Selects top 10 stocks optimized for each market condition
 */
class StockScreenerService {
  constructor() {
    this.isInitialized = false;
    this.tokenToSymbolMap = new Map();

    // Stock metrics cache
    this.stockMetrics = new Map(); // token -> metrics object

    // Rankings by regime
    this.rankings = {
      BULLISH: [],
      BEARISH: [],
      SIDEWAYS: []
    };

    // Active stock list (top stocks for current regime)
    this.activeStocks = [];

    // Last screening time
    this.lastScreenTime = 0;
    this.screeningInProgress = false;

    // Database reference
    this.database = null;

    // Market buffer reference (for relative calculations)
    this.marketBuffer = null;
  }

  /**
   * Initialize the service
   * @param {Map} tokenToSymbolMap - Token to symbol mapping from grid strategy
   */
  initialize(tokenToSymbolMap) {
    this.tokenToSymbolMap = tokenToSymbolMap;
    this.isInitialized = true;
    logger.info(`Stock Screener initialized with ${tokenToSymbolMap.size} instruments`);
    return true;
  }

  /**
   * Set database reference
   */
  setDatabase(database) {
    this.database = database;
  }

  /**
   * Process incoming ticks to update stock price buffers
   * @param {Array} ticks - Array of tick data
   */
  processTicks(ticks) {
    if (!this.isInitialized) return;

    ticks.forEach(tick => {
      const token = tick.instrument_token.toString();
      technicalIndicators.updatePriceBuffer(token, tick);
    });

    // Update market buffer reference
    const nifty50Token = config.regime.nifty50Token.toString();
    this.marketBuffer = technicalIndicators.getPriceBuffer(nifty50Token);
  }

  /**
   * Calculate metrics for a single stock
   * @param {string} token - Instrument token
   * @returns {Object|null} Stock metrics or null if insufficient data
   */
  calculateStockMetrics(token) {
    const indicators = technicalIndicators.calculateAllIndicators(token, this.marketBuffer);

    if (!indicators) {
      return null;
    }

    const symbol = this.tokenToSymbolMap.get(parseInt(token))?.replace('NSE:', '') || token;

    return {
      token,
      symbol,
      currentPrice: indicators.currentPrice,
      sma20: indicators.sma20,
      sma50: indicators.sma50,
      ema20: indicators.ema20,
      ema50: indicators.ema50,
      rsi: indicators.rsi,
      atr: indicators.atr,
      adx: indicators.adx?.adx,
      roc: indicators.roc,
      volatility: indicators.volatility,
      beta: indicators.beta,
      relativeStrength: indicators.relativeStrength,
      priceCount: indicators.priceCount,
      updatedAt: Date.now()
    };
  }

  /**
   * Calculate score for bullish regime
   * Prefers: High momentum, strong RSI (50-70), high relative strength
   * @param {Object} metrics - Stock metrics
   * @returns {number} Score (0-100)
   */
  calculateBullishScore(metrics) {
    const weights = config.screening.weights.bullish;
    let score = 0;

    // Momentum (ROC) - higher is better for bullish
    if (metrics.roc !== null) {
      // Normalize ROC: 0-10% = 0-100 score
      const rocScore = Math.min(100, Math.max(0, metrics.roc * 10));
      score += (rocScore / 100) * weights.momentum;
    }

    // RSI - prefer 50-70 zone
    if (metrics.rsi !== null) {
      const { bullishMin, bullishMax } = config.screening.rsiZones;
      if (metrics.rsi >= bullishMin && metrics.rsi <= bullishMax) {
        score += weights.rsi; // Full score if in zone
      } else if (metrics.rsi > bullishMax) {
        // Above 70, reduce score
        score += weights.rsi * (1 - (metrics.rsi - bullishMax) / 30);
      } else if (metrics.rsi >= 40) {
        // 40-50, partial score
        score += weights.rsi * ((metrics.rsi - 40) / 10);
      }
    }

    // Relative Strength - higher is better
    if (metrics.relativeStrength !== null) {
      // RS > 1 means outperforming market
      const rsScore = Math.min(100, Math.max(0, (metrics.relativeStrength - 0.8) * 250));
      score += (rsScore / 100) * weights.relativeStrength;
    }

    // Beta - moderate to high preferred
    if (metrics.beta !== null) {
      // Beta 1.0-1.5 is ideal for bullish
      if (metrics.beta >= 1.0 && metrics.beta <= 1.5) {
        score += weights.beta;
      } else if (metrics.beta > 0.8) {
        score += weights.beta * 0.5;
      }
    }

    // Volatility - moderate preferred
    if (metrics.volatility !== null) {
      // 15-30% annualized volatility is good
      if (metrics.volatility >= 15 && metrics.volatility <= 30) {
        score += weights.volatility;
      } else if (metrics.volatility > 10 && metrics.volatility < 40) {
        score += weights.volatility * 0.5;
      }
    }

    return Math.min(100, score);
  }

  /**
   * Calculate score for bearish regime
   * Prefers: Low beta (defensive), low volatility, stable relative strength
   * @param {Object} metrics - Stock metrics
   * @returns {number} Score (0-100)
   */
  calculateBearishScore(metrics) {
    const weights = config.screening.weights.bearish;
    let score = 0;

    // Momentum - low momentum preferred (avoid falling knives)
    if (metrics.roc !== null) {
      // Prefer stocks that aren't falling too much
      if (metrics.roc >= -2 && metrics.roc <= 2) {
        score += weights.momentum;
      } else if (metrics.roc > -5) {
        score += weights.momentum * 0.5;
      }
    }

    // RSI - prefer neutral zone (40-60)
    if (metrics.rsi !== null) {
      if (metrics.rsi >= 40 && metrics.rsi <= 60) {
        score += weights.rsi;
      } else if (metrics.rsi >= 30 && metrics.rsi <= 70) {
        score += weights.rsi * 0.5;
      }
    }

    // Relative Strength - stable preferred
    if (metrics.relativeStrength !== null) {
      // RS close to 1 (neither outperforming nor underperforming)
      if (metrics.relativeStrength >= 0.9 && metrics.relativeStrength <= 1.1) {
        score += weights.relativeStrength;
      } else if (metrics.relativeStrength >= 0.8) {
        score += weights.relativeStrength * 0.5;
      }
    }

    // Beta - LOW is better (defensive)
    if (metrics.beta !== null) {
      const { defensive } = config.screening.betaThresholds;
      if (metrics.beta < defensive) {
        score += weights.beta; // Full score for defensive stocks
      } else if (metrics.beta < 1.0) {
        score += weights.beta * (1 - (metrics.beta - defensive) / (1 - defensive));
      }
    }

    // Volatility - LOW is better
    if (metrics.volatility !== null) {
      // Low volatility preferred
      if (metrics.volatility < 15) {
        score += weights.volatility;
      } else if (metrics.volatility < 25) {
        score += weights.volatility * (1 - (metrics.volatility - 15) / 10);
      }
    }

    return Math.min(100, score);
  }

  /**
   * Calculate score for sideways regime
   * Prefers: RSI at extremes (mean reversion), range-bound, high volume
   * @param {Object} metrics - Stock metrics
   * @returns {number} Score (0-100)
   */
  calculateSidewaysScore(metrics) {
    const weights = config.screening.weights.sideways;
    let score = 0;

    // Momentum - low momentum preferred (range-bound)
    if (metrics.roc !== null) {
      if (Math.abs(metrics.roc) < 2) {
        score += weights.momentum;
      } else if (Math.abs(metrics.roc) < 5) {
        score += weights.momentum * 0.5;
      }
    }

    // RSI - prefer extremes for mean reversion
    if (metrics.rsi !== null) {
      const { oversold, overbought } = config.screening.rsiZones;
      if (metrics.rsi <= oversold || metrics.rsi >= overbought) {
        score += weights.rsi; // Full score at extremes
      } else if (metrics.rsi <= 35 || metrics.rsi >= 65) {
        score += weights.rsi * 0.7; // Near extremes
      }
    }

    // Relative Strength - neutral preferred
    if (metrics.relativeStrength !== null) {
      if (metrics.relativeStrength >= 0.9 && metrics.relativeStrength <= 1.1) {
        score += weights.relativeStrength;
      }
    }

    // Beta - moderate preferred
    if (metrics.beta !== null) {
      if (metrics.beta >= 0.8 && metrics.beta <= 1.2) {
        score += weights.beta;
      }
    }

    // Volatility - moderate is good for range trading
    if (metrics.volatility !== null) {
      if (metrics.volatility >= 10 && metrics.volatility <= 25) {
        score += weights.volatility;
      }
    }

    return Math.min(100, score);
  }

  /**
   * Calculate score based on regime
   * @param {Object} metrics - Stock metrics
   * @param {string} regime - BULLISH, BEARISH, or SIDEWAYS
   * @returns {number} Score (0-100)
   */
  calculateScore(metrics, regime) {
    switch (regime) {
      case 'BULLISH':
        return this.calculateBullishScore(metrics);
      case 'BEARISH':
        return this.calculateBearishScore(metrics);
      case 'SIDEWAYS':
        return this.calculateSidewaysScore(metrics);
      default:
        return 0;
    }
  }

  /**
   * Screen all stocks and update rankings
   * @returns {Object} Screening results
   */
  async screenStocks() {
    if (this.screeningInProgress) {
      logger.debug('Screening already in progress, skipping');
      return null;
    }

    this.screeningInProgress = true;
    const startTime = Date.now();

    try {
      const regimes = ['BULLISH', 'BEARISH', 'SIDEWAYS'];
      const results = {
        screened: 0,
        skipped: 0,
        rankings: {}
      };

      // Calculate metrics for all stocks
      const allMetrics = [];

      for (const [token] of this.tokenToSymbolMap.entries()) {
        const tokenStr = token.toString();

        // Skip index tokens
        if (tokenStr === config.regime.nifty50Token.toString() ||
            tokenStr === config.regime.niftyBankToken.toString()) {
          continue;
        }

        const metrics = this.calculateStockMetrics(tokenStr);

        if (metrics) {
          this.stockMetrics.set(tokenStr, metrics);
          allMetrics.push(metrics);
          results.screened++;
        } else {
          results.skipped++;
        }
      }

      // Calculate scores and rankings for each regime
      for (const regime of regimes) {
        const scoredStocks = allMetrics.map(metrics => ({
          ...metrics,
          score: this.calculateScore(metrics, regime)
        }));

        // Sort by score descending
        scoredStocks.sort((a, b) => b.score - a.score);

        // Apply sector diversification if enabled
        const diversificationEnabled = process.env.SECTOR_DIVERSIFICATION !== 'false';
        let selectedStocks;

        if (diversificationEnabled) {
          // Apply sector limits to ensure diversification
          selectedStocks = applyDiversification(scoredStocks, config.screening.topStocksCount);
          logger.debug(`Diversified selection for ${regime}: ${selectedStocks.map(s => `${s.symbol}(${s.sector})`).join(', ')}`);
        } else {
          // Just take top N without diversification
          selectedStocks = scoredStocks.slice(0, config.screening.topStocksCount);
        }

        this.rankings[regime] = selectedStocks;
        results.rankings[regime] = selectedStocks.map(s => ({
          symbol: s.symbol,
          score: s.score.toFixed(1),
          sector: getSector(s.symbol)
        }));
      }

      // Update active stocks based on current regime
      const currentRegime = marketRegime.getRegime().regime;
      this.activeStocks = this.rankings[currentRegime] || [];

      this.lastScreenTime = Date.now();
      const duration = Date.now() - startTime;

      logger.info(`Stock screening completed: ${results.screened} stocks, ${results.skipped} skipped (${duration}ms)`);

      // Save rankings to database if available
      if (this.database) {
        try {
          const today = new Date().toISOString().split('T')[0];
          for (const regime of regimes) {
            this.database.saveStockRankings(today, regime, this.rankings[regime]);
          }
        } catch (error) {
          logger.error('Failed to save stock rankings to database:', error);
        }
      }

      return results;
    } catch (error) {
      logger.error('Error during stock screening:', error);
      throw error;
    } finally {
      this.screeningInProgress = false;
    }
  }

  /**
   * Get top stocks for a specific regime
   * @param {string} regime - BULLISH, BEARISH, or SIDEWAYS
   * @param {number} count - Number of stocks to return
   * @returns {Array} Top stocks
   */
  getTopStocks(regime, count = config.screening.topStocksCount) {
    const rankings = this.rankings[regime] || [];
    return rankings.slice(0, count);
  }

  /**
   * Get active stocks (for current regime)
   * @returns {Array} Active stock list
   */
  getActiveStocks() {
    return this.activeStocks;
  }

  /**
   * Update active stocks when regime changes
   * @param {string} newRegime - New market regime
   */
  updateActiveStocksForRegime(newRegime) {
    this.activeStocks = this.rankings[newRegime] || [];

    const symbols = this.activeStocks.map(s => s.symbol).join(', ');
    logger.info(`Updated active stocks for ${newRegime} regime: ${symbols}`);

    return this.activeStocks;
  }

  /**
   * Check if a stock is in the active list
   * @param {string} token - Instrument token
   * @returns {boolean} True if active
   */
  isStockActive(token) {
    return this.activeStocks.some(s => s.token === token);
  }

  /**
   * Get metrics for a specific stock
   * @param {string} token - Instrument token
   * @returns {Object|null} Stock metrics
   */
  getStockMetrics(token) {
    return this.stockMetrics.get(token) || null;
  }

  /**
   * Get all rankings
   * @returns {Object} Rankings by regime
   */
  getAllRankings() {
    return {
      BULLISH: this.rankings.BULLISH.map(s => ({ symbol: s.symbol, score: s.score, rsi: s.rsi, roc: s.roc, sector: s.sector || getSector(s.symbol) })),
      BEARISH: this.rankings.BEARISH.map(s => ({ symbol: s.symbol, score: s.score, beta: s.beta, volatility: s.volatility, sector: s.sector || getSector(s.symbol) })),
      SIDEWAYS: this.rankings.SIDEWAYS.map(s => ({ symbol: s.symbol, score: s.score, rsi: s.rsi, sector: s.sector || getSector(s.symbol) }))
    };
  }

  /**
   * Check if screening is needed
   * @returns {boolean} True if screening is due
   */
  isScreeningDue() {
    return (Date.now() - this.lastScreenTime) >= config.screening.screenFrequency;
  }

  /**
   * Get screening status
   * @returns {Object} Status info
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      totalInstruments: this.tokenToSymbolMap.size,
      cachedMetrics: this.stockMetrics.size,
      lastScreenTime: this.lastScreenTime,
      screeningInProgress: this.screeningInProgress,
      activeStocksCount: this.activeStocks.length,
      activeStocks: this.activeStocks.map(s => s.symbol)
    };
  }
}

module.exports = new StockScreenerService();
