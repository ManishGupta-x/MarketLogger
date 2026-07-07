const Strategy = require('./base');
const { highest, lowest } = require('./indicators');

// Long-only channel breakout: buy on a new N-day high, sell (exit) on a new
// N-day low. Uses only bars strictly before the current one for the channel
// so the breakout is measured against prior data, not the bar it fires on.
class BreakoutStrategy extends Strategy {
  generateSignals(candles) {
    const lookback = this.params.lookbackPeriod || 20;
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);

    const signals = new Array(candles.length).fill(null);
    for (let i = lookback; i < candles.length; i++) {
      const priorHigh = highest(highs, lookback, i - 1);
      const priorLow = lowest(lows, lookback, i - 1);
      if (closes[i] > priorHigh) signals[i] = 'buy';
      else if (closes[i] < priorLow) signals[i] = 'sell';
    }
    return signals;
  }
}

module.exports = BreakoutStrategy;
