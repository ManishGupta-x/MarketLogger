const logger = require('../../utils/logger');
const regime  = require('./regime');
const screener = require('./screener');
const entry   = require('./entry');
const exit    = require('./exit');
const config  = require('../../config');

/**
 * Wires all strategy modules together.
 * Receives ticks from tick-processor, issues BUY/SELL signals to paper-trading.
 */
class Orchestrator {
  constructor() {
    this.initialized = false;
    this.active = false;
    this.paperTrading = null;
    this.risk = null;
    this.database = null;
    this.broadcast = null;  // SSE broadcast fn (ticks, orders, regime)

    this.tokenToSymbol = new Map();
    this.positions = new Map();          // token -> { symbol, lastBuyPrice, buyCount, sellCount }
    this.lastTradeTime = new Map();      // token -> timestamp
    this.minIntervalMs = 5000;

    this.currentRegime = 'SIDEWAYS';
    this.activeStocks = [];

    this._regimeTimer = null;
    this._screenTimer = null;
  }

  // ── Dependency injection ─────────────────────────────────────────────────

  setPaperTrading(pt)  { this.paperTrading = pt; }
  setRisk(riskSvc)     { this.risk = riskSvc; }
  setDatabase(db) {
    this.database = db;
    regime.setDatabase(db);
    screener.setDatabase(db);
    exit.setDatabase(db);
    if (this.risk) this.risk.setDatabase(db);
  }
  setBroadcast(fn) { this.broadcast = fn; }

  // ── Initialization ────────────────────────────────────────────────────────

  async initialize() {
    logger.info('Initializing Orchestrator...');

    // Build token->symbol map from Zerodha instrument list
    await this._loadInstruments();

    regime.initialize();
    screener.initialize(this.tokenToSymbol);
    entry.initialize();
    exit.initialize();

    if (this.paperTrading) {
      if (this.risk) this.risk.initialize(this.paperTrading);
      this._restorePositions();
    }

    this._startRegimeLoop();
    this._startScreeningLoop();

    this.initialized = true;
    this.active = true;
    logger.info('Orchestrator initialized');
    return true;
  }

  async _loadInstruments() {
    try {
      const zerodha = require('../auth/zerodha').kite;
      const instruments = await zerodha.getInstruments('NSE');
      instruments.forEach(inst => {
        const token = typeof inst.instrument_token === 'number'
          ? inst.instrument_token : parseInt(inst.instrument_token);
        this.tokenToSymbol.set(token, `NSE:${inst.tradingsymbol}`);
      });
      logger.info(`Loaded ${this.tokenToSymbol.size} instruments`);
    } catch (err) {
      logger.error('Failed to load instruments:', err.message);
      throw err;
    }
  }

  _restorePositions() {
    const holdings = this.paperTrading.getHoldings();
    if (!holdings.length) return;
    logger.info(`Restoring ${holdings.length} positions...`);
    holdings.forEach(h => {
      const token = h.token.toString();
      this.positions.set(token, { symbol: h.symbol, lastBuyPrice: h.avgPrice, buyCount: 1, sellCount: 0 });
      exit.onEntry(token, h.symbol, h.avgPrice, h.qty || 1);
    });
  }

  // ── Interval loops ────────────────────────────────────────────────────────

  _startRegimeLoop() {
    this._regimeTimer = setInterval(() => {
      try {
        const result = regime.update();
        if (result.changed) {
          this.currentRegime = result.newRegime;
          screener.updateActiveForRegime(result.newRegime);
          this.activeStocks = screener.getActive();
          if (this.broadcast) {
            this.broadcast('regime', { regime: result.newRegime, confidence: result.confidence, timestamp: Date.now() });
          }
        }
      } catch (err) {
        logger.error('Regime update error:', err.message);
      }
    }, config.regime.checkFrequency);
    logger.info(`Regime loop: every ${config.regime.checkFrequency / 1000}s`);
  }

  _startScreeningLoop() {
    // First run after 60s (allow ticks to accumulate)
    setTimeout(() => this._runScreening(), 60000);
    this._screenTimer = setInterval(() => this._runScreening(), config.screening.screenFrequency);
    logger.info(`Screening loop: every ${config.screening.screenFrequency / 1000}s`);
  }

  async _runScreening() {
    try {
      await screener.screen();
      this.activeStocks = screener.getActive();
    } catch (err) {
      logger.error('Screening error:', err.message);
    }
  }

  // ── Tick handler ──────────────────────────────────────────────────────────

  onTicks(ticks) {
    if (!this.initialized || !this.active) return;

    regime.onTicks(ticks);
    screener.onTicks(ticks);

    const indexTokens = new Set([
      config.regime.nifty50Token.toString(),
      config.regime.niftyBankToken.toString()
    ]);

    ticks.forEach(tick => {
      const token = tick.instrument_token.toString();
      const price = tick.last_price;

      if (indexTokens.has(token)) return;

      const symFull = this.tokenToSymbol.get(parseInt(token));
      if (!symFull) return;
      const symbol = symFull.replace('NSE:', '');

      // Update holding price + exit tracking
      if (this.paperTrading && this.paperTrading.hasHolding(token)) {
        this.paperTrading.updateHoldingPrice(token, price);
        exit.updatePrice(token, price);
      }

      // Rate-limit per token
      const last = this.lastTradeTime.get(token);
      if (last && (Date.now() - last) < this.minIntervalMs) return;

      // Init position slot
      if (!this.positions.has(token)) {
        this.positions.set(token, { symbol, lastBuyPrice: null, buyCount: 0, sellCount: 0 });
      }

      this._evaluate(token, symbol, price);
    });
  }

