const indicators = require('../indicators');
const logger = require('../../utils/logger');

/**
 * Distributes ticks to:
 *  1. Indicators (price buffers)
 *  2. SSE broadcast (latest tick map for streaming to frontend)
 *  3. Any registered tick listeners (strategy orchestrator)
 */
class TickProcessor {
  constructor() {
    this.latestTicks = new Map(); // token -> tick
    this.listeners = [];          // (ticks) => void
  }

  process(ticks) {
    for (const tick of ticks) {
      const token = tick.instrument_token;
      this.latestTicks.set(token, { ...tick, receivedAt: Date.now() });
      indicators.updateBuffer(token, tick);
    }

    // Notify strategy + SSE listeners
    for (const fn of this.listeners) {
      try { fn(ticks); } catch (err) { logger.error('Tick listener error:', err.message); }
    }
  }

  addListener(fn) { this.listeners.push(fn); }
  removeListener(fn) { this.listeners = this.listeners.filter(l => l !== fn); }

  getLatest(token) { return this.latestTicks.get(token) || null; }
  getAllLatest() { return Object.fromEntries(this.latestTicks); }

  getStatus() {
    return {
      trackedTokens: this.latestTicks.size,
      listeners: this.listeners.length
    };
  }
}

module.exports = new TickProcessor();
