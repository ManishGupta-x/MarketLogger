const logger = require('../../utils/logger');
const indicators = require('../indicators');
const config = require('../../config');

/**
 * Adaptive exit logic:
 * 1. Trailing stop   — activates at +0.5%, trails 0.3% behind peak
 * 2. Rapid decline   — drops 0.3% in 5s window (only when in loss)
 * 3. Momentum exit   — RSI overbought + position in loss
 * 4. Backstop SL     — hard -2% stop loss
 */
class Exit {
  constructor() {
    this.initialized = false;
    this.positions = new Map();   // token -> position data
    this.database = null;
    this.cfg = config.exit;

    // Slippage defaults
    this.baseSlippage = 0.05;     // 0.05%
    this.volMultiplier = 1.5;
  }

  initialize() {
    this.initialized = true;
    const ts = this.cfg.trailingStop;
    logger.info(`Exit service: trailing activates +${ts.activation}%, trails ${ts.distance}%`);
    logger.info(`Rapid decline: ${this.cfg.rapidDecline.threshold}% in ${this.cfg.rapidDecline.window}ms`);
    return true;
  }

  setDatabase(db) { this.database = db; }

  // ── Position lifecycle ─────────────────────────────────────────────────

  onEntry(token, symbol, entryPrice, qty) {
    const now = Date.now();
    this.positions.set(token, {
      token, symbol, entryPrice, qty,
      entryTime: now, highestPrice: entryPrice, lowestPrice: entryPrice,
      currentPrice: entryPrice, trailingActive: false, trailingLevel: null,
      priceHistory: [{ price: entryPrice, time: now }],
      lastUpdate: now
    });

    if (this.database) {
      try {
        this.database.createPositionTracking({
          token, symbol, entryPrice, entryTime: new Date(now).toISOString(),
          highestPrice: entryPrice, lowestPrice: entryPrice
        });
      } catch (e) { logger.error('DB position create failed:', e.message); }
    }
  }

  updatePrice(token, price) {
    const p = this.positions.get(token);
    if (!p) return;
    const now = Date.now();
    p.currentPrice = price;
    p.lastUpdate = now;
    if (price > p.highestPrice) p.highestPrice = price;
    if (price < p.lowestPrice)  p.lowestPrice  = price;
    p.priceHistory.push({ price, time: now });
    if (p.priceHistory.length > config.position.maxPriceHistory) p.priceHistory.shift();

    if (p.trailingActive) {
      const newStop = this._trailingLevel(p);
      if (newStop > p.trailingLevel) p.trailingLevel = newStop;
    }
    this.positions.set(token, p);
  }

  closePosition(token, exitPrice, reason) {
    const p = this.positions.get(token);
    if (!p) return;
    const pnlPct = ((exitPrice - p.entryPrice) / p.entryPrice) * 100;
    if (this.database) {
      try {
        this.database.closePositionTracking(token, {
          exitPrice, exitTime: new Date().toISOString(), exitReason: reason,
          pnlPercent: pnlPct, highestPrice: p.highestPrice, lowestPrice: p.lowestPrice
        });
      } catch (e) { logger.error('DB position close failed:', e.message); }
    }
    logger.info(`Position closed: ${p.symbol} @ ${exitPrice} (${reason}, P&L: ${pnlPct.toFixed(2)}%)`);
    this.positions.delete(token);
  }

  // ── Main evaluation ────────────────────────────────────────────────────

  evaluate(token, currentPrice) {
    if (!this.positions.has(token)) return { shouldExit: false, reason: 'NO_POSITION' };
    this.updatePrice(token, currentPrice);
    const p = this.positions.get(token);

    return (
      this._checkTrailing(p, currentPrice) ||
      this._checkRapidDecline(p, currentPrice) ||
      this._checkMomentum(p, currentPrice) ||
      this._checkBackstop(p, currentPrice) ||
      { shouldExit: false }
    );
  }

  // ── Individual checks ─────────────────────────────────────────────────

  _checkTrailing(p, price) {
    const cfg = this.cfg.trailingStop;
    const pnlPct = ((price - p.entryPrice) / p.entryPrice) * 100;

    if (!p.trailingActive && pnlPct >= cfg.activation) {
      p.trailingActive = true;
      p.trailingLevel = this._trailingLevel(p);
      this.positions.set(p.token, p);
      logger.info(`Trailing stop activated: ${p.symbol} stop @ ${p.trailingLevel.toFixed(2)} (+${pnlPct.toFixed(2)}%)`);
    }

    if (p.trailingActive && price <= p.trailingLevel) {
      const slip = this._slippage(price, p);
      return {
        shouldExit: true, reason: 'TRAILING_STOP',
        exitPrice: slip.adj, originalPrice: price, slippage: slip.amt,
        details: { entryPrice: p.entryPrice, highestPrice: p.highestPrice, trailingLevel: p.trailingLevel, pnlPct }
      };
    }
    return null;
  }

