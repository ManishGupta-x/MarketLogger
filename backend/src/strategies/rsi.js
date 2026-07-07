const Strategy = require('./base');
const { rsi } = require('./indicators');

// Mean-reversion, long-only: buy when RSI crosses back up through the oversold
// threshold, sell (exit) when it crosses back down through overbought.
class RsiStrategy extends Strategy {
  generateSignals(candles) {
    const period = this.params.period || 14;
    const oversold = this.params.oversold ?? 30;
    const overbought = this.params.overbought ?? 70;
    const closes = candles.map(c => c.close);
    const values = rsi(closes, period);

    const signals = new Array(candles.length).fill(null);
    for (let i = 1; i < candles.length; i++) {
      if (values[i] == null || values[i - 1] == null) continue;
      const crossedUpFromOversold = values[i - 1] <= oversold && values[i] > oversold;
      const crossedDownFromOverbought = values[i - 1] >= overbought && values[i] < overbought;
      if (crossedUpFromOversold) signals[i] = 'buy';
      else if (crossedDownFromOverbought) signals[i] = 'sell';
    }
    return signals;
  }
}

module.exports = RsiStrategy;
