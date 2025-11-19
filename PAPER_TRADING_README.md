# Paper Trading Bot - 5% Grid Strategy

A virtual trading bot with a 5% grid trading strategy integrated into the MarketLogger project.

## Features

- **Virtual Portfolio Management**: Track virtual cash, holdings, and P&L without real trades
- **5% Grid Trading Strategy**: Automatically buy on 5% drops, sell on 5% rises
- **707 Stocks Monitored**: Works with all existing WebSocket subscriptions
- **SQLite Database**: Persistent storage for orders, holdings, and grid levels
- **Discord Integration**: Full command interface and real-time notifications
- **Configurable**: Adjust capital, trade amount, and grid percentage

## Architecture

### New Services

1. **database.service.js** - SQLite database management
   - Tables: virtual_orders, virtual_holdings, virtual_portfolio, grid_levels, config
   - Full transaction history and analytics

2. **paper-trading.service.js** - Virtual portfolio management
   - Execute virtual buy/sell orders
   - Track cash balance and holdings
   - Calculate P&L (realized and unrealized)
   - Portfolio snapshots

3. **grid-strategy.service.js** - 5% grid trading logic
   - Monitor live prices from ticker service
   - Trigger buy on 5% drop from reference
   - Trigger sell on 5% rise from last buy
   - Track grid levels per stock

4. **paper-trading.commands.js** - Discord command handlers
   - Portfolio viewing
   - Order history
   - P&L reports
   - Configuration management

### Database Schema

```sql
-- Orders: Complete transaction history
CREATE TABLE virtual_orders (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME,
  type TEXT,              -- BUY or SELL
  token TEXT,
  symbol TEXT,
  qty INTEGER,
  price REAL,
  value REAL,
  balance REAL,
  pnl REAL,
  pnl_percent REAL,
  grid_level INTEGER,
  reference_price REAL
);

-- Holdings: Current positions
CREATE TABLE virtual_holdings (
  token TEXT PRIMARY KEY,
  symbol TEXT,
  qty INTEGER,
  avg_price REAL,
  current_price REAL,
  invested_value REAL,
  current_value REAL,
  unrealized_pnl REAL,
  unrealized_pnl_percent REAL
);

-- Grid Levels: Trading state per stock
CREATE TABLE grid_levels (
  token TEXT PRIMARY KEY,
  symbol TEXT,
  last_buy_price REAL,
  last_sell_price REAL,
  reference_price REAL,
  buy_count INTEGER,
  sell_count INTEGER,
  total_pnl REAL,
  is_active BOOLEAN
);

-- Config: Bot settings
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

## Discord Commands

### Portfolio & Status
- `!status` - View bot status (trading enabled, grid active, cash, holdings, P&L)
- `!portfolio` - Detailed portfolio view with embed
- `!holdings` - List all current holdings with P&L

### Trading History
- `!orders [today|week|all]` - View order history
- `!pnl` - Profit & loss summary
- `!topstocks` - Best and worst performing stocks

### Grid Strategy
- `!grid <SYMBOL>` - View grid levels for specific stock
- `!grids` - View all active grids sorted by P&L

### Configuration
- `!config` - View current configuration
- `!config set amount_per_trade 15000` - Update trade amount
- `!config set grid_percentage 4.5` - Update grid percentage

### Bot Control
- `!start-trading` - Enable trading and activate grid strategy
- `!stop-trading` - Disable trading (no new orders)
- `!reset` - Reset entire portfolio (requires confirmation)

## Grid Trading Strategy

### How It Works

1. **Initialization**: When a stock is first seen, set reference price to current price

2. **Buy Trigger**: When price drops 5% from reference
   - Calculate quantity: `qty = floor(amount_per_trade / price)`
   - Execute virtual buy
   - Update reference price to buy price
   - Update last_buy_price

3. **Sell Trigger**: When price rises 5% from last buy
   - Sell all holdings for that stock
   - Calculate and record P&L
   - Update reference price to sell price
   - Update last_sell_price

4. **Grid Tracking**: Each stock maintains:
   - Reference price (updates on each trade)
   - Last buy price (for sell threshold)
   - Last sell price (historical)
   - Buy/sell counts
   - Total P&L

### Example

```
Initial: Stock at ₹100
Reference: ₹100

Price drops to ₹95 → BUY TRIGGER
- Buy 105 shares @ ₹95 (₹10,000 trade)
- Reference updated to ₹95
- Last buy: ₹95

Price rises to ₹99.75 → SELL TRIGGER
- Sell 105 shares @ ₹99.75
- P&L: ₹499.75 (5%)
- Reference updated to ₹99.75

