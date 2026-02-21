# Intelligent Market-Adaptive Trading System Guide

A comprehensive guide explaining how the adaptive trading system works in simple terms.

---

## Table of Contents

1. [Zerodha API - Raw Data](#1-zerodha-api---raw-data)
2. [Technical Indicators](#2-technical-indicators)
3. [Bot Algorithm](#3-bot-algorithm)
   - [Market Regime Detection](#31-market-regime-detection)
   - [Stock Selection](#32-stock-selection)
   - [Intelligent Exit Logic](#33-intelligent-exit-logic)
4. [How It All Works Together](#4-how-it-all-works-together)
5. [Safety Features](#5-safety-features)
6. [Enhanced Features v2.0](#6-enhanced-features-v20)
7. [API Endpoints](#7-api-endpoints)
8. [Configuration](#8-configuration)
9. [Files Reference](#9-files-reference)

---

# 1. Zerodha API - Raw Data

**Zerodha does NOT give you RSI, EMA, ADX, etc. directly!**

Zerodha only gives you **raw price data**. Your bot **calculates** all the indicators from this raw data.

## What Zerodha WebSocket Sends

Every **~1 second**, for each subscribed stock, you receive:

```javascript
{
  instrument_token: 256265,        // Stock ID (e.g., NIFTY 50)
  last_price: 22450.50,            // Current trading price

  ohlc: {
    open: 22380.00,                // Today's opening price
    high: 22520.00,                // Today's highest price
    low: 22350.00,                 // Today's lowest price
    close: 22400.00                // Yesterday's closing price
  },

  volume_traded: 1250000,          // Total shares traded today
  last_traded_quantity: 150,       // Last trade size
  total_buy_quantity: 500000,      // Pending buy orders
  total_sell_quantity: 450000      // Pending sell orders
}
```

**That's it!** Just prices and volumes. No indicators.

## Data Frequency & Latency

| Metric | Value |
|--------|-------|
| **Tick Frequency** | ~1 tick/second per stock |
| **WebSocket Latency** | 10-50ms |
| **Data Points Stored** | Last 200 per stock |
| **Buffer Memory** | ~500 bytes per stock |

## Raw Data Summary

| Field | Description | Update Frequency |
|-------|-------------|------------------|
| `last_price` | Current market price | Every tick (~1s) |
| `ohlc.open` | Day's opening price | Once at market open |
| `ohlc.high` | Day's highest price | Updates throughout day |
| `ohlc.low` | Day's lowest price | Updates throughout day |
| `ohlc.close` | Previous day's close | Static |
| `volume_traded` | Total volume today | Every tick |
| `last_traded_quantity` | Size of last trade | Every tick |
| `total_buy_quantity` | Pending buy orders | Every tick |
| `total_sell_quantity` | Pending sell orders | Every tick |

---

# 2. Technical Indicators

Your bot calculates all indicators from raw price data. Here's each indicator with calculation complexity and time.

## Calculation Overview

| Indicator | Min Data Points | Calculation Time | Complexity |
|-----------|-----------------|------------------|------------|
| **SMA** | 20 or 50 | <1ms | O(n) |
| **EMA** | 20 or 50 | <1ms | O(n) |
| **RSI** | 15 | <1ms | O(n) |
| **ATR** | 15 | <1ms | O(n) |
| **ADX** | 28 | 1-2ms | O(n) |
| **ROC** | 11 | <1ms | O(1) |
| **Beta** | 21 | 2-3ms | O(n) |
| **Volatility** | 21 | 1-2ms | O(n) |
| **Relative Strength** | 20 | <1ms | O(1) |
| **All Indicators** | 50 | 5-10ms | Combined |

---

## 2.1 SMA (Simple Moving Average)

**Calculation Time:** <1ms | **Data Required:** 20-50 prices

**What it is:** Average of last N prices

```
SMA-20 = (P1 + P2 + ... + P20) / 20

Example:
Prices: [100, 101, 102, 99, 100, 101, 103, 102, 104, 105,
         103, 102, 104, 106, 105, 107, 108, 106, 107, 108]
SMA-20 = 103.65
```

**Formula:**
```javascript
calculateSMA(prices, period) {
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}
```

---

## 2.2 EMA (Exponential Moving Average)

**Calculation Time:** <1ms | **Data Required:** 20-50 prices

**What it is:** Weighted average giving more importance to recent prices

```
Multiplier = 2 / (period + 1)
EMA = (Current Price - Previous EMA) × Multiplier + Previous EMA

Example:
EMA-20 Multiplier = 2/21 = 0.095
If previous EMA = 100, current price = 105:
New EMA = (105 - 100) × 0.095 + 100 = 100.475
```

**Real Life Analogy:**
```
Think of tracking your monthly expenses:
- EMA-20 = Your spending pattern for last 3 weeks (recent focus)
- EMA-50 = Your spending pattern for last 2 months (bigger picture)

If recent spending (EMA-20) > 2-month average (EMA-50):
→ You're spending MORE than usual (UPTREND in spending)
```

**How Bot Uses It:**
```
BULLISH Signal:
  Current Price > EMA-20 > EMA-50
  ₹105 (Price) > ₹102 (EMA-20) > ₹98 (EMA-50)
  = Stock is clearly going UP

BEARISH Signal:
  Current Price < EMA-20 < EMA-50
  ₹95 (Price) < ₹98 (EMA-20) < ₹102 (EMA-50)
  = Stock is clearly going DOWN
```

---

## 2.3 RSI (Relative Strength Index)

**Calculation Time:** <1ms | **Data Required:** 15 prices (14 period + 1)

**What it is:** A speedometer for stocks (0 to 100)

```
RSI tells you: "Is this stock being bought too much or sold too much?"

RSI = 0-30   → OVERSOLD (Too many people sold, price might bounce UP)
RSI = 30-70  → NORMAL (Balanced buying and selling)
RSI = 70-100 → OVERBOUGHT (Too many people bought, price might fall DOWN)
```

**Calculation Steps:**
```javascript
// Step 1: Calculate price changes
changes = [+1, -0.5, +2, +1.5, -1, +0.5, ...] // 14 changes needed

// Step 2: Separate gains and losses
gains = [1, 0, 2, 1.5, 0, 0.5, ...];
losses = [0, 0.5, 0, 0, 1, 0, ...];

// Step 3: Calculate averages
avgGain = sum(gains) / 14;
avgLoss = sum(losses) / 14;

// Step 4: Calculate RS and RSI
RS = avgGain / avgLoss;
RSI = 100 - (100 / (1 + RS));
```

**How Bot Uses It:**
| RSI Value | What Bot Thinks | Action |
|-----------|-----------------|--------|
| > 80 | "Everyone already bought, no buyers left!" | EXIT (Momentum Exhaustion) |
| 60-70 | "Good momentum, stock is strong" | BULLISH signal |
| 40-60 | "Normal, nothing special" | SIDEWAYS signal |
| 30-40 | "Weak momentum" | BEARISH signal |
| < 30 | "Everyone sold, might bounce back!" | Good for mean reversion |

---

## 2.4 ATR (Average True Range)

**Calculation Time:** <1ms | **Data Required:** 15 candles (14 period + 1)

**What it is:** Measures how much a stock moves up and down daily (volatility)

```
True Range = MAX of:
  1. Current High - Current Low
  2. |Current High - Previous Close|
  3. |Current Low - Previous Close|

ATR = Average of last 14 True Ranges
```

**Example:**
```
Day data: High=105, Low=98, Previous Close=100

True Range candidates:
  105 - 98 = 7
  |105 - 100| = 5
  |98 - 100| = 2

True Range = 7 (maximum)

If ATR = ₹5, the stock typically moves ₹5 per day
```

**How Bot Uses It:**
```
BULLISH market:
  → Prefers MODERATE ATR (moves enough for profit)

BEARISH market:
  → Prefers LOW ATR (stable stocks that won't crash hard)

SIDEWAYS market:
  → Uses ATR to set proper stop losses
  → If ATR is ₹5, stop loss should be at least ₹5-10 away
```

---

## 2.5 ADX (Average Directional Index)

**Calculation Time:** 1-2ms | **Data Required:** 28 candles (14 × 2)

**What it is:** Measures HOW STRONG the trend is (not direction, just strength)

```
ADX 0-20  = WEAK trend (market is confused, moving sideways)
ADX 20-25 = MODERATE trend (starting to pick a direction)
ADX 25-50 = STRONG trend (clear direction, up OR down)
ADX 50+   = VERY STRONG trend (powerful move happening)
```

**Calculation Steps:**
```javascript
// Step 1: Calculate +DM and -DM
for each candle:
  highDiff = currentHigh - previousHigh
  lowDiff = previousLow - currentLow

  if (highDiff > lowDiff && highDiff > 0):
    +DM = highDiff
  if (lowDiff > highDiff && lowDiff > 0):
    -DM = lowDiff

// Step 2: Smooth +DM, -DM, and TR using EMA-14

// Step 3: Calculate +DI and -DI
+DI = (smoothed +DM / smoothed TR) × 100
-DI = (smoothed -DM / smoothed TR) × 100

// Step 4: Calculate DX and ADX
DX = |+DI - -DI| / (+DI + -DI) × 100
ADX = EMA of DX
```

**Real Life Analogy:**
```
Think of a car's speed:
- ADX 10 = Car stuck in traffic (no clear movement)
- ADX 25 = Car on city road (moving, but not fast)
- ADX 40 = Car on highway (moving with purpose)
- ADX 60 = Car racing (very strong movement)

ADX doesn't tell you if car is going NORTH or SOUTH,
just HOW FAST it's moving!
```

---

## 2.6 ROC (Rate of Change)

**Calculation Time:** <1ms | **Data Required:** 11 prices

**What it is:** How much the price changed in the last X days (as percentage)

```
ROC = ((Current Price - Price N days ago) / Price N days ago) × 100

Example:
Current Price = ₹105
Price 10 days ago = ₹100
ROC = ((105 - 100) / 100) × 100 = +5%
```

**How Bot Uses It:**
```
BULLISH market:
  → Picks stocks with HIGH positive ROC (going up fast)
  → Example: ADANI PORTS +8% in 10 days → Good pick!

BEARISH market:
  → Avoids stocks with high negative ROC (falling fast)
  → Picks stocks with ROC near 0 (stable)

SIDEWAYS market:
  → Looks for ROC reversals (was -3%, now turning positive)
```

---

## 2.7 Beta

**Calculation Time:** 2-3ms | **Data Required:** 21 prices (stock + market)

**What it is:** How much a stock moves compared to NIFTY

```
Beta = Covariance(stock returns, market returns) / Variance(market returns)

Beta = 1.0 → Stock moves SAME as market
Beta = 1.5 → Stock moves 50% MORE than market
Beta = 0.5 → Stock moves 50% LESS than market
Beta = 2.0 → Stock moves DOUBLE the market
```

**Example:**
```
If NIFTY goes up 1%:
  TATA MOTORS (Beta 1.5): Goes up 1.5%
  HDFC BANK (Beta 0.8):   Goes up 0.8%
  YES BANK (Beta 2.0):    Goes up 2.0%

If NIFTY goes DOWN 1%:
  TATA MOTORS (Beta 1.5): Goes DOWN 1.5%
  HDFC BANK (Beta 0.8):   Goes DOWN 0.8%
  YES BANK (Beta 2.0):    Goes DOWN 2.0%
```

**How Bot Uses It:**
| Market | Preferred Beta | Why |
|--------|---------------|-----|
| BULLISH | 1.0 - 1.5 (High) | These stocks rise MORE when market rises |
| BEARISH | 0.5 - 0.8 (Low) | These stocks fall LESS when market falls |
| SIDEWAYS | 0.8 - 1.2 (Moderate) | Balanced movement |

---

## 2.8 Volatility

**Calculation Time:** 1-2ms | **Data Required:** 21 prices

**What it is:** Standard deviation of returns, annualized

```
Step 1: Calculate daily returns
returns = [(P2-P1)/P1, (P3-P2)/P2, ...]

Step 2: Calculate standard deviation
stdDev = sqrt(variance of returns)

Step 3: Annualize
volatility = stdDev × sqrt(252) × 100  // 252 trading days
```

**Example:**
```
High Volatility (40%): Stock moves ±2.5% daily on average
Low Volatility (15%):  Stock moves ±0.9% daily on average
```

---

## 2.9 Relative Strength (RS)

**Calculation Time:** <1ms | **Data Required:** 20 prices (stock + market)

**What it is:** How a stock performs compared to NIFTY

```
RS = (1 + Stock Return) / (1 + Market Return)

RS > 1.0 = Stock is OUTPERFORMING the market
RS = 1.0 = Stock is performing SAME as market
RS < 1.0 = Stock is UNDERPERFORMING the market
```

**Example:**
```
NIFTY up 2% this month
Stock A up 3% → RS = 1.03/1.02 = 1.01 (outperforming)
Stock B up 1% → RS = 1.01/1.02 = 0.99 (underperforming)

In BULLISH market, bot picks Stock A!
```

---

## Data Flow: From Raw to Indicators

```
ZERODHA API                    YOUR BOT
    │                              │
    │  Raw tick data               │
    │  (price, volume, ohlc)       │
    │─────────────────────────────>│  ~10-50ms latency
    │                              │
    │                              ▼
    │                    ┌─────────────────┐
    │                    │ Price Buffer    │
    │                    │ Stores last 200 │  <1ms to store
    │                    │ prices per stock│
    │                    └────────┬────────┘
    │                              │
    │                              ▼
    │                    ┌─────────────────┐
    │                    │ Calculate:      │
    │                    │ • EMA-20  <1ms  │
    │                    │ • EMA-50  <1ms  │
    │                    │ • RSI     <1ms  │
    │                    │ • ADX    1-2ms  │
    │                    │ • ATR     <1ms  │
    │                    │ • Beta   2-3ms  │
    │                    │ • ROC     <1ms  │
    │                    │ ─────────────── │
    │                    │ Total:  5-10ms  │
    │                    └────────┬────────┘
    │                              │
    │                              ▼
    │                    ┌─────────────────┐
    │                    │ Trading         │
    │                    │ Decisions       │  <1ms
    │                    └─────────────────┘
```

**Total Processing Time per Tick:** ~10-15ms

---

# 3. Bot Algorithm

The bot uses indicators to make intelligent trading decisions.

## 3.1 Market Regime Detection

Your bot constantly watches **NIFTY 50** (60% weight) and **NIFTY Bank** (40% weight) to determine the market's mood.

### BULLISH Market
```
Detection Criteria:
├── NIFTY price > EMA-20 > EMA-50 (uptrend)     → +40 points
├── ADX > 25 (strong trend)                      → +30 points
└── RSI > 60 (good momentum)                     → +30 points
                                                  ───────────
                                                  100 points → BULLISH!

What happens:
├── Bot picks stocks with HIGH momentum
├── Looks for breakout stocks
└── Prefers stocks outperforming the market
```

### BEARISH Market
```
Detection Criteria:
├── NIFTY price < EMA-20 < EMA-50 (downtrend)   → +40 points
├── ADX > 25 (strong trend)                      → +30 points
└── RSI < 40 (weak momentum)                     → +30 points
                                                  ───────────
                                                  100 points → BEARISH!

What happens:
├── Bot picks DEFENSIVE stocks (stable companies)
├── Prefers LOW volatility stocks (less risky)
└── Avoids high-beta stocks that fall faster
```

### SIDEWAYS Market
```
Detection Criteria:
├── NIFTY bouncing between levels
├── ADX < 25 (weak trend)
└── RSI between 40-60 (neutral)
                                                 → SIDEWAYS

What happens:
├── Bot picks MEAN REVERSION stocks
├── Looks for oversold stocks (RSI < 30) to buy
├── Looks for overbought stocks (RSI > 70) to sell
└── Prefers stocks that bounce within a range
```

### Regime Detection Timing
| Operation | Frequency | Time Taken |
|-----------|-----------|------------|
| Tick Processing | Every ~1s | <1ms |
| Indicator Update | Every tick | 5-10ms |
| Regime Calculation | Every 60s | 10-20ms |
| Confidence Score | Every 60s | <5ms |

---

## 3.2 Stock Selection

Every **5 minutes**, the bot re-screens all 678 stocks and picks the **top 10** based on the current market mood.

### Screening Process
```
┌─────────────────────────────────────────────────────────┐
│                    STOCK SCREENING                       │
├─────────────────────────────────────────────────────────┤
│ Step 1: Get all 678 stocks                    (~1ms)    │
│ Step 2: Calculate indicators for each     (~5-10ms ea)  │
│ Step 3: Score based on current regime       (~1ms ea)   │
│ Step 4: Apply sector diversification         (~10ms)    │
│ Step 5: Pick top 10                          (~1ms)     │
├─────────────────────────────────────────────────────────┤
│ Total Time: ~3-5 seconds for full screen                │
│ Frequency: Every 5 minutes (300 seconds)                │
└─────────────────────────────────────────────────────────┘
```

### Stock Selection by Regime

| Market Mood | What Stocks It Picks | Why |
|-------------|---------------------|-----|
| **BULLISH** | High momentum, strong relative strength | These stocks will rise fastest when market goes up |
| **BEARISH** | Low beta, low volatility, defensive | These stocks fall less when market drops |
| **SIDEWAYS** | Oversold/overbought, range-bound | These stocks bounce back, good for quick trades |

### Scoring Example (BULLISH Market)

```
Stock: TATA MOTORS

✅ ROC = +6% (strong momentum)           → +25 points
✅ RS = 1.3 (beating market)             → +25 points
✅ RSI = 62 (not overbought)             → +20 points
✅ Beta = 1.4 (amplifies gains)          → +15 points
✅ Volatility = moderate                 → +15 points
                                         ───────────
FINAL SCORE: 100/100 → TOP 10 STOCK!
```

---

## 3.3 Intelligent Exit Logic

### A. Trailing Stop - "Let Winners Run"

**Calculation Time:** <1ms per position check

**Old Way (Fixed Target):**
```
Buy at ₹100 → Sell at ₹100.50 (0.5% profit) → Done

Problem: Stock might go to ₹105 but you already sold at ₹100.50!
```

**New Way (Trailing Stop):**
```
Buy at ₹100
Stock goes to ₹101 → Trailing stop activates at ₹100.70
Stock goes to ₹102 → Stop moves up to ₹101.70
Stock goes to ₹103 → Stop moves up to ₹102.70
Stock falls to ₹102.70 → SELL (locked in ₹2.70 profit instead of ₹0.50!)

The stop ONLY moves UP, never down. It "trails" behind the price.
```

**Real Example:**
```
You buy RELIANCE at ₹2500
↑ Price rises to ₹2520 (+0.8%) → Trailing stop activates at ₹2512
↑ Price rises to ₹2550 (+2%) → Stop moves to ₹2542
↑ Price rises to ₹2580 (+3.2%) → Stop moves to ₹2572
↓ Price falls to ₹2572 → SELL automatically

You made ₹72 profit (2.88%) instead of just ₹12.50 (0.5%) with fixed target!
```

### B. Rapid Decline Exit - "Cut Losers Quick"

**Calculation Time:** <1ms (checks last 5 seconds of prices)

**The Problem:**
Sometimes a stock drops very fast (bad news, market crash). Waiting for your normal stop loss (say 1%) might be too slow.

**The Solution:**
If price drops **0.3% within 5 seconds**, exit immediately!

**Example:**
```
You buy INFOSYS at ₹1500
5 seconds ago: Price was ₹1500
Now: Price is ₹1495.50 (dropped 0.3% in 5 seconds)

This is a "rapid decline" - something is wrong!
Bot exits IMMEDIATELY at ₹1495.50

2:00:30 - Price would have been: ₹1488 (another 1.2% drop!)

You saved 1.2% by exiting early!
```

### C. Momentum Exhaustion - "Know When to Leave the Party"

**Calculation Time:** <1ms (just checks RSI value)

When RSI goes above 80, the stock is "overbought" - too many people have bought it. It's likely to reverse.

```
You buy TATA MOTORS at ₹600
Price rises to ₹650 (+8.3%)
RSI reaches 82 (overbought!)

Bot thinks: "Everyone has already bought. Who's left to buy?"
SELL at ₹650 before the reversal!
```

### Exit Decision Timing

| Exit Type | Check Frequency | Decision Time |
|-----------|-----------------|---------------|
| Trailing Stop | Every tick (~1s) | <1ms |
| Rapid Decline | Every tick (~1s) | <1ms |
| RSI Exhaustion | Every tick (~1s) | <1ms |
| Hard Stop Loss | Every tick (~1s) | <1ms |

---

# 4. How It All Works Together

## Morning (9:15 AM - Market Opens)

```
1. Bot connects to Zerodha WebSocket        (~2 seconds)
2. Starts receiving NIFTY 50 and NIFTY Bank prices
3. Collects 50+ data points                 (~1-2 minutes)
4. After ~1 minute of data: "Market looks BULLISH today"
5. Screens 678 stocks, picks top 10         (~3-5 seconds)
6. Ready to trade!

Timeline:
  9:15:00 - Market opens, WebSocket connected
  9:15:02 - First ticks received
  9:16:30 - Enough data for regime detection
  9:16:35 - Initial regime calculated: BULLISH
  9:16:40 - First stock screen complete
  9:16:41 - Ready to trade!
```

## During Trading (9:30 AM - 3:30 PM)

**Scenario 1: Bullish Market, Stock Going Up**
```
Market: BULLISH
Active Stock: TATA MOTORS (in top 10 momentum stocks)

9:45 AM - Price drops 0.25% from reference → BUY at ₹600
10:00 AM - Price at ₹603 (+0.5%) → Trailing stop activates at ₹601.20
10:30 AM - Price at ₹612 (+2%) → Stop moves to ₹610.16
11:00 AM - Price at ₹618 (+3%) → Stop moves to ₹616.15
11:15 AM - Price dips to ₹616.15 → SELL (Trailing Stop)

Result: +2.7% profit instead of +0.5% with fixed target!
```

**Scenario 2: Market Turns Bearish Mid-Day**
```
12:00 PM - NIFTY starts falling
12:30 PM - Bot detects: "Market changed to BEARISH!"

What happens:
1. Updates stock list: Now picks defensive stocks (HDFC, ITC, etc.)
2. Won't buy momentum stocks anymore
3. Existing positions: Still protected by trailing stops

You get a notification: "Regime changed: BULLISH → BEARISH"
```

**Scenario 3: Stock Crashes Suddenly (Bad News)**
```
You're holding ADANI PORTS at ₹800

2:00 PM - Some bad news hits
2:00:00 - Price: ₹800
2:00:05 - Price: ₹797.60 (dropped 0.3% in 5 seconds!)

Rapid Decline Detector: "This is falling too fast!"
SELL immediately at ₹797.60

2:00:30 - Price would have been: ₹788 (another 1.2% drop!)

You saved 1.2% by exiting early!
```

---

# 5. Safety Features

## Hard Stop Loss
Even with all the smart logic, there's always a **hard stop loss at 2%** as a safety net:

```
If all else fails and price drops 2% from your buy price → EXIT

This prevents catastrophic losses even if other systems miss something.
```

## System Comparison

| Old System | New Smart System |
|------------|------------------|
| Fixed 0.5% profit target | Trailing stop lets profits grow to 2-5%+ |
| Fixed 1% stop loss | Rapid decline exits at 0.3% if falling fast |
| Trades any stock | Only trades top 10 stocks for current market |
| Same strategy always | Changes strategy based on market mood |
| No momentum tracking | Exits when RSI shows exhaustion |

---

# 6. Enhanced Features v2.0

## 6.1 Portfolio Risk Management

**Processing Time:** <5ms per check

Protects your entire portfolio from excessive losses:

```
MAX_DAILY_DRAWDOWN=3.0  → Stop trading if portfolio drops 3% in a day
MAX_PORTFOLIO_HEAT=80   → Don't invest more than 80% of capital at once
```

**How It Works:**
```
Your starting portfolio: ₹100,000

Trading happens throughout the day...
At 11:30 AM: Portfolio = ₹98,500 (down 1.5%)
  → Warning logged, continue trading

At 2:15 PM: Portfolio = ₹97,000 (down 3%)
  → TRADING HALTED! "Daily drawdown limit reached"
  → All new buys blocked
  → Existing positions monitored
  → Resumes next trading session
```

## 6.2 Sector Diversification

**Processing Time:** ~10ms during stock screening

Ensures you don't put all eggs in one basket:

```
Without diversification (old):
Top 10 = TCS, INFY, WIPRO, HCLTECH, TECHM, LTIM, MPHASIS, COFORGE, PERSISTENT, LTTS
→ ALL IT stocks! If IT sector crashes, you lose everything!

With diversification (new):
Top 10 = HDFCBANK, TCS, MARUTI, SUNPHARMA, ITC, RELIANCE, TATASTEEL, LT, TITAN, INFY
→ Banking, IT, Auto, Pharma, FMCG, Energy, Metal, Infra, Consumer
→ If one sector crashes, others protect you!
```

**Default Limits Per Sector:**
```
Banking: max 2 stocks      IT: max 2 stocks
Pharma: max 2 stocks       Auto: max 2 stocks
FMCG: max 2 stocks         Energy: max 2 stocks
Metal: max 2 stocks        NBFC: max 2 stocks
Telecom: max 1 stock       Realty: max 1 stock
```

## 6.3 Gap Handling

**Processing Time:** <1ms per check

Handles sudden price jumps when market opens:

```
Example: Market closes at ₹100, opens next day at ₹105 (5% gap)

Without gap handling (old):
→ Your trailing stop at ₹101 triggers immediately
→ You sell at ₹105 but missed potential ₹110

With gap handling (new):
→ Gap detected! 5% > 1% threshold
→ Trailing stops PAUSED for 2 minutes
→ After 2 minutes, recalculates stops from current price
→ New trailing stop set at ₹103 (based on ₹105)
```

## 6.4 Slippage & Impact Cost

**Processing Time:** <1ms per calculation

Real trading isn't perfect - you don't always get the price you want:

```
For a ₹10,000 trade:

Zerodha Charges:
  Brokerage:      ₹3-20 (0.03% or max ₹20)
  STT:            ₹2.50 (0.025% on sell)
  Exchange:       ₹0.35 (0.00345%)
  GST:            ₹0.60 (18% on brokerage+exchange)
  SEBI:           ₹0.01 (0.0001%)
  Stamp duty:     ₹0.30 (0.003% on buy)
                  ________
  Total charges:  ~₹7-25

Slippage:
  Base:           ₹5 (0.05%)
  Impact cost:    ₹2-10 (depends on size)
                  ________
  Total slippage: ~₹7-15

Minimum profit needed to break even: ~0.15-0.25%
```

## Features Summary

| Feature | What It Does | Processing Time |
|---------|--------------|-----------------|
| **Portfolio Risk** | Stops trading at 3% daily loss | <5ms |
| **Sector Diversification** | Max 2 stocks per sector | ~10ms |
| **Gap Handling** | Pauses stops after market gaps | <1ms |
| **Slippage Accounting** | Factors in execution costs | <1ms |
| **Cost Calculator** | Shows breakeven % | <1ms |

---

# 7. API Endpoints

You can check what's happening via these URLs:

## Market Regime

| Endpoint | What It Shows | Response Time |
|----------|---------------|---------------|
| `GET /api/regime` | Current market mood (BULLISH/BEARISH/SIDEWAYS) | <10ms |
| `GET /api/regime/stream` | SSE stream for regime changes | Streaming |
| `GET /api/regime/history` | History of regime changes | <20ms |

## Stock Data

| Endpoint | What It Shows | Response Time |
|----------|---------------|---------------|
| `GET /api/active-stocks` | Current top 10 stocks being traded | <10ms |
| `GET /api/stock-rankings` | Rankings for all regimes | <50ms |
| `GET /api/stock-rankings?regime=BULLISH` | Rankings for specific regime | <20ms |

## Trading Status

| Endpoint | What It Shows | Response Time |
|----------|---------------|---------------|
| `GET /api/adaptive-info` | Full adaptive system status | <10ms |
| `GET /api/exit-stats` | How many exits by each reason | <20ms |
| `GET /api/risk-status` | Current risk metrics | <10ms |
| `POST /api/risk-resume` | Manually resume trading after halt | <10ms |
| `GET /api/cost-estimate` | Estimate trade costs | <10ms |

## Portfolio & Orders

| Endpoint | What It Shows | Response Time |
|----------|---------------|---------------|
| `GET /api/portfolio` | Current portfolio state | <10ms |
| `GET /api/holdings` | Current holdings | <10ms |
| `GET /api/orders/today` | Today's orders | <20ms |
| `GET /api/daily-pnl` | Daily P&L history | <20ms |

---

# 8. Configuration

## Enable/Disable Adaptive Mode

Set in your `.env`:
```bash
ADAPTIVE_MODE=true   # Smart mode (default)
ADAPTIVE_MODE=false  # Old fixed grid mode
```

## All Configuration Options

```bash
# ==========================================
# ADAPTIVE TRADING
# ==========================================
ADAPTIVE_MODE=true
REGIME_CHECK_FREQUENCY=60000        # Check regime every 60s

# ==========================================
# REGIME DETECTION
# ==========================================
NIFTY_50_WEIGHT=60                  # NIFTY 50 contributes 60%
NIFTY_BANK_WEIGHT=40                # NIFTY Bank contributes 40%
REGIME_EMA_SHORT=20                 # Short EMA period
REGIME_EMA_LONG=50                  # Long EMA period
REGIME_ADX_THRESHOLD=25             # ADX threshold for trend
REGIME_CONFIDENCE_THRESHOLD=60      # Minimum confidence %

# ==========================================
# STOCK SCREENING
# ==========================================
TOP_STOCKS_COUNT=10                 # Number of stocks to trade
SCREEN_FREQUENCY=300000             # Screen every 5 minutes

# ==========================================
# ADAPTIVE EXITS
# ==========================================
TRAILING_STOP_ACTIVATION=0.5        # Activate after 0.5% profit
TRAILING_STOP_DISTANCE=0.3          # Trail 0.3% behind peak
RAPID_DECLINE_THRESHOLD=0.3         # Exit if 0.3% drop in 5s
RAPID_DECLINE_WINDOW=5000           # 5 second window
MOMENTUM_EXIT_RSI=80                # Exit when RSI > 80

# ==========================================
# PORTFOLIO RISK MANAGEMENT
# ==========================================
MAX_DAILY_DRAWDOWN=3.0              # Stop at 3% daily loss
MAX_PORTFOLIO_HEAT=80               # Max 80% invested
DRAWDOWN_COOLDOWN=3600000           # 1 hour cooldown after halt

# ==========================================
# SECTOR DIVERSIFICATION
# ==========================================
SECTOR_DIVERSIFICATION=true
SECTOR_LIMIT_BANKING=2
SECTOR_LIMIT_IT=2
SECTOR_LIMIT_PHARMA=2
SECTOR_LIMIT_AUTO=2
SECTOR_LIMIT_FMCG=2
SECTOR_LIMIT_ENERGY=2
SECTOR_LIMIT_METAL=2

# ==========================================
# GAP HANDLING
# ==========================================
GAP_THRESHOLD=1.0                   # 1% gap triggers handling
GAP_PAUSE_DURATION=120000           # 2 minute pause
GAP_STOP_ADJUST=0.5                 # Widen stop by 0.5%

# ==========================================
# SLIPPAGE & COSTS
# ==========================================
BASE_SLIPPAGE=0.05                  # 0.05% base
IMPACT_COST_PER_LAKH=0.02           # Per lakh impact
MAX_SLIPPAGE=0.3                    # Maximum cap
EXIT_SLIPPAGE=0.05                  # Exit slippage
SLIPPAGE_VOLATILITY_MULT=1.5        # High vol multiplier
```

---

# 9. Files Reference

| File | Purpose | Key Functions |
|------|---------|---------------|
| `src/services/technical-indicators.service.js` | Calculates all indicators from raw prices | calculateEMA, calculateRSI, calculateADX |
| `src/services/market-regime.service.js` | Detects BULLISH/BEARISH/SIDEWAYS | getRegime, detectRegime |
| `src/services/stock-screener.service.js` | Selects top 10 stocks per regime | screenStocks, getActiveStocks |
| `src/services/adaptive-exit.service.js` | Trailing stops & rapid decline detection | checkExit, updateTrailingStop |
| `src/services/portfolio-risk.service.js` | Portfolio drawdown protection | checkDrawdown, getRiskStatus |
| `src/services/cost-calculator.service.js` | Brokerage, STT, slippage calculation | estimateCosts, getBreakeven |
| `src/config/adaptive-config.js` | All configurable parameters | - |
| `src/config/sector-mapping.js` | NSE stock sector classifications | - |

---

## Quick Reference Card

| Indicator | What It Measures | Good for Bullish | Good for Bearish |
|-----------|-----------------|------------------|------------------|
| **RSI** | Overbought/Oversold | 50-70 | Avoid >70 |
| **EMA** | Trend direction | Price > EMA20 > EMA50 | Price < EMA20 < EMA50 |
| **ADX** | Trend strength | >25 (strong trend) | >25 or <20 (hide in sideways) |
| **ATR** | Daily movement | Moderate | Low (stable) |
| **Beta** | Market sensitivity | >1.0 (amplify gains) | <1.0 (reduce losses) |
| **ROC** | Momentum | High positive | Near zero |
| **RS** | vs Market performance | >1.0 (outperform) | ~1.0 (stable) |

---

All these work automatically when you enable `ADAPTIVE_MODE=true`!
