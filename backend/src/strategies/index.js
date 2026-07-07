const SmaCrossoverStrategy = require('./sma-crossover');
const RsiStrategy = require('./rsi');
const BreakoutStrategy = require('./breakout');

const REGISTRY = {
  sma_crossover: SmaCrossoverStrategy,
  rsi: RsiStrategy,
  breakout: BreakoutStrategy,
};

function createStrategy(type, params) {
  const StrategyClass = REGISTRY[type];
  if (!StrategyClass) throw new Error(`Unknown strategy type: ${type}. Valid types: ${Object.keys(REGISTRY).join(', ')}`);
  return new StrategyClass(params);
}

module.exports = { createStrategy, REGISTRY };
