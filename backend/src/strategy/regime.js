const logger = require('../../utils/logger');
const indicators = require('../indicators');
const config = require('../../config');

/**
 * Market regime detection: BULLISH / BEARISH / SIDEWAYS
 * Uses weighted NIFTY50 (60%) + NIFTY Bank (40%) signals.
 */
class Regime {
  constructor() {
    this.initialized = false;
    this.current = 'SIDEWAYS';
    this.confidence = 0;
    this.lastChangeTime = 0;
    this.lastChange = null;
    this.history = [];          // in-memory, last 100 entries
    this.manualOverride = null;
    this.manualOverrideExpiry = null;
    this.nifty50Price = null;
    this.niftyBankPrice = null;
    this.database = null;

    this.nifty50Token  = config.regime.nifty50Token.toString();
    this.niftyBankToken = config.regime.niftyBankToken.toString();
  }

  initialize() {
    this.initialized = true;
    this.lastChangeTime = Date.now();
    logger.info('Regime service initialized');
    return true;
  }

  setDatabase(db) { this.database = db; }

  // Called by tick-processor listener
  onTicks(ticks) {
    if (!this.initialized) return;
    for (const tick of ticks) {
      const t = tick.instrument_token.toString();
      if (t === this.nifty50Token) this.nifty50Price = tick.last_price;
      else if (t === this.niftyBankToken) this.niftyBankPrice = tick.last_price;
    }
  }

  _indexSignal(token) {
    const b = indicators.getBuffer(token);
    if (!b || b.prices.length < config.regime.emaLong) {
      return { bullish: 0, bearish: 0, signals: [], ready: false };
    }
    const { prices, highs, lows, closes } = b;
    const cur   = prices[prices.length - 1];
    const ema20 = indicators.ema(prices, config.regime.emaShort);
    const ema50 = indicators.ema(prices, config.regime.emaLong);
    const rsi   = indicators.rsi(prices, config.regime.rsiPeriod);
    const adxR  = indicators.adx(highs, lows, closes, config.regime.adxPeriod);

    let bull = 0, bear = 0;
    const signals = [];

    // Trend (40 pts)
    if (ema20 && ema50) {
      if (cur > ema20 && ema20 > ema50)      { bull += 40; signals.push({ type: 'TREND', dir: 'BULLISH', detail: 'Price>EMA20>EMA50' }); }
      else if (cur < ema20 && ema20 < ema50) { bear += 40; signals.push({ type: 'TREND', dir: 'BEARISH', detail: 'Price<EMA20<EMA50' }); }
      else signals.push({ type: 'TREND', dir: 'NEUTRAL', detail: 'Mixed' });
    }

    // ADX (30 pts)
    if (adxR) {
      if (adxR.adx > config.regime.adxThreshold) {
        if (adxR.plusDI > adxR.minusDI) { bull += 30; signals.push({ type: 'ADX', dir: 'BULLISH', detail: `ADX=${adxR.adx.toFixed(1)}` }); }
        else                             { bear += 30; signals.push({ type: 'ADX', dir: 'BEARISH', detail: `ADX=${adxR.adx.toFixed(1)}` }); }
      } else signals.push({ type: 'ADX', dir: 'NEUTRAL', detail: `ADX=${adxR.adx.toFixed(1)} weak` });
    }

    // RSI (30 pts)
    if (rsi !== null) {
      if (rsi > config.regime.rsiBullish)      { bull += 30; signals.push({ type: 'RSI', dir: 'BULLISH', detail: `RSI=${rsi.toFixed(1)}` }); }
      else if (rsi < config.regime.rsiBearish) { bear += 30; signals.push({ type: 'RSI', dir: 'BEARISH', detail: `RSI=${rsi.toFixed(1)}` }); }
      else signals.push({ type: 'RSI', dir: 'NEUTRAL', detail: `RSI=${rsi.toFixed(1)}` });
    }

    return { bull, bear, signals, ready: true, indic: { ema20, ema50, rsi, adx: adxR?.adx, cur } };
  }

