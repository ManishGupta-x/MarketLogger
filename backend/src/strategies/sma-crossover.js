const Strategy = require('./base');
const { sma } = require('./indicators');

// Long-only: buy when the fast SMA crosses above the slow SMA, sell (exit) on
// the reverse cross.
class SmaCrossoverStrategy extends Strategy {
  generateSignals(candles) {
    const fastPeriod = this.params.fastPeriod || 10;
    const slowPeriod = this.params.slowPeriod || 30;
    const closes = candles.map(c => c.close);
    const fast = sma(closes, fastPeriod);
    const slow = sma(closes, slowPeriod);

    const signals = new Array(candles.length).fill(null);
    for (let i = 1; i < candles.length; i++) {
      if (fast[i] == null || slow[i] == null || fast[i - 1] == null || slow[i - 1] == null) continue;
      const crossedUp = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
      const crossedDown = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
      if (crossedUp) signals[i] = 'buy';
      else if (crossedDown) signals[i] = 'sell';
    }
    return signals;
  }
}

module.exports = SmaCrossoverStrategy;