  _checkRapidDecline(p, price) {
    const cfg = this.cfg.rapidDecline;
    const now = Date.now();
    const recent = p.priceHistory.filter(e => (now - e.time) < cfg.window);
    if (recent.length < cfg.minDataPoints) return null;

    const peak = Math.max(...recent.map(e => e.price));
    const drop = ((peak - price) / peak) * 100;
    if (drop < cfg.threshold) return null;

    const pnlPct = ((price - p.entryPrice) / p.entryPrice) * 100;
    if (pnlPct >= 0) return null;  // In profit — let trailing stop handle it

    const slip = this._slippage(price, p);
    return {
      shouldExit: true, reason: 'RAPID_DECLINE',
      exitPrice: slip.adj, originalPrice: price, slippage: slip.amt,
      details: { entryPrice: p.entryPrice, peak, drop, pnlPct }
    };
  }

  _checkMomentum(p, price) {
    const cfg = this.cfg.momentumExit;
    if (!cfg.enabled) return null;
    if ((Date.now() - p.entryTime) < 30000) return null;  // Wait 30s

    const b = indicators.getBuffer(p.token);
    if (!b || b.prices.length < 20) return null;
    const rsi = indicators.rsi(b.prices, 14);
    if (rsi === null || rsi <= cfg.rsiThreshold) return null;

    const pnlPct = ((price - p.entryPrice) / p.entryPrice) * 100;
    if (pnlPct > -0.5) return null;  // Only exit when showing loss

    const slip = this._slippage(price, p);
    return {
      shouldExit: true, reason: 'MOMENTUM_EXHAUSTION',
      exitPrice: slip.adj, originalPrice: price, slippage: slip.amt,
      details: { entryPrice: p.entryPrice, rsi, pnlPct }
    };
  }

  _checkBackstop(p, price) {
    const pnlPct = ((price - p.entryPrice) / p.entryPrice) * 100;
    if (pnlPct > -this.cfg.backstopStopLoss) return null;
    const slip = this._slippage(price, p);
    return {
      shouldExit: true, reason: 'BACKSTOP_STOPLOSS',
      exitPrice: slip.adj, originalPrice: price, slippage: slip.amt,
      details: { entryPrice: p.entryPrice, pnlPct }
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  _trailingLevel(p) {
    const cfg = this.cfg.trailingStop;
    let dist = cfg.distance;
    if (cfg.accelerate) {
      const gain = ((p.highestPrice - p.entryPrice) / p.entryPrice) * 100;
      dist = Math.max(0.1, dist - Math.floor(gain) * cfg.accelerationStep);
    }
    return p.highestPrice * (1 - dist / 100);
  }

  _slippage(price, p) {
    let pct = this.baseSlippage;
    const b = indicators.getBuffer(p.token);
    if (b && b.prices.length >= 10) {
      const recent = b.prices.slice(-10);
      const totalMove = recent.reduce((s, _, i) => i === 0 ? s : s + Math.abs((recent[i] - recent[i-1]) / recent[i-1]) * 100, 0);
      if (totalMove > 2) pct *= this.volMultiplier;
    }
    pct = Math.min(pct, 0.3);
    const adj = price * (1 - pct / 100);
    return { adj, amt: (price - adj) * (p.qty || 1) };
  }

  // ── Status ────────────────────────────────────────────────────────────

  getAllPositions() {
    return Array.from(this.positions.values()).map(p => ({
      token: p.token, symbol: p.symbol, entryPrice: p.entryPrice,
      currentPrice: p.currentPrice, highestPrice: p.highestPrice,
      pnlPct: ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100,
      trailingActive: p.trailingActive, trailingLevel: p.trailingLevel,
      holdingMs: Date.now() - p.entryTime
    }));
  }

  getPosition(token) { return this.positions.get(token) || null; }

  getStatus() {
    return {
      initialized: this.initialized,
      trackedPositions: this.positions.size,
      config: {
        trailingStop: this.cfg.trailingStop,
        rapidDecline: this.cfg.rapidDecline,
        momentumExit: this.cfg.momentumExit,
        backstopStopLoss: this.cfg.backstopStopLoss
      }
    };
  }

  reset() { this.positions.clear(); logger.info('Exit service reset'); }
}

module.exports = new Exit();
