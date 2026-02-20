const Decimal = require('decimal.js');
const logger = require('../utils/logger');

/**
 * Cost Calculator Service
 * Calculates realistic trading costs including:
 * - Brokerage (Zerodha charges)
 * - STT (Securities Transaction Tax)
 * - Exchange transaction charges
 * - GST
 * - SEBI charges
 * - Stamp duty
 * - Slippage estimation
 * - Impact cost for larger orders
 */
class CostCalculatorService {
  constructor() {
    // Zerodha Intraday Charges (as of 2024)
    this.charges = {
      // Brokerage: 0.03% or Rs 20 per executed order, whichever is lower
      brokeragePercent: 0.03 / 100, // 0.03%
      brokerageMax: 20, // Max Rs 20 per order

      // STT: 0.025% on sell side only (intraday equity)
      sttPercent: 0.025 / 100,

      // Exchange Transaction Charges (NSE): 0.00345%
      exchangeChargesPercent: 0.00345 / 100,

      // GST: 18% on (brokerage + exchange charges)
      gstPercent: 18 / 100,

      // SEBI Charges: 0.0001%
      sebiChargesPercent: 0.0001 / 100,

      // Stamp Duty: 0.003% on buy side only (varies by state, using Maharashtra)
      stampDutyPercent: 0.003 / 100
    };

    // Slippage configuration
    this.slippageConfig = {
      // Base slippage for normal orders
      baseSlippagePercent: parseFloat(process.env.BASE_SLIPPAGE) || 0.05, // 0.05%

      // Additional slippage for larger orders (per lakh of order value)
      impactCostPerLakh: parseFloat(process.env.IMPACT_COST_PER_LAKH) || 0.02, // 0.02% per lakh

      // Maximum slippage cap
      maxSlippagePercent: parseFloat(process.env.MAX_SLIPPAGE) || 0.3, // 0.3%

      // Volatility multiplier (applied during high volatility)
      volatilityMultiplier: parseFloat(process.env.VOLATILITY_SLIPPAGE_MULTIPLIER) || 1.5
    };

    this.isInitialized = false;
  }

  /**
   * Initialize the service
   */
  initialize() {
    this.isInitialized = true;
    logger.info('Cost Calculator Service initialized');
    logger.info(`Base slippage: ${this.slippageConfig.baseSlippagePercent}%`);
    logger.info(`Impact cost: ${this.slippageConfig.impactCostPerLakh}% per lakh`);
    return true;
  }

  /**
   * Calculate all trading costs for a round-trip trade (buy + sell)
   * @param {number} buyPrice - Buy price
   * @param {number} sellPrice - Sell price
   * @param {number} qty - Quantity
   * @param {Object} options - Additional options
   * @returns {Object} Cost breakdown
   */
  calculateRoundTripCosts(buyPrice, sellPrice, qty, options = {}) {
    const buyValue = new Decimal(buyPrice).mul(qty);
    const sellValue = new Decimal(sellPrice).mul(qty);
    const turnover = buyValue.plus(sellValue);

    // Brokerage (both sides)
    let buyBrokerage = buyValue.mul(this.charges.brokeragePercent);
    if (buyBrokerage.gt(this.charges.brokerageMax)) {
      buyBrokerage = new Decimal(this.charges.brokerageMax);
    }

    let sellBrokerage = sellValue.mul(this.charges.brokeragePercent);
    if (sellBrokerage.gt(this.charges.brokerageMax)) {
      sellBrokerage = new Decimal(this.charges.brokerageMax);
    }

    const totalBrokerage = buyBrokerage.plus(sellBrokerage);

    // STT (sell side only for intraday)
    const stt = sellValue.mul(this.charges.sttPercent);

    // Exchange transaction charges (both sides)
    const exchangeCharges = turnover.mul(this.charges.exchangeChargesPercent);

    // SEBI charges
    const sebiCharges = turnover.mul(this.charges.sebiChargesPercent);

    // Stamp duty (buy side only)
    const stampDuty = buyValue.mul(this.charges.stampDutyPercent);

    // GST on brokerage and exchange charges
    const gstBase = totalBrokerage.plus(exchangeCharges);
    const gst = gstBase.mul(this.charges.gstPercent);

    // Total charges
    const totalCharges = totalBrokerage
      .plus(stt)
      .plus(exchangeCharges)
      .plus(sebiCharges)
      .plus(stampDuty)
      .plus(gst);

    // Gross P&L
    const grossPnL = sellValue.minus(buyValue);

    // Net P&L after charges
    const netPnL = grossPnL.minus(totalCharges);

    // Cost as percentage of turnover
    const costPercent = totalCharges.div(turnover).mul(100);

    return {
      buyValue: buyValue.toNumber(),
      sellValue: sellValue.toNumber(),
      turnover: turnover.toNumber(),
      breakdown: {
        brokerage: totalBrokerage.toNumber(),
        stt: stt.toNumber(),
        exchangeCharges: exchangeCharges.toNumber(),
        sebiCharges: sebiCharges.toNumber(),
        stampDuty: stampDuty.toNumber(),
        gst: gst.toNumber()
      },
      totalCharges: totalCharges.toNumber(),
      grossPnL: grossPnL.toNumber(),
      netPnL: netPnL.toNumber(),
      costPercent: costPercent.toNumber()
    };
  }

