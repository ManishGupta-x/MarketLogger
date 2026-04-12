const Decimal = require('decimal.js');
const logger = require('../../utils/logger');

/**
 * Zerodha trading cost calculator (intraday equity).
 * Brokerage, STT, exchange charges, SEBI, GST, stamp duty, slippage.
 */
class Costs {
  constructor() {
    this.charges = {
      brokeragePercent: 0.03 / 100,   // 0.03%
      brokerageMax: 20,                // Rs 20 cap
      sttPercent: 0.025 / 100,         // sell side only
      exchangePercent: 0.00345 / 100,
      gstPercent: 18 / 100,
      sebiPercent: 0.0001 / 100,
      stampDutyPercent: 0.003 / 100   // buy side only
    };
    this.slippage = {
      basePercent: 0.05,
      impactPerLakh: 0.02,
      maxPercent: 0.3,
      volMultiplier: 1.5
    };
    this.initialized = false;
  }

  initialize() {
    this.initialized = true;
    logger.info(`Costs: base slippage=${this.slippage.basePercent}%, impact=${this.slippage.impactPerLakh}%/lakh`);
    return true;
  }

  roundTrip(buyPrice, sellPrice, qty) {
    const buy  = new Decimal(buyPrice);
    const sell = new Decimal(sellPrice);
    const q    = new Decimal(qty);
    const buyV  = buy.mul(q);
    const sellV = sell.mul(q);
    const turnover = buyV.plus(sellV);

    let bBuy  = buyV.mul(this.charges.brokeragePercent);
    if (bBuy.gt(this.charges.brokerageMax)) bBuy = new Decimal(this.charges.brokerageMax);
    let bSell = sellV.mul(this.charges.brokeragePercent);
    if (bSell.gt(this.charges.brokerageMax)) bSell = new Decimal(this.charges.brokerageMax);
    const totalBrok = bBuy.plus(bSell);

    const stt      = sellV.mul(this.charges.sttPercent);
    const exchange = turnover.mul(this.charges.exchangePercent);
    const sebi     = turnover.mul(this.charges.sebiPercent);
    const stamp    = buyV.mul(this.charges.stampDutyPercent);
    const gst      = totalBrok.plus(exchange).mul(this.charges.gstPercent);
    const total    = totalBrok.plus(stt).plus(exchange).plus(sebi).plus(stamp).plus(gst);
    const gross    = sellV.minus(buyV);
    const net      = gross.minus(total);

    return {
      buyValue: buyV.toNumber(), sellValue: sellV.toNumber(), turnover: turnover.toNumber(),
      breakdown: {
        brokerage:       totalBrok.toNumber(),
        stt:             stt.toNumber(),
        exchangeCharges: exchange.toNumber(),
        sebiCharges:     sebi.toNumber(),
        stampDuty:       stamp.toNumber(),
        gst:             gst.toNumber()
      },
      totalCharges: total.toNumber(),
      grossPnL: gross.toNumber(),
      netPnL: net.toNumber(),
      costPercent: total.div(turnover).mul(100).toNumber()
    };
  }

  calcSlippage(orderValue, side, isHighVol = false) {
    let pct = this.slippage.basePercent;
    pct += (orderValue / 100000) * this.slippage.impactPerLakh;
    if (isHighVol) pct *= this.slippage.volMultiplier;
    pct = Math.min(pct, this.slippage.maxPercent);
    const amt = (orderValue * pct) / 100;
    return { slippagePercent: pct, slippageAmount: amt, adjustedValue: side === 'BUY' ? orderValue + amt : orderValue - amt };
  }

  breakevenPercent(price, qty) {
    const costs = this.roundTrip(price, price, qty);
    const slip  = this.calcSlippage(price * qty, 'BUY').slippageAmount + this.calcSlippage(price * qty, 'SELL').slippageAmount;
    return ((costs.totalCharges + slip) / (price * qty)) * 100;
  }

  estimateTrade(price, qty, targetPercent = 0.25) {
    const targetPrice = price * (1 + targetPercent / 100);
    const costs = this.roundTrip(price, targetPrice, qty);
    const slip  = this.calcSlippage(price * qty, 'BUY').slippageAmount + this.calcSlippage(targetPrice * qty, 'SELL').slippageAmount;
    return {
      orderValue: price * qty,
      targetValue: targetPrice * qty,
      targetPercent,
      estimatedCosts: costs.totalCharges,
      estimatedSlippage: slip,
      estimatedNetPnL: costs.netPnL - slip,
      breakevenPercent: this.breakevenPercent(price, qty),
      isProfitable: (costs.netPnL - slip) > 0
    };
  }

  getChargeRates() {
    const c = this.charges;
    return {
      brokerage: `${c.brokeragePercent * 100}% or max Rs ${c.brokerageMax}`,
      stt: `${c.sttPercent * 100}% (sell)`,
      exchange: `${c.exchangePercent * 100}%`,
      gst: `${c.gstPercent * 100}% on brok+exchange`,
      sebi: `${c.sebiPercent * 100}%`,
      stampDuty: `${c.stampDutyPercent * 100}% (buy)`,
      slippage: { base: `${this.slippage.basePercent}%`, impactPerLakh: `${this.slippage.impactPerLakh}%`, max: `${this.slippage.maxPercent}%` }
    };
  }

  getStatus() {
    return { initialized: this.initialized, chargeRates: this.getChargeRates(), exampleBreakeven: this.breakevenPercent(100, 50) };
  }
}

module.exports = new Costs();
