// Every strategy takes an array of daily candles ({date,open,high,low,close,volume})
// and returns a parallel array of signals: 'buy' | 'sell' | null at each index.
// A signal at index i is generated from data available through bar i's close;
// the backtest engine (and paper trading) is responsible for executing it at
// bar i+1's open so there is never any lookahead.
class Strategy {
  constructor(params = {}) {
    this.params = params;
  }

  generateSignals(candles) {
    throw new Error('generateSignals must be implemented by subclass');
  }
}

module.exports = Strategy;