  /**
   * Calculate estimated slippage for an order
   * @param {number} orderValue - Order value in rupees
   * @param {string} side - 'BUY' or 'SELL'
   * @param {Object} options - Additional options (volatility, liquidity)
   * @returns {Object} Slippage estimate
   */
  calculateSlippage(orderValue, side, options = {}) {
    const { volatility = 1, isHighVolatility = false } = options;

    // Base slippage
    let slippagePercent = this.slippageConfig.baseSlippagePercent;

    // Add impact cost based on order size
    const orderValueLakhs = orderValue / 100000;
    const impactCost = orderValueLakhs * this.slippageConfig.impactCostPerLakh;
    slippagePercent += impactCost;

    // Apply volatility multiplier if high volatility
    if (isHighVolatility) {
      slippagePercent *= this.slippageConfig.volatilityMultiplier;
    }

    // Cap slippage
    slippagePercent = Math.min(slippagePercent, this.slippageConfig.maxSlippagePercent);

    // Calculate slippage amount
    const slippageAmount = (orderValue * slippagePercent) / 100;

    // Direction: BUY = pay more, SELL = receive less
    const adjustedValue = side === 'BUY'
      ? orderValue + slippageAmount
      : orderValue - slippageAmount;

    return {
      originalValue: orderValue,
      slippagePercent,
      slippageAmount,
      adjustedValue,
      direction: side === 'BUY' ? 'ADVERSE' : 'ADVERSE'
    };
  }

  /**
   * Apply slippage to a price
   * @param {number} price - Original price
   * @param {string} side - 'BUY' or 'SELL'
   * @param {number} qty - Quantity
   * @param {Object} options - Additional options
   * @returns {Object} Adjusted price with slippage
   */
  applySlippage(price, side, qty, options = {}) {
    const orderValue = price * qty;
    const slippage = this.calculateSlippage(orderValue, side, options);

    // BUY: price goes up, SELL: price goes down
    const slippageFactor = slippage.slippagePercent / 100;
    const adjustedPrice = side === 'BUY'
      ? price * (1 + slippageFactor)
      : price * (1 - slippageFactor);

    return {
      originalPrice: price,
      adjustedPrice,
      slippagePercent: slippage.slippagePercent,
      slippagePerShare: Math.abs(adjustedPrice - price),
      totalSlippage: slippage.slippageAmount
    };
  }