  detect() {
    if (this.manualOverride && (!this.manualOverrideExpiry || Date.now() < this.manualOverrideExpiry)) {
      return { regime: this.manualOverride, confidence: 100, source: 'manual', signals: [] };
    }

    const n  = this._indexSignal(this.nifty50Token);
    const bk = this._indexSignal(this.niftyBankToken);

    if (!n.ready && !bk.ready) {
      return { regime: this.current, confidence: 0, source: 'insufficient_data', signals: [] };
    }

    const w50 = config.regime.nifty50Weight / 100;
    const wBk = config.regime.niftyBankWeight / 100;
    let totalBull = 0, totalBear = 0, totalW = 0;

    if (n.ready)  { totalBull += n.bull  * w50; totalBear += n.bear  * w50; totalW += w50; }
    if (bk.ready) { totalBull += bk.bull * wBk; totalBear += bk.bear * wBk; totalW += wBk; }

    if (totalW > 0) { totalBull /= totalW; totalBear /= totalW; }

    let regime = 'SIDEWAYS', confidence = 0;
    if (totalBull >= config.regime.bullishThreshold)      { regime = 'BULLISH'; confidence = Math.min(100, totalBull); }
    else if (totalBear >= config.regime.bearishThreshold) { regime = 'BEARISH'; confidence = Math.min(100, totalBear); }
    else confidence = Math.max(0, 100 - Math.max(totalBull, totalBear));

    const allSignals = [
      ...n.signals.map(s => ({ ...s, index: 'NIFTY50' })),
      ...bk.signals.map(s => ({ ...s, index: 'NIFTYBANK' }))
    ];

    return { regime, confidence, source: 'calculated', signals: allSignals,
             scores: { bull: totalBull, bear: totalBear },
             indicators: { nifty50: n.indic, niftyBank: bk.indic } };
  }

  update() {
    const d = this.detect();
    this.confidence = d.confidence;

    // Log summary
    if (d.source === 'insufficient_data') {
      const st = this.getDataStatus();
      logger.info(`Regime: waiting for data (NIFTY50: ${st.nifty50.dataPoints}/${st.nifty50.required}, Bank: ${st.niftyBank.dataPoints}/${st.niftyBank.required})`);
    } else if (d.source !== 'manual') {
      logger.info(`Regime check: ${d.regime} (bull:${d.scores?.bull?.toFixed(0)}%, bear:${d.scores?.bear?.toFixed(0)}%) | NIFTY50:${this.nifty50Price?.toFixed(0)} Bank:${this.niftyBankPrice?.toFixed(0)}`);
    }

    const timeSinceLast = Date.now() - this.lastChangeTime;
    if (d.regime !== this.current && timeSinceLast >= config.regime.hysteresisPeriod && d.source === 'calculated') {
      const prev = this.current;
      this.current = d.regime;
      this.lastChangeTime = Date.now();
      this.lastChange = Date.now();

      const entry = { timestamp: Date.now(), previousRegime: prev, newRegime: d.regime,
                      confidence: d.confidence, signals: d.signals,
                      nifty50Price: this.nifty50Price, niftyBankPrice: this.niftyBankPrice,
                      indicators: d.indicators };
      this.history.unshift(entry);
      if (this.history.length > 100) this.history.pop();

      if (this.database) {
        try { this.database.recordRegimeChange(entry); } catch (e) { logger.error('Failed to record regime change:', e.message); }
      }

      logger.info(`Regime changed: ${prev} -> ${d.regime} (confidence: ${d.confidence.toFixed(1)}%)`);
      return { changed: true, previousRegime: prev, newRegime: d.regime, confidence: d.confidence, signals: d.signals };
    }

    return { changed: false, regime: this.current, confidence: d.confidence, signals: d.signals };
  }

  setManual(regime, durationMs = null) {
    if (!['BULLISH', 'BEARISH', 'SIDEWAYS'].includes(regime)) throw new Error('Invalid regime: ' + regime);
    const prev = this.current;
    this.manualOverride = regime;
    this.manualOverrideExpiry = durationMs ? Date.now() + durationMs : null;
    this.current = regime;
    this.confidence = 100;
    this.lastChangeTime = Date.now();
    logger.info(`Manual regime override: ${regime}`);
    return { previousRegime: prev, newRegime: regime };
  }

  clearManual() {
    if (!this.manualOverride) return null;
    logger.info(`Manual override cleared (was: ${this.manualOverride})`);
    this.manualOverride = null;
    this.manualOverrideExpiry = null;
    this.lastChangeTime = 0;
    return this.update();
  }

  getState() {
    return {
      regime: this.current, confidence: this.confidence,
      lastChange: this.lastChange, isManualOverride: !!this.manualOverride,
      nifty50Price: this.nifty50Price, niftyBankPrice: this.niftyBankPrice
    };
  }

  getHistory(count = 20) { return this.history.slice(0, count); }

  getDataStatus() {
    const n  = indicators.getBuffer(this.nifty50Token);
    const bk = indicators.getBuffer(this.niftyBankToken);
    return {
      nifty50:  { dataPoints: n?.prices.length  || 0, required: config.regime.emaLong, ready: (n?.prices.length  || 0) >= config.regime.emaLong },
      niftyBank:{ dataPoints: bk?.prices.length || 0, required: config.regime.emaLong, ready: (bk?.prices.length || 0) >= config.regime.emaLong }
    };
  }
}

module.exports = new Regime();
