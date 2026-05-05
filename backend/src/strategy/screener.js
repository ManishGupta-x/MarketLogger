const logger = require('../../utils/logger');
const indicators = require('../indicators');
const config = require('../../config');
const { getSector, applyDiversification } = require('../../config/sector-mapping');

/**
 * Screens and ranks stocks per market regime.
 * Selects top N (default 10) optimized for each regime.
 */
class Screener {
  constructor() {
    this.initialized = false;
    this.tokenToSymbol = new Map();   // token (number) -> 'NSE:SYMBOL'
    this.stockMetrics  = new Map();   // token string -> metrics
    this.rankings = { BULLISH: [], BEARISH: [], SIDEWAYS: [] };
    this.activeStocks = [];
    this.lastScreenTime = 0;
    this.inProgress = false;
    this.database = null;
    this.marketBuffer = null;
  }

  initialize(tokenToSymbol) {
    this.tokenToSymbol = tokenToSymbol;
    this.initialized = true;
    logger.info(`Screener initialized with ${tokenToSymbol.size} instruments`);
    return true;
  }

  setDatabase(db) { this.database = db; }

  // Called by tick-processor listener
  onTicks(ticks) {
    if (!this.initialized) return;
    this.marketBuffer = indicators.getBuffer(config.regime.nifty50Token);
  }

  _metricsForToken(tokenStr) {
    const ind = indicators.forToken(tokenStr, this.marketBuffer);
    if (!ind) return null;
    const sym = (this.tokenToSymbol.get(parseInt(tokenStr)) || tokenStr).replace('NSE:', '');
    return {
      token: tokenStr, symbol: sym,
      currentPrice: ind.currentPrice,
      sma20: ind.sma20, sma50: ind.sma50, ema20: ind.ema20, ema50: ind.ema50,
      rsi: ind.rsi, atr: ind.atr, adx: ind.adx?.adx,
      roc: ind.roc, volatility: ind.volatility,
      beta: ind.beta, relativeStrength: ind.relativeStrength,
      priceCount: ind.priceCount
    };
  }

  _scoreBullish(m) {
    const w = config.screening.weights.bullish;
    let s = 0;
    if (m.roc != null) s += (Math.min(100, Math.max(0, m.roc * 10)) / 100) * w.momentum;
    if (m.rsi != null) {
      const { bullishMin: mn, bullishMax: mx } = config.screening.rsiZones;
      if (m.rsi >= mn && m.rsi <= mx)    s += w.rsi;
      else if (m.rsi > mx)               s += w.rsi * (1 - (m.rsi - mx) / 30);
      else if (m.rsi >= 40)              s += w.rsi * ((m.rsi - 40) / 10);
    }
    if (m.relativeStrength != null) s += (Math.min(100, Math.max(0, (m.relativeStrength - 0.8) * 250)) / 100) * w.relativeStrength;
    if (m.beta != null) {
      if (m.beta >= 1.0 && m.beta <= 1.5) s += w.beta;
      else if (m.beta > 0.8)              s += w.beta * 0.5;
    }
    if (m.volatility != null) {
      if (m.volatility >= 15 && m.volatility <= 30) s += w.volatility;
      else if (m.volatility > 10 && m.volatility < 40) s += w.volatility * 0.5;
    }
    return Math.min(100, s);
  }

  _scoreBearish(m) {
    const w = config.screening.weights.bearish;
    let s = 0;
    if (m.roc != null) {
      if (m.roc >= -2 && m.roc <= 2)    s += w.momentum;
      else if (m.roc > -5)              s += w.momentum * 0.5;
    }
    if (m.rsi != null) {
      if (m.rsi >= 40 && m.rsi <= 60)   s += w.rsi;
      else if (m.rsi >= 30 && m.rsi <= 70) s += w.rsi * 0.5;
    }
    if (m.relativeStrength != null) {
      if (m.relativeStrength >= 0.9 && m.relativeStrength <= 1.1) s += w.relativeStrength;
      else if (m.relativeStrength >= 0.8) s += w.relativeStrength * 0.5;
    }
    if (m.beta != null) {
      const def = config.screening.betaThresholds.defensive;
      if (m.beta < def)           s += w.beta;
      else if (m.beta < 1.0)      s += w.beta * (1 - (m.beta - def) / (1 - def));
    }
    if (m.volatility != null) {
      if (m.volatility < 15)      s += w.volatility;
      else if (m.volatility < 25) s += w.volatility * (1 - (m.volatility - 15) / 10);
    }
    return Math.min(100, s);
  }