  /**
   * Calculate if a trade is profitable after all costs
   * @param {number} buyPrice - Intended buy price
   * @param {number} targetPrice - Target sell price
   * @param {number} qty - Quantity
   * @returns {Object} Profitability analysis
   */
  analyzeProfitability(buyPrice, targetPrice, qty) {
    // Apply slippage to both sides
    const buySlippage = this.applySlippage(buyPrice, 'BUY', qty);
    const sellSlippage = this.applySlippage(targetPrice, 'SELL', qty);

    // Calculate costs with slippage-adjusted prices
    const costs = this.calculateRoundTripCosts(
      buySlippage.adjustedPrice,
      sellSlippage.adjustedPrice,
      qty
    );

    // Calculate minimum profitable target
    const breakevenPercent = this.calculateBreakevenPercent(buyPrice, qty);

    return {
      theoreticalGross: (targetPrice - buyPrice) * qty,
      actualGross: costs.grossPnL,
      totalCosts: costs.totalCharges,
      totalSlippage: buySlippage.totalSlippage + sellSlippage.totalSlippage,
      netPnL: costs.netPnL,
      isProfitable: costs.netPnL > 0,
      breakevenPercent,
      effectiveBuyPrice: buySlippage.adjustedPrice,
      effectiveSellPrice: sellSlippage.adjustedPrice,
      costBreakdown: costs.breakdown
    };
  }

  /**
   * Calculate minimum percentage gain needed to break even
   * @param {number} price - Buy price
   * @param {number} qty - Quantity
   * @returns {number} Breakeven percentage
   */
  calculateBreakevenPercent(price, qty) {
    const orderValue = price * qty;

    // Estimate total costs for a round trip at same price
    const testCosts = this.calculateRoundTripCosts(price, price, qty);

    // Add slippage
    const buySlippage = this.calculateSlippage(orderValue, 'BUY');
    const sellSlippage = this.calculateSlippage(orderValue, 'SELL');
    const totalSlippage = buySlippage.slippageAmount + sellSlippage.slippageAmount;

    // Total overhead
    const totalOverhead = testCosts.totalCharges + totalSlippage;

    // Breakeven percentage
    return (totalOverhead / orderValue) * 100;
  }

  /**
   * Get estimated costs for a trade
   * @param {number} price - Stock price
   * @param {number} qty - Quantity
   * @param {number} targetPercent - Target percentage gain
   * @returns {Object} Cost estimate
   */
  estimateTradeCosts(price, qty, targetPercent = 0.25) {
    const targetPrice = price * (1 + targetPercent / 100);
    const analysis = this.analyzeProfitability(price, targetPrice, qty);

    return {
      orderValue: price * qty,
      targetValue: targetPrice * qty,
      targetPercent,
      estimatedCosts: analysis.totalCosts,
      estimatedSlippage: analysis.totalSlippage,
      estimatedNetPnL: analysis.netPnL,
      breakevenPercent: analysis.breakevenPercent,
      isProfitable: analysis.isProfitable
    };
  }

  /**
   * Get summary of charge rates
   * @returns {Object} Charge rates
   */
  getChargeRates() {
    return {
      brokerage: `${this.charges.brokeragePercent * 100}% or max Rs ${this.charges.brokerageMax}`,
      stt: `${this.charges.sttPercent * 100}% (sell side)`,
      exchangeCharges: `${this.charges.exchangeChargesPercent * 100}%`,
      gst: `${this.charges.gstPercent * 100}% on brokerage+exchange`,
      sebiCharges: `${this.charges.sebiChargesPercent * 100}%`,
      stampDuty: `${this.charges.stampDutyPercent * 100}% (buy side)`,
      slippage: {
        base: `${this.slippageConfig.baseSlippagePercent}%`,
        impactPerLakh: `${this.slippageConfig.impactCostPerLakh}%`,
        max: `${this.slippageConfig.maxSlippagePercent}%`
      }
    };
  }

  /**
   * Get service status
   * @returns {Object} Status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      chargeRates: this.getChargeRates(),
      exampleBreakeven: this.calculateBreakevenPercent(100, 50) // Example: Rs 100 stock, 50 qty
    };
  }
}

module.exports = new CostCalculatorService();