Price drops to ₹94.76 → BUY TRIGGER
- Buy 105 shares @ ₹94.76
- And so on...
```

## Configuration

### Default Settings
- Initial Capital: ₹500,000
- Amount per Trade: ₹10,000
- Grid Percentage: 5.0%
- Max Positions per Stock: 5

### Environment Variables (.env)
```bash
PAPER_TRADING_ENABLED=false
INITIAL_CAPITAL=500000
AMOUNT_PER_TRADE=10000
GRID_PERCENTAGE=5.0
```

### Config File (src/config/paper-trading.config.json)
```json
{
  "enabled": false,
  "initial_capital": 500000,
  "amount_per_trade": 10000,
  "grid_percentage": 5.0,
  "max_positions_per_stock": 5,
  "trading_hours": {
    "start": "09:15",
    "end": "15:30"
  }
}
```

## Database File

- Location: `trading.db` (root directory)
- Format: SQLite3
- Auto-created on first run
- Persistent across restarts

## Integration with Existing Services

### Ticker Service
- Paper trading hooks into existing ticker.service.js
- Receives live price updates for all 707 stocks
- No changes to WebSocket subscription needed

### Discord Service
- Extends existing Discord bot commands
- Uses dedicated order channel for trade notifications (DISCORD_ORDER_CHANNEL_ID)
- Main log channel for system notifications
- Reuses Discord embeds for rich display

### Zerodha Service
- Uses instrument data for token mapping
- No real API calls for orders
- Read-only access to market data

## Usage

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Bot
```bash
npm start
```

### 3. Initialize (via Discord)
```
!config                  # View settings
!start-trading           # Enable trading
```

### 4. Monitor
```
!status                  # Check bot status
!portfolio               # View portfolio
!grids                   # See active grids
```

### 5. Review Performance
```
!pnl                     # P&L summary
!topstocks               # Best performers
!orders today            # Today's trades
```

## Order Logging

Every order is automatically logged to a dedicated Discord channel with:
- **Dedicated Channel**: All orders sent to `DISCORD_ORDER_CHANNEL_ID` (default: 1424357736820379668)
- 🟢 **BUY**: Symbol, qty, price, value, balance
- 🔴 **SELL**: Symbol, qty, price, P&L, %, balance
- 🎉 **Alert emoji** for >2% P&L on single trade
- 📈/📉 **P&L indicators** for profitable/loss trades
- ⏰ **IST Timestamp** for each order

Example:
```
🟢 BUY RELIANCE
Qty: 4 @ ₹2,450.50
Value: ₹9,802.00
Balance: ₹490,198.00

🔴 SELL RELIANCE
Qty: 4 @ ₹2,573.02
📈 P&L: ₹490.08 (5.00%) 🎉
Balance: ₹500,488.08
```

## Statistics & Analytics

### Database Queries
- Total P&L (realized + unrealized)
- Today's trades and P&L
- Per-stock performance
- Win/loss ratio
- Average hold time
- Grid efficiency

### Daily Summary (3:30 PM IST)
Automatic Discord message with:
- Portfolio value
- Today's trades
- Today's P&L
- Top 3 performers
- Bottom 3 performers

## Safety Features

1. **No Real Trading**: All orders are virtual
2. **Balance Check**: Prevents buying without sufficient balance
3. **Holdings Check**: Prevents selling without holdings
4. **Min Interval**: 5-second cooldown between trades per stock
5. **Confirmation**: Reset requires `!confirm-reset` within 30 seconds

## Files Created

```
src/
├── services/
│   ├── database.service.js          # NEW
│   ├── paper-trading.service.js     # NEW
│   ├── grid-strategy.service.js     # NEW
│   └── discord.service.js           # MODIFIED (added commands)
├── commands/
│   └── paper-trading.commands.js    # NEW
├── config/
│   └── paper-trading.config.json    # NEW
└── app.js                            # MODIFIED (integration)

Root:
├── trading.db                        # NEW (auto-created)
├── PAPER_TRADING_README.md          # NEW
├── .env.example                      # NEW
└── package.json                      # MODIFIED (dependencies)
```

## Dependencies Added

- `better-sqlite3` (^9.2.2) - SQLite database
- `decimal.js` (^10.4.3) - Precise decimal calculations

## Troubleshooting

### Bot not trading
```
!status                  # Check if trading enabled
!start-trading           # Enable if disabled
!config                  # Verify settings
```

### Grid not triggering
```
!grid SYMBOL             # Check grid levels
!grids                   # View all grids
!ticker status           # Check WebSocket
```

### Database issues
```bash
# Backup database
cp trading.db trading.db.backup

# Reset if corrupted
rm trading.db
# Restart bot to recreate
```

## Performance Tips

1. Start with small trade amounts (₹5,000-₹10,000)
2. Monitor for a few days before scaling up
3. Check `!topstocks` to identify best grid performers
4. Adjust grid percentage based on market volatility
5. Use `!orders week` to review trading frequency

## Future Enhancements

- [ ] Multiple grid levels (buy at -5%, -10%, -15%)
- [ ] Stop-loss integration
- [ ] Trailing stop-loss
- [ ] Position sizing based on volatility
- [ ] CSV export for analysis
- [ ] Web dashboard
- [ ] Backtesting module
- [ ] Custom grid % per stock

## Support

For issues or questions:
1. Check logs: `logs/` directory
2. Use `!debug` for system diagnostics
3. Use `!test` for connection tests
4. Review this README

## License

Same as parent project (MarketLogger)
