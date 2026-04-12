/**
 * Central configuration — all constants with sensible defaults.
 * Only ZERODHA credentials and INITIAL_CAPITAL need to be in .env
 */
module.exports = {
  regime: {
    emaShort: 20,
    emaLong: 50,
    adxPeriod: 14,
    adxThreshold: 25,
    rsiPeriod: 14,
    rsiBullish: 60,
    rsiBearish: 40,
    bullishThreshold: 60,
    bearishThreshold: 60,
    checkFrequency: 60000,       // 60s
    hysteresisPeriod: 300000,    // 5 min
    nifty50Weight: 60,
    niftyBankWeight: 40,
    nifty50Token: 256265,
    niftyBankToken: 260105
  },

  screening: {
    topStocksCount: 10,
    screenFrequency: 300000,     // 5 min
    minPriceHistory: 50,
    weights: {
      bullish:  { momentum: 30, rsi: 20, relativeStrength: 25, beta: 10, volatility: 10, volume: 5 },
      bearish:  { momentum: 5,  rsi: 10, relativeStrength: 15, beta: 30, volatility: 30, volume: 10 },
      sideways: { momentum: 10, rsi: 25, relativeStrength: 10, beta: 15, volatility: 20, volume: 20 }
    },
    rsiZones: { bullishMin: 50, bullishMax: 70, oversold: 30, overbought: 70 },
    betaThresholds: { defensive: 0.8, aggressive: 1.2 }
  },

  exit: {
    trailingStop: {
      activation: 0.5,
      distance: 0.3,
      accelerate: true,
      accelerationStep: 0.05
    },
    rapidDecline: {
      threshold: 0.3,
      window: 5000,
      minDataPoints: 3
    },
    momentumExit: {
      enabled: true,
      rsiThreshold: 80
    },
    backstopStopLoss: 2.0
  },

  entry: {
    minCheckInterval: 5000,
    bullish:  { rsiMin: 50, rsiMax: 70, requireAboveEma20: true, pullbackThreshold: 1.0, minScore: 60 },
    bearish:  { rsiMin: 40, rsiMax: 60, maxVolatility: 25, maxNegativeRoc: -2, emaProximity: 2.0, minScore: 60 },
    sideways: { rsiOversold: 30, rsiNearOversold: 40, maxAdx: 25, supportLookback: 20, minScore: 50 }
  },

  position: {
    maxPriceHistory: 100,
    updateInterval: 1000
  },

  risk: {
    maxDailyDrawdown: 3.0,
    maxPortfolioHeat: 80,
    cooldownPeriodMs: 3600000
  },

  trading: {
    initialCapital: parseFloat(process.env.INITIAL_CAPITAL) || 100000,
    amountPerTrade: parseFloat(process.env.AMOUNT_PER_TRADE) || 6000
  },

  server: {
    port: parseInt(process.env.PORT) || 34000,
    allowedOrigin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
    internalApiKey: process.env.INTERNAL_API_KEY || null
  }
};