  _scoreSideways(m) {
    const w = config.screening.weights.sideways;
    let s = 0;
    if (m.roc != null) {
      if (Math.abs(m.roc) < 2)  s += w.momentum;
      else if (Math.abs(m.roc) < 5) s += w.momentum * 0.5;
    }
    if (m.rsi != null) {
      const { oversold, overbought } = config.screening.rsiZones;
      if (m.rsi <= oversold || m.rsi >= overbought) s += w.rsi;
      else if (m.rsi <= 35 || m.rsi >= 65)         s += w.rsi * 0.7;
    }
    if (m.relativeStrength != null && m.relativeStrength >= 0.9 && m.relativeStrength <= 1.1) s += w.relativeStrength;
    if (m.beta != null && m.beta >= 0.8 && m.beta <= 1.2) s += w.beta;
    if (m.volatility != null && m.volatility >= 10 && m.volatility <= 25) s += w.volatility;
    return Math.min(100, s);
  }

  score(metrics, regime) {
    switch (regime) {
      case 'BULLISH':  return this._scoreBullish(metrics);
      case 'BEARISH':  return this._scoreBearish(metrics);
      case 'SIDEWAYS': return this._scoreSideways(metrics);
      default: return 0;
    }
  }

  async screen() {
    if (this.inProgress || !this.initialized) return null;
    this.inProgress = true;
    const t0 = Date.now();
    try {
      const indexTokens = new Set([config.regime.nifty50Token, config.regime.niftyBankToken]);
      const allMetrics = [];
      let skipped = 0;

      for (const tokenStr of indicators.getTrackedTokens()) {
        if (indexTokens.has(typeof tokenStr === 'string' ? parseInt(tokenStr) : tokenStr)) continue;
        const m = this._metricsForToken(tokenStr);
        if (m) { this.stockMetrics.set(tokenStr, m); allMetrics.push(m); }
        else skipped++;
      }

      for (const regime of ['BULLISH', 'BEARISH', 'SIDEWAYS']) {
        const scored = allMetrics.map(m => ({ ...m, score: this.score(m, regime), sector: getSector(m.symbol) }));
        scored.sort((a, b) => b.score - a.score);
        this.rankings[regime] = applyDiversification(scored, config.screening.topStocksCount);
      }

      if (this.database) {
        const today = new Date().toISOString().split('T')[0];
        for (const regime of ['BULLISH', 'BEARISH', 'SIDEWAYS']) {
          try { this.database.saveStockRankings(today, regime, this.rankings[regime]); } catch(e) {}
        }
      }

      this.lastScreenTime = Date.now();
      logger.info(`Screener: ${allMetrics.length} stocks ready, ${skipped} need more data (${Date.now() - t0}ms)`);
      return { screened: allMetrics.length, skipped, rankings: this._summarizeRankings() };
    } finally {
      this.inProgress = false;
    }
  }

  _summarizeRankings() {
    const out = {};
    for (const r of ['BULLISH', 'BEARISH', 'SIDEWAYS']) {
      out[r] = this.rankings[r].map(s => ({ symbol: s.symbol, score: s.score?.toFixed(1), sector: s.sector }));
    }
    return out;
  }

  updateActiveForRegime(regime) {
    this.activeStocks = this.rankings[regime] || [];
    logger.info(`Active stocks for ${regime}: ${this.activeStocks.map(s => s.symbol).join(', ')}`);
    return this.activeStocks;
  }

  getActive() { return this.activeStocks; }
  getTopFor(regime, count = config.screening.topStocksCount) { return (this.rankings[regime] || []).slice(0, count); }
  isActive(token) { return this.activeStocks.some(s => s.token === token); }
  isScreeningDue() { return (Date.now() - this.lastScreenTime) >= config.screening.screenFrequency; }

  getAllRankings() {
    return {
      BULLISH:  this.rankings.BULLISH.map(s => ({ symbol: s.symbol, score: s.score, rsi: s.rsi, roc: s.roc, sector: s.sector || getSector(s.symbol) })),
      BEARISH:  this.rankings.BEARISH.map(s => ({ symbol: s.symbol, score: s.score, beta: s.beta, volatility: s.volatility, sector: s.sector || getSector(s.symbol) })),
      SIDEWAYS: this.rankings.SIDEWAYS.map(s => ({ symbol: s.symbol, score: s.score, rsi: s.rsi, sector: s.sector || getSector(s.symbol) }))
    };
  }

  getStatus() {
    return {
      initialized: this.initialized, totalInstruments: this.tokenToSymbol.size,
      cachedMetrics: this.stockMetrics.size, lastScreenTime: this.lastScreenTime,
      inProgress: this.inProgress, activeStocksCount: this.activeStocks.length,
      activeStocks: this.activeStocks.map(s => s.symbol)
    };
  }
}

module.exports = new Screener();
