# MarketLogger

Automated Grid Trading Bot with Calendar-Based Strategy Management

## System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DAILY AUTOMATION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                │
│   │  8:00 AM    │      │  MARKET     │      │  3:40 PM    │                │
│   │  IST        │      │  HOURS      │      │  IST        │                │
│   │             │      │             │      │             │                │
│   │  • Login    │ ───► │  • Monitor  │ ───► │  • Close    │                │
│   │  • Refresh  │      │  • Trade    │      │  • Report   │                │
│   │  • Load     │      │  • Log      │      │  • Save     │                │
│   │    Strategy │      │             │      │             │                │
│   └─────────────┘      └─────────────┘      └─────────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         STRATEGY CALENDAR                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐                │
│   │  MON     │   │  TUE     │   │  WED     │   │  THU     │   ...         │
│   │          │   │          │   │          │   │          │                │
│   │ Grid: 0.25│   │ Grid: 0.3│   │ HOLIDAY  │   │ Grid: 0.25│               │
│   │ Target:0.5│   │ Target:0.6│  │          │   │ Target:0.5│               │
│   │ Capital:1L│   │ Capital:1L│  │ (Holi)   │   │ Capital:1L│               │
│   └──────────┘   └──────────┘   └──────────┘   └──────────┘                │
│                                                                             │
│   Pre-feed strategies → Auto-loads daily → Fallback to previous if missing │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          GRID TRADING                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Price ▲                                                                   │
│         │     ┌───┐ SELL (Target %)                                        │
│         │     │   │                                                         │
│         │  ───┼───┼─── Reference Price                                     │
│         │     │   │                                                         │
│         │     └───┘ BUY (Grid %)                                           │
│         │                                                                   │
│         └──────────────────────────────► Time                              │
│                                                                             │
│   • Buy when price drops by Grid %                                         │
│   • Sell when price rises by Target % from buy price                       │
│   • Stop loss at configured %                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          ARCHITECTURE                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐         ┌─────────────────┐                          │
│   │    FRONTEND     │   SSE   │     BACKEND     │                          │
│   │    (Vercel)     │ ◄─────► │    (Railway)    │                          │
│   │                 │         │                 │                          │
│   │  • Dashboard    │         │  • Trading Bot  │                          │
│   │  • Portfolio    │         │  • WebSocket    │                          │
│   │  • Live Logs    │         │  • Cron Jobs    │                          │
│   │  • Strategies   │         │  • Database     │                          │
│   └─────────────────┘         └─────────────────┘                          │
│                                       │                                     │
│                                       ▼                                     │
│                               ┌───────────────┐                            │
│                               │   ZERODHA     │                            │
│                               │   API         │                            │
│                               └───────────────┘                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Commands

```bash
# Feed strategy for a week
npm run calendar:feed -- --range=2026-02-23:2026-02-27 --grid=0.25 --target=0.5 --sl=1 --per-trade=5000 --capital=100000

# Mark holiday
npm run calendar:feed -- --date=2026-03-10 --holiday --notes="Holi"

# View calendar
npm run calendar:list

# Start bot
npm start
```