  _evaluate(token, symbol, price) {
    const pos = this.positions.get(token);

    // BUY: only if stock is in active list and not already held
    const isActive = this.activeStocks.some(s => s.token === token);
    if (isActive && this.paperTrading && !this.paperTrading.hasHolding(token)) {
      const sig = entry.evaluate(token, price, this.currentRegime);
      if (sig.shouldEnter) {
        logger.info(`Entry signal: ${symbol} [${this.currentRegime}] score=${sig.score}`);
        this._buy(token, symbol, price, pos, sig);
        return;
      }
    }

    // SELL: if held, check exit conditions
    if (this.paperTrading && this.paperTrading.hasHolding(token)) {
      // Sync lastBuyPrice from holdings if needed
      if (!pos.lastBuyPrice) {
        const h = this.paperTrading.getHoldings().find(h => h.token.toString() === token);
        if (h) { pos.lastBuyPrice = h.avgPrice; this.positions.set(token, pos); }
      }
      if (pos.lastBuyPrice) {
        const sig = exit.evaluate(token, price);
        if (sig.shouldExit) {
          this._sell(token, symbol, sig.exitPrice || price, pos, sig.reason, sig);
        }
      }
    }
  }

  async _buy(token, symbol, price, pos, sig) {
    this.lastTradeTime.set(token, Date.now());
    if (!this.paperTrading) return;

    const portfolio = this.paperTrading.getPortfolio();
    if (this.risk) {
      const riskCheck = this.risk.updateAndCheck(portfolio);
      if (!riskCheck.tradingAllowed) {
        logger.warn(`BUY blocked [${riskCheck.haltReason}]: ${symbol}`);
        return;
      }
      const canBuy = this.risk.canBuy(this.paperTrading.amountPerTrade);
      if (!canBuy.allowed) {
        logger.warn(`BUY blocked [${canBuy.reason}]: ${symbol}`);
        return;
      }
    }

    const result = await this.paperTrading.executeVirtualOrder(token, symbol, 'BUY', price, 0, price, { marketRegime: this.currentRegime });
    if (result.success) {
      pos.lastBuyPrice = price;
      pos.buyCount++;
      this.positions.set(token, pos);
      exit.onEntry(token, symbol, price, result.qty);
      logger.info(`BUY: ${symbol} @ ${price} qty=${result.qty} [${this.currentRegime}] score=${sig.score}`);
      if (this.broadcast) {
        this.broadcast('order', { type: 'BUY', symbol, price, qty: result.qty, value: result.value, regime: this.currentRegime, entryScore: sig.score, timestamp: Date.now() });
      }
    }
  }

  async _sell(token, symbol, price, pos, reason, sig) {
    if (!this.paperTrading || !this.paperTrading.hasHolding(token)) return;
    this.lastTradeTime.set(token, Date.now());

    const result = await this.paperTrading.executeVirtualOrder(token, symbol, 'SELL', price, 0, pos.lastBuyPrice, { exitReason: reason, marketRegime: this.currentRegime });
    if (result.success) {
      pos.lastSellPrice = price;
      pos.sellCount++;
      this.positions.set(token, pos);
      exit.closePosition(token, price, reason);
      logger.info(`SELL [${reason}]: ${symbol} @ ${price} P&L=${result.pnl?.toFixed(2)}`);
      if (this.broadcast) {
        this.broadcast('order', { type: 'SELL', reason, symbol, price, qty: result.qty, value: result.value, pnl: result.pnl, pnlPercent: result.pnlPercent, regime: this.currentRegime, timestamp: Date.now() });
      }
    }
  }

  // ── Control ──────────────────────────────────────────────────────────────

  start() { this.active = true; logger.info('Orchestrator started'); }

  stop() {
    this.active = false;
    if (this._regimeTimer) { clearInterval(this._regimeTimer); this._regimeTimer = null; }
    if (this._screenTimer) { clearInterval(this._screenTimer); this._screenTimer = null; }
    logger.info('Orchestrator stopped');
  }

  forceResume() {
    if (this.risk) this.risk.forceResumeTrading();
    return { success: true, message: 'Trading resumed' };
  }

  // ── Status / info ─────────────────────────────────────────────────────────

  getStatus() {
    return {
      initialized: this.initialized, active: this.active,
      tokensMapped: this.tokenToSymbol.size,
      regime: { current: this.currentRegime, ...regime.getState() },
      activeStocks: this.activeStocks.map(s => s.symbol),
      exitStatus: exit.getStatus(),
      riskStatus: this.risk?.getStatus(),
      dataStatus: regime.getDataStatus()
    };
  }

  getAdaptiveInfo() {
    return {
      regime: regime.getState(),
      regimeHistory: regime.getHistory(10),
      activeStocks: this.activeStocks,
      rankings: screener.getAllRankings(),
      entryStatus: entry.getStatus(),
      exitPositions: exit.getAllPositions(),
      dataStatus: regime.getDataStatus(),
      riskMetrics: this.risk?.getMetrics()
    };
  }

  getRiskStatus() { return this.risk?.getStatus() || {}; }
}

module.exports = new Orchestrator();
