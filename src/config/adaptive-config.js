/**
 * Adaptive Trading Configuration
 * All configurable parameters for the intelligent trading system
 */

module.exports = {
  // Market Regime Detection Configuration
  regime: {
    // Moving average periods
    emaShort: parseInt(process.env.REGIME_EMA_SHORT) || 20,
    emaLong: parseInt(process.env.REGIME_EMA_LONG) || 50,

    // ADX (Average Directional Index) settings
    adxPeriod: parseInt(process.env.REGIME_ADX_PERIOD) || 14,
    adxThreshold: parseFloat(process.env.REGIME_ADX_THRESHOLD) || 25, // ADX > 25 = trending market

    // RSI settings
    rsiPeriod: parseInt(process.env.REGIME_RSI_PERIOD) || 14,
    rsiBullish: parseFloat(process.env.REGIME_RSI_BULLISH) || 60,   // RSI > 60 = bullish signal
    rsiBearish: parseFloat(process.env.REGIME_RSI_BEARISH) || 40,   // RSI < 40 = bearish signal

    // Regime detection thresholds
    bullishThreshold: parseInt(process.env.REGIME_BULLISH_THRESHOLD) || 60, // Score >= 60 = bullish
    bearishThreshold: parseInt(process.env.REGIME_BEARISH_THRESHOLD) || 60, // Score >= 60 = bearish

    // Timing
    checkFrequency: parseInt(process.env.REGIME_CHECK_FREQUENCY) || 60000, // Check every 60 seconds
    hysteresisPeriod: parseInt(process.env.REGIME_HYSTERESIS) || 300000,   // Hold regime for 5 min minimum

    // Index weights for combined signal (NIFTY 50 + NIFTY Bank)
    nifty50Weight: parseFloat(process.env.NIFTY_50_WEIGHT) || 60,
    niftyBankWeight: parseFloat(process.env.NIFTY_BANK_WEIGHT) || 40,

    // Index tokens (NSE)
    nifty50Token: 256265,   // NSE:NIFTY 50
    niftyBankToken: 260105  // NSE:NIFTY BANK
  },

  // Stock Screening Configuration
  screening: {
    topStocksCount: parseInt(process.env.TOP_STOCKS_COUNT) || 10,
    screenFrequency: parseInt(process.env.SCREEN_FREQUENCY) || 300000, // Re-screen every 5 minutes

    // Minimum data requirements
    minPriceHistory: parseInt(process.env.MIN_PRICE_HISTORY) || 50, // Min 50 price points needed

    // Scoring weights by regime
    weights: {
      bullish: {
        momentum: 30,       // ROC weight
        rsi: 20,           // RSI weight (prefer 50-70)
        relativeStrength: 25, // RS vs market
        beta: 10,          // Higher beta preferred
        volatility: 10,    // Moderate volatility
        volume: 5          // Volume surge
      },
      bearish: {
        momentum: 5,       // Low momentum weight
        rsi: 10,           // RSI (prefer stable)
        relativeStrength: 15, // Stable RS
        beta: 30,          // Low beta preferred (defensive)
        volatility: 30,    // Low volatility preferred
        volume: 10         // Volume
      },
      sideways: {
        momentum: 10,      // Low momentum
        rsi: 25,           // RSI at extremes (mean reversion)
        relativeStrength: 10,
        beta: 15,          // Moderate beta
        volatility: 20,    // Range-bound stocks
        volume: 20         // High volume for liquidity
      }
    },

    // RSI zones for screening
    rsiZones: {
      bullishMin: 50,
      bullishMax: 70,
      oversold: 30,
      overbought: 70
    },

    // Beta thresholds
    betaThresholds: {
      defensive: 0.8,    // Beta < 0.8 = defensive
      aggressive: 1.2    // Beta > 1.2 = aggressive
    }
  },

  // Adaptive Exit Configuration
  exit: {
    // Trailing stop settings
    trailingStop: {
      activation: parseFloat(process.env.TRAILING_STOP_ACTIVATION) || 0.5, // Activate at 0.5% gain
      distance: parseFloat(process.env.TRAILING_STOP_DISTANCE) || 0.3,     // Trail by 0.3%
      accelerate: process.env.TRAILING_STOP_ACCELERATE !== 'false',        // Tighten as profit grows
      accelerationStep: 0.05 // Reduce trail distance by 0.05% for each 1% gain
    },

    // Rapid decline detection (balanced setting)
    rapidDecline: {
      threshold: parseFloat(process.env.RAPID_DECLINE_THRESHOLD) || 0.3,   // 0.3% drop
      window: parseInt(process.env.RAPID_DECLINE_WINDOW) || 5000,          // in 5 seconds
      minDataPoints: 3 // Need at least 3 price points in window
    },

    // Momentum exhaustion settings
    momentumExit: {
      enabled: process.env.MOMENTUM_EXIT_ENABLED !== 'false',
      rsiThreshold: parseInt(process.env.MOMENTUM_EXIT_RSI) || 80 // Exit when RSI > 80
    },

    // Backstop stop loss (always active as safety)
    backstopStopLoss: parseFloat(process.env.BACKSTOP_STOP_LOSS) || 2.0 // Hard stop at 2% loss
  },

  // Position tracking
  position: {
    maxPriceHistory: 100, // Keep last 100 price points per position
    updateInterval: 1000  // Update position metrics every 1 second
  }
};
