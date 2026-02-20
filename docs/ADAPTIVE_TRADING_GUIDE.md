# Intelligent Market-Adaptive Trading System Guide

A comprehensive guide explaining how the adaptive trading system works in simple terms.

---

## Table of Contents
1. [The Big Picture](#the-big-picture)
2. [Market Regime Detection](#1-market-regime-detection-understanding-the-market-mood)
3. [Stock Selection](#2-stock-selection-picking-top-10-stocks)
4. [Intelligent Exit Logic](#3-intelligent-exit-logic-the-smart-part)
5. [How It All Works Together](#4-how-it-all-works-together)
6. [Safety Features](#5-safety-features-backstops)
7. [Technical Indicators Explained](#technical-indicators-explained-simply)
8. [What Zerodha API Provides](#what-zerodha-api-actually-gives-you)
9. [API Endpoints](#api-endpoints)
10. [Configuration](#configuration)

---

## The Big Picture

Think of your trading bot like a smart assistant that:
1. **Watches the market** to understand if it's going up, down, or sideways
2. **Picks the best 10 stocks** for that situation
3. **Knows when to hold winners** and **cut losers quickly**

---

## 1. Market Regime Detection (Understanding the Market Mood)

Your bot constantly watches **NIFTY 50** (60% weight) and **NIFTY Bank** (40% weight) to determine the market's mood:

### BULLISH Market (Market is Rising)
```
When detected:
- NIFTY price is ABOVE its 20-day and 50-day averages
- Trend strength (ADX) is strong (>25)
- Momentum (RSI) is above 60

What happens:
- Bot picks stocks with HIGH momentum (stocks going up fast)
- Looks for breakout stocks
- Prefers stocks outperforming the market
```

### BEARISH Market (Market is Falling)
```
When detected:
- NIFTY price is BELOW its 20-day and 50-day averages
- Trend strength (ADX) is strong (>25)
- Momentum (RSI) is below 40

What happens:
- Bot picks DEFENSIVE stocks (stable companies)
- Prefers LOW volatility stocks (less risky)
- Avoids high-beta stocks that fall faster
```

### SIDEWAYS Market (No Clear Direction)
```
When detected:
- NIFTY is bouncing between levels
- Trend strength (ADX) is weak (<25)
- RSI is neutral (40-60)

What happens:
- Bot picks MEAN REVERSION stocks
- Looks for oversold stocks (RSI < 30) to buy
- Looks for overbought stocks (RSI > 70) to sell
- Prefers stocks that bounce within a range
```

---

## 2. Stock Selection (Picking Top 10 Stocks)

Every 5 minutes, the bot re-screens all 678 stocks and picks the **top 10** based on the current market mood:

| Market Mood | What Stocks It Picks | Why |
|-------------|---------------------|-----|
| **BULLISH** | High momentum, strong relative strength | These stocks will rise fastest when market goes up |
| **BEARISH** | Low beta, low volatility, defensive | These stocks fall less when market drops |
| **SIDEWAYS** | Oversold/overbought, range-bound | These stocks bounce back, good for quick trades |

**Example:**
- In a BULLISH market, it might pick: TATA MOTORS, ADANI PORTS, BAJAJ FINANCE (high momentum stocks)
- In a BEARISH market, it might pick: HDFC BANK, ITC, NESTLE (stable, defensive stocks)

---

## 3. Intelligent Exit Logic (The Smart Part)

This is where your bot becomes truly intelligent:

### A. Trailing Stop - "Let Winners Run"

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

When RSI goes above 80, the stock is "overbought" - too many people have bought it. It's likely to reverse.

```
You buy TATA MOTORS at ₹600
Price rises to ₹650 (+8.3%)
RSI reaches 82 (overbought!)

Bot thinks: "Everyone has already bought. Who's left to buy?"
SELL at ₹650 before the reversal!
```

---

## 4. How It All Works Together

### Morning (9:15 AM - Market Opens)

```
1. Bot connects to Zerodha WebSocket
2. Starts receiving NIFTY 50 and NIFTY Bank prices
3. After ~1 minute of data: "Market looks BULLISH today"
4. Screens 678 stocks, picks top 10 momentum stocks
5. Ready to trade!
```

### During Trading (9:30 AM - 3:30 PM)

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

**Scenario 4: Sideways Market, Mean Reversion**
```
Market: SIDEWAYS
Active Stock: BHARTI AIRTEL (RSI was 28, oversold)

Buy at ₹850 (expecting bounce)
RSI rises to 45 → Price at ₹865 (+1.8%)
RSI rises to 65 → Price at ₹878 (+3.3%)
RSI reaches 82 → Momentum Exhaustion!
SELL at ₹885 (+4.1%)

Stock then falls back to ₹860. Good exit!
```

---

## 5. Safety Features (Backstops)

Even with all the smart logic, there's always a **hard stop loss at 2%** as a safety net:

```
If all else fails and price drops 2% from your buy price → EXIT

This prevents catastrophic losses even if other systems miss something.
```

---

## Summary: What Makes This Smart?

| Old System | New Smart System |
|------------|------------------|
| Fixed 0.5% profit target | Trailing stop lets profits grow to 2-5%+ |
| Fixed 1% stop loss | Rapid decline exits at 0.3% if falling fast |
| Trades any stock | Only trades top 10 stocks for current market |
| Same strategy always | Changes strategy based on market mood |
| No momentum tracking | Exits when RSI shows exhaustion |

---

# Technical Indicators Explained Simply

## 1. RSI (Relative Strength Index)

**What it is:** A speedometer for stocks (0 to 100)

**Simple Explanation:**
```
RSI tells you: "Is this stock being bought too much or sold too much?"

RSI = 0-30   → OVERSOLD (Too many people sold, price might bounce UP)
RSI = 30-70  → NORMAL (Balanced buying and selling)
RSI = 70-100 → OVERBOUGHT (Too many people bought, price might fall DOWN)
```

**Real Life Analogy:**
```
Think of a rubber band:
- RSI 80+ = Band stretched too far UP → Will snap back DOWN
- RSI 20  = Band stretched too far DOWN → Will snap back UP
- RSI 50  = Band is relaxed → Can go either way
```

**How Your Bot Uses It:**
| RSI Value | What Bot Thinks | Action |
|-----------|-----------------|--------|
| > 80 | "Everyone already bought, no buyers left!" | EXIT (Momentum Exhaustion) |
| 60-70 | "Good momentum, stock is strong" | BULLISH signal |
| 40-60 | "Normal, nothing special" | SIDEWAYS signal |
| 30-40 | "Weak momentum" | BEARISH signal |
| < 30 | "Everyone sold, might bounce back!" | Good for SIDEWAYS (mean reversion) |

---

## 2. EMA (Exponential Moving Average)

**What it is:** A smoothed-out average price that gives more importance to recent prices

**Simple Explanation:**
```
EMA is like asking: "What's the average price recently?"

EMA-20 = Average of last 20 periods (short-term trend)
EMA-50 = Average of last 50 periods (medium-term trend)
```

**Real Life Analogy:**
```
Imagine tracking your monthly expenses:
- EMA-20 = Your spending pattern for last 3 weeks (recent)
- EMA-50 = Your spending pattern for last 2 months (bigger picture)

If recent spending (EMA-20) is HIGHER than 2-month average (EMA-50):
→ You're spending MORE than usual (UPTREND in spending)
```

**How Your Bot Uses It:**
```
BULLISH Signal:
  Current Price > EMA-20 > EMA-50
  (Price is above short average, which is above long average)

  ₹105 (Price) > ₹102 (EMA-20) > ₹98 (EMA-50)
  = Stock is clearly going UP

BEARISH Signal:
  Current Price < EMA-20 < EMA-50
  (Price is below short average, which is below long average)

  ₹95 (Price) < ₹98 (EMA-20) < ₹102 (EMA-50)
  = Stock is clearly going DOWN
```

**Visual:**
```
BULLISH:                    BEARISH:
    Price ●                     EMA-50 ━━━━
   EMA-20 ━━━━                  EMA-20 ━━━━
   EMA-50 ━━━━                   Price ●

   Going UP ↑                  Going DOWN ↓
```

---

## 3. ADX (Average Directional Index)

**What it is:** Measures HOW STRONG the trend is (not direction, just strength)

**Simple Explanation:**
```
ADX tells you: "Is the market trending or just moving sideways?"

ADX 0-20  = WEAK trend (market is confused, moving sideways)
ADX 20-25 = MODERATE trend (starting to pick a direction)
ADX 25-50 = STRONG trend (clear direction, up OR down)
ADX 50+   = VERY STRONG trend (powerful move happening)
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

**How Your Bot Uses It:**
```
If ADX > 25 (Strong Trend):
  → Market has chosen a direction
  → Check OTHER indicators to know if UP or DOWN
  → Good for momentum trading

If ADX < 20 (Weak Trend):
  → Market is SIDEWAYS
  → Don't follow trends
  → Use mean reversion (buy low, sell high within range)
```

---

## 4. ATR (Average True Range)

**What it is:** Measures how much a stock moves up and down daily (volatility)

**Simple Explanation:**
```
ATR tells you: "How jumpy is this stock?"

High ATR = Stock moves A LOT each day (volatile)
Low ATR  = Stock moves LITTLE each day (stable)
```

**Real Life Analogy:**
```
Think of two people's moods:

Person A (High ATR): Very emotional
  - Happy in morning, angry by noon, excited by evening
  - Unpredictable, big swings

Person B (Low ATR): Very stable
  - Calm all day, minor mood changes
  - Predictable, small movements
```

**How Your Bot Uses It:**
```
For BULLISH market:
  → Prefers MODERATE ATR (not too crazy, but moves enough for profit)

For BEARISH market:
  → Prefers LOW ATR (stable stocks that won't crash hard)

For SIDEWAYS market:
  → Uses ATR to set proper stop losses
  → If ATR is ₹5, stop loss should be at least ₹5-10 away
```

---

## 5. Beta

**What it is:** How much a stock moves compared to NIFTY

**Simple Explanation:**
```
Beta = 1.0 → Stock moves SAME as market
Beta = 1.5 → Stock moves 50% MORE than market
Beta = 0.5 → Stock moves 50% LESS than market
Beta = 2.0 → Stock moves DOUBLE the market
```

**Real Life Analogy:**
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

**How Your Bot Uses It:**
| Market | Preferred Beta | Why |
|--------|---------------|-----|
| BULLISH | 1.0 - 1.5 (High) | These stocks rise MORE when market rises |
| BEARISH | 0.5 - 0.8 (Low) | These stocks fall LESS when market falls |
| SIDEWAYS | 0.8 - 1.2 (Moderate) | Balanced movement |

---

## 6. ROC (Rate of Change) / Momentum

**What it is:** How much the price changed in the last X days (as percentage)

**Simple Explanation:**
```
ROC = "How much did price change in last 10 days?"

ROC +5%  = Price went UP 5% in 10 days (good momentum)
ROC 0%   = Price stayed same
ROC -5%  = Price went DOWN 5% in 10 days (bad momentum)
```

**Real Life Analogy:**
```
Think of your fitness progress:

ROC +10% = You lost 10% weight in last month (great progress!)
ROC 0%   = Weight stayed same (no progress)
ROC -5%  = You gained 5% weight (going backwards)
```

**How Your Bot Uses It:**
```
For BULLISH market:
  → Picks stocks with HIGH positive ROC (going up fast)
  → Example: ADANI PORTS +8% in 10 days → Good pick!

For BEARISH market:
  → Avoids stocks with high negative ROC (falling fast)
  → Picks stocks with ROC near 0 (stable)

For SIDEWAYS market:
  → Looks for ROC reversals (was -3%, now turning positive)
```

---

## 7. Relative Strength (RS)

**What it is:** How a stock performs compared to NIFTY (not same as RSI!)

**Simple Explanation:**
```
RS > 1.0 = Stock is OUTPERFORMING the market
RS = 1.0 = Stock is performing SAME as market
RS < 1.0 = Stock is UNDERPERFORMING the market
```

**Real Life Analogy:**
```
In a classroom test:
- RS 1.2 = You scored 20% better than class average
- RS 1.0 = You scored exactly the class average
- RS 0.8 = You scored 20% below class average
```

**How Your Bot Uses It:**
```
For BULLISH market:
  → Picks RS > 1.1 (stocks beating the market)
  → These leaders will rise even more!

For BEARISH market:
  → Picks RS close to 1.0 (not falling more than market)
  → Stable performers

Example:
  NIFTY up 2% this month
  Stock A up 3% → RS = 1.5 (outperforming)
  Stock B up 1% → RS = 0.5 (underperforming)

  In BULLISH market, bot picks Stock A!
```

---

## How All Indicators Work Together

Your bot combines ALL these to make decisions:

### Example: Detecting BULLISH Market
```
✅ Price > EMA-20 > EMA-50 (uptrend)     → +40 points
✅ ADX > 25 (strong trend)               → +30 points
✅ RSI > 60 (good momentum)              → +30 points
                                         ___________
                                         100 points → BULLISH!
```

### Example: Picking a Stock in BULLISH Market
```
Stock: TATA MOTORS

✅ ROC = +6% (strong momentum)           → High score
✅ RS = 1.3 (beating market)             → High score
✅ RSI = 62 (not overbought)             → Good
✅ Beta = 1.4 (amplifies gains)          → Good for bullish
✅ Volatility = moderate                 → Acceptable

FINAL SCORE: 85/100 → TOP 10 STOCK!
```

### Example: Exit Decision
```
You're holding INFOSYS bought at ₹1500

Current price: ₹1550 (+3.3%)
RSI: 82 (overbought!)
Trailing stop: ₹1545

Decision tree:
1. Check Trailing Stop: ₹1550 > ₹1545 → Not hit
2. Check Rapid Decline: No sudden drop → Not triggered
3. Check RSI: 82 > 80 → MOMENTUM EXHAUSTION!

EXIT at ₹1550 with +3.3% profit
(RSI 82 means stock likely to reverse soon)
```

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

# What Zerodha API Actually Gives You

**Zerodha does NOT give you RSI, EMA, ADX, etc. directly!**

Zerodha only gives you **raw price data**. Your bot **calculates** all the indicators from this raw data.

## What Zerodha WebSocket Sends (Raw Data)

Every second, for each stock, you receive:

```javascript
{
  instrument_token: 256265,        // Stock ID (NIFTY 50)
  last_price: 22450.50,            // Current price

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

## How Your Bot Calculates Indicators

Your bot stores these prices over time and calculates everything:

### Step 1: Collect Price History
```
Every tick from Zerodha → Store in buffer

Time 9:30 → Price 100.00 → Store
Time 9:31 → Price 100.50 → Store
Time 9:32 → Price 100.30 → Store
...
Time 10:30 → Price 102.00 → Store

Now you have 60 price points (1 hour of data)
```

### Step 2: Calculate Indicators from History

**EMA-20 Calculation:**
```
Takes last 20 prices from buffer
Applies exponential smoothing formula
Returns: 101.25 (the 20-period EMA)
```

**RSI Calculation:**
```
Takes last 14 prices from buffer
Counts up-moves vs down-moves
Applies RSI formula
Returns: 65 (RSI value)
```

## Visual Flow

```
ZERODHA API                    YOUR BOT
    │                              │
    │  Raw tick data               │
    │  (price, volume, ohlc)       │
    │─────────────────────────────>│
    │                              │
    │                              ▼
    │                    ┌─────────────────┐
    │                    │ Price Buffer    │
    │                    │ [100, 101, 99,  │
    │                    │  102, 103, ...]  │
    │                    └────────┬────────┘
    │                              │
    │                              ▼
    │                    ┌─────────────────┐
    │                    │ Calculate:      │
    │                    │ • EMA-20        │
    │                    │ • EMA-50        │
    │                    │ • RSI           │
    │                    │ • ADX           │
    │                    │ • ATR           │
    │                    │ • Beta          │
    │                    │ • ROC           │
    │                    └────────┬────────┘
    │                              │
    │                              ▼
    │                    ┌─────────────────┐
    │                    │ Trading         │
    │                    │ Decisions       │
    │                    └─────────────────┘
```

## Summary

| Source | What It Provides |
|--------|-----------------|
| **Zerodha API** | Raw price (OHLC), Volume, Order book |
| **Your Bot** | RSI, EMA, ADX, ATR, Beta, ROC, Relative Strength |

**Zerodha = Raw ingredients (flour, eggs, sugar)**
**Your Bot = The recipe that turns them into cake (indicators)**

---

# API Endpoints

You can check what's happening via these URLs:

| Endpoint | What It Shows |
|----------|---------------|
| `GET /api/regime` | Current market mood (BULLISH/BEARISH/SIDEWAYS) |
| `GET /api/regime/stream` | SSE stream for regime changes |
| `GET /api/regime/history` | History of regime changes |
| `GET /api/active-stocks` | Current top 10 stocks being traded |
| `GET /api/stock-rankings` | Rankings for all regimes |
| `GET /api/stock-rankings?regime=BULLISH` | Rankings for specific regime |
| `GET /api/adaptive-info` | Full adaptive system status |
| `GET /api/exit-stats` | How many exits by each reason |

---

# Configuration

## Enable/Disable Adaptive Mode

Set in your `.env`:
```bash
ADAPTIVE_MODE=true   # Smart mode (default)
ADAPTIVE_MODE=false  # Old fixed grid mode
```

## All Configuration Options

```bash
# Adaptive Trading (replaces fixed grid)
ADAPTIVE_MODE=true
REGIME_CHECK_FREQUENCY=60000

# Regime Detection (combined NIFTY 50 + NIFTY Bank)
NIFTY_50_WEIGHT=60
NIFTY_BANK_WEIGHT=40
REGIME_EMA_SHORT=20
REGIME_EMA_LONG=50
REGIME_ADX_THRESHOLD=25
REGIME_CONFIDENCE_THRESHOLD=60

# Stock Screening
TOP_STOCKS_COUNT=10
SCREEN_FREQUENCY=300000

# Adaptive Exits (Balanced settings)
TRAILING_STOP_ACTIVATION=0.5
TRAILING_STOP_DISTANCE=0.3
RAPID_DECLINE_THRESHOLD=0.3
RAPID_DECLINE_WINDOW=5000
MOMENTUM_EXIT_RSI=80
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/services/technical-indicators.service.js` | Calculates all indicators from raw prices |
| `src/services/market-regime.service.js` | Detects BULLISH/BEARISH/SIDEWAYS |
| `src/services/stock-screener.service.js` | Selects top 10 stocks per regime |
| `src/services/adaptive-exit.service.js` | Trailing stops & rapid decline detection |
| `src/services/portfolio-risk.service.js` | Portfolio drawdown protection |
| `src/services/cost-calculator.service.js` | Brokerage, STT, slippage calculation |
| `src/config/adaptive-config.js` | All configurable parameters |
| `src/config/sector-mapping.js` | NSE stock sector classifications |

---

# Enhanced Features (v2.0)

## 1. Portfolio Risk Management

Protects your entire portfolio from excessive losses:

```
MAX_DAILY_DRAWDOWN=3.0  → Stop trading if portfolio drops 3% in a day
MAX_PORTFOLIO_HEAT=80   → Don't invest more than 80% of capital at once
```

### How It Works
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

### API Endpoints
```
GET /api/risk-status     → See current risk metrics
POST /api/risk-resume    → Manually resume trading after halt
```

---

## 2. Sector Diversification

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

### Default Limits Per Sector
```
Banking: max 2 stocks      IT: max 2 stocks
Pharma: max 2 stocks       Auto: max 2 stocks
FMCG: max 2 stocks         Energy: max 2 stocks
Metal: max 2 stocks        NBFC: max 2 stocks
Telecom: max 1 stock       Realty: max 1 stock
```

### Configuration
```bash
SECTOR_DIVERSIFICATION=true    # Enable (default)
SECTOR_LIMIT_BANKING=2         # Max 2 banking stocks
SECTOR_LIMIT_IT=2              # Max 2 IT stocks
# etc.
```

---

## 3. Gap Handling

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

### Configuration
```bash
GAP_THRESHOLD=1.0        # 1% gap triggers handling
GAP_PAUSE_DURATION=120000   # Pause exits for 2 minutes
GAP_STOP_ADJUST=0.5      # Widen stops by 0.5% after gap
```

---

## 4. Slippage & Impact Cost

Real trading isn't perfect - you don't always get the price you want:

```
You want to sell at ₹100...

Market order reality:
→ Base slippage: -0.05% = ₹99.95
→ If high volatility: -0.1% = ₹99.90
→ If large order: additional impact cost

Your bot now accounts for this!
```

### What Gets Deducted
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

### API Endpoint
```
GET /api/cost-estimate?price=100&qty=50&target=0.25

Returns:
{
  "orderValue": 5000,
  "estimatedCosts": 12.50,
  "estimatedSlippage": 5.00,
  "breakevenPercent": 0.17,
  "isProfitable": true
}
```

### Configuration
```bash
BASE_SLIPPAGE=0.05           # 0.05% base slippage
IMPACT_COST_PER_LAKH=0.02    # 0.02% per lakh order value
MAX_SLIPPAGE=0.3             # Cap at 0.3%
EXIT_SLIPPAGE=0.05           # Slippage on exits
```

---

## Full Configuration Reference

```bash
# ==========================================
# PORTFOLIO RISK MANAGEMENT
# ==========================================
MAX_DAILY_DRAWDOWN=3.0       # Stop at 3% daily loss
MAX_PORTFOLIO_HEAT=80        # Max 80% invested
DRAWDOWN_COOLDOWN=3600000    # 1 hour cooldown after halt

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
GAP_THRESHOLD=1.0            # 1% gap triggers handling
GAP_PAUSE_DURATION=120000    # 2 minute pause
GAP_STOP_ADJUST=0.5          # Widen stop by 0.5%

# ==========================================
# SLIPPAGE & COSTS
# ==========================================
BASE_SLIPPAGE=0.05           # 0.05% base
IMPACT_COST_PER_LAKH=0.02    # Per lakh impact
MAX_SLIPPAGE=0.3             # Maximum cap
EXIT_SLIPPAGE=0.05           # Exit slippage
SLIPPAGE_VOLATILITY_MULT=1.5 # High vol multiplier
```

---

## Summary: What's New in v2.0

| Feature | What It Does | Why It Matters |
|---------|--------------|----------------|
| **Portfolio Risk** | Stops trading at 3% daily loss | Protects from bad days |
| **Sector Diversification** | Max 2 stocks per sector | No concentration risk |
| **Gap Handling** | Pauses stops after market gaps | Prevents false triggers |
| **Slippage Accounting** | Factors in execution costs | Realistic profit expectations |
| **Cost Calculator** | Shows breakeven % | Know if trade is worth it |

All these work automatically when you enable `ADAPTIVE_MODE=true`!
