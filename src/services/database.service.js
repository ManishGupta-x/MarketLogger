const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.db = null;
  }

  initialize() {
    // Use DATABASE_PATH env var for Railway, otherwise default to local data folder
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/portfolio.db');

    // Ensure data directory exists
    const fs = require('fs');
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.createTables();
    logger.info(`SQLite database initialized at ${dbPath}`);
  }

  createTables() {
    // Transactions table - stores all buy/sell orders
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL')),
        token INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        qty INTEGER NOT NULL,
        price REAL NOT NULL,
        value REAL NOT NULL,
        brokerage REAL DEFAULT 0,
        pnl REAL DEFAULT 0,
        pnl_percent REAL DEFAULT 0,
        balance_after REAL NOT NULL,
        grid_level INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // Holdings table - current portfolio holdings
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS holdings (
        token INTEGER PRIMARY KEY,
        symbol TEXT NOT NULL,
        qty INTEGER NOT NULL,
        avg_price REAL NOT NULL,
        invested_value REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // Portfolio state table - stores portfolio metadata
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS portfolio_state (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        cash_balance REAL NOT NULL,
        initial_capital REAL NOT NULL,
        realized_pnl REAL DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // Daily PnL tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_pnl (
        date TEXT PRIMARY KEY,
        realized_pnl REAL DEFAULT 0,
        trades_count INTEGER DEFAULT 0,
        buy_value REAL DEFAULT 0,
        sell_value REAL DEFAULT 0
      )
    `);

    // Daily strategies table - stores daily strategy params and performance
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        grid_percentage REAL NOT NULL,
        target_percentage REAL NOT NULL,
        stop_loss_percentage REAL NOT NULL,
        per_trade_amount REAL NOT NULL,
        capital REAL NOT NULL,
        total_trades INTEGER DEFAULT 0,
        buy_count INTEGER DEFAULT 0,
        sell_count INTEGER DEFAULT 0,
        winning_trades INTEGER DEFAULT 0,
        losing_trades INTEGER DEFAULT 0,
        realized_pnl REAL DEFAULT 0,
        total_brokerage REAL DEFAULT 0,
        buy_value REAL DEFAULT 0,
        sell_value REAL DEFAULT 0,
        win_rate REAL DEFAULT 0,
        max_single_win REAL DEFAULT 0,
        max_single_loss REAL DEFAULT 0,
        pnl_percent REAL DEFAULT 0,
        ending_cash_balance REAL DEFAULT 0,
        ending_holdings_count INTEGER DEFAULT 0,
        ending_holdings_value REAL DEFAULT 0,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed')),
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        completed_at TEXT
      )
    `);

    // Strategy calendar table - for pre-feeding strategies
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS strategy_calendar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        grid_percentage REAL NOT NULL,
        target_percentage REAL NOT NULL,
        stop_loss_percentage REAL NOT NULL,
        per_trade_amount REAL NOT NULL,
        capital REAL NOT NULL,
        is_holiday INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // Create indexes for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_symbol ON transactions(symbol);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_strategy_calendar_date ON strategy_calendar(date);
    `);
  }

  // Portfolio State Methods
  initializePortfolio(initialCapital) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO portfolio_state (id, cash_balance, initial_capital, realized_pnl)
      VALUES (1, ?, ?, 0)
    `);
    stmt.run(initialCapital, initialCapital);
  }

  getPortfolioState() {
    const stmt = this.db.prepare('SELECT * FROM portfolio_state WHERE id = 1');
    return stmt.get();
  }

  updateCashBalance(newBalance) {
    const stmt = this.db.prepare(`
      UPDATE portfolio_state
      SET cash_balance = ?, updated_at = datetime('now', 'localtime')
      WHERE id = 1
    `);
    stmt.run(newBalance);
  }

  addRealizedPnl(pnl) {
    const stmt = this.db.prepare(`
      UPDATE portfolio_state
      SET realized_pnl = realized_pnl + ?, updated_at = datetime('now', 'localtime')
      WHERE id = 1
    `);
    stmt.run(pnl);
  }

  // Transaction Methods
  recordTransaction(transaction) {
    const stmt = this.db.prepare(`
      INSERT INTO transactions (type, token, symbol, qty, price, value, brokerage, pnl, pnl_percent, balance_after, grid_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      transaction.type,
      transaction.token,
      transaction.symbol,
      transaction.qty,
      transaction.price,
      transaction.value,
      transaction.brokerage || 0,
      transaction.pnl || 0,
      transaction.pnlPercent || 0,
      transaction.balanceAfter,
      transaction.gridLevel || 0
    );

    // Update daily PnL
    if (transaction.type === 'SELL' && transaction.pnl) {
      this.updateDailyPnl(transaction.pnl, transaction.value, 'sell');
    } else if (transaction.type === 'BUY') {
      this.updateDailyPnl(0, transaction.value, 'buy');
    }

    return result.lastInsertRowid;
  }

  getTransactions(limit = 100, offset = 0) {
    const stmt = this.db.prepare(`
      SELECT * FROM transactions
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  }

  getTransactionsBySymbol(symbol, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM transactions
      WHERE symbol = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(symbol, limit);
  }

  getTodayTransactions() {
    const stmt = this.db.prepare(`
      SELECT * FROM transactions
      WHERE date(created_at, '+5 hours', '30 minutes') = date('now', '+5 hours', '30 minutes')
      ORDER BY created_at DESC
    `);
    return stmt.all();
  }

  // Holdings Methods
  upsertHolding(token, symbol, qty, avgPrice, investedValue) {
    const stmt = this.db.prepare(`
      INSERT INTO holdings (token, symbol, qty, avg_price, invested_value)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        qty = excluded.qty,
        avg_price = excluded.avg_price,
        invested_value = excluded.invested_value,
        updated_at = datetime('now', 'localtime')
    `);
    stmt.run(token, symbol, qty, avgPrice, investedValue);
  }

  deleteHolding(token) {
    const stmt = this.db.prepare('DELETE FROM holdings WHERE token = ?');
    stmt.run(token);
  }

  getHolding(token) {
    const stmt = this.db.prepare('SELECT * FROM holdings WHERE token = ?');
    return stmt.get(token);
  }

  getAllHoldings() {
    const stmt = this.db.prepare('SELECT * FROM holdings ORDER BY symbol');
    return stmt.all();
  }

  // Daily PnL Methods
  updateDailyPnl(pnl, value, type) {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().split('T')[0];

    const existing = this.db.prepare('SELECT * FROM daily_pnl WHERE date = ?').get(today);

    if (existing) {
      if (type === 'sell') {
        const stmt = this.db.prepare(`
          UPDATE daily_pnl
          SET realized_pnl = realized_pnl + ?, trades_count = trades_count + 1, sell_value = sell_value + ?
          WHERE date = ?
        `);
        stmt.run(pnl, value, today);
      } else {
        const stmt = this.db.prepare(`
          UPDATE daily_pnl
          SET trades_count = trades_count + 1, buy_value = buy_value + ?
          WHERE date = ?
        `);
        stmt.run(value, today);
      }
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO daily_pnl (date, realized_pnl, trades_count, buy_value, sell_value)
        VALUES (?, ?, 1, ?, ?)
      `);
      stmt.run(today, pnl, type === 'buy' ? value : 0, type === 'sell' ? value : 0);
    }
  }

  getDailyPnl(days = 30) {
    const stmt = this.db.prepare(`
      SELECT * FROM daily_pnl
      ORDER BY date DESC
      LIMIT ?
    `);
    return stmt.all(days);
  }

  getTodayPnl() {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().split('T')[0];
    const stmt = this.db.prepare('SELECT * FROM daily_pnl WHERE date = ?');
    return stmt.get(today) || { date: today, realized_pnl: 0, trades_count: 0, buy_value: 0, sell_value: 0 };
  }

  // Statistics
  getStats() {
    const totalTrades = this.db.prepare('SELECT COUNT(*) as count FROM transactions').get();
    const totalBuys = this.db.prepare("SELECT COUNT(*) as count, SUM(value) as total FROM transactions WHERE type = 'BUY'").get();
    const totalSells = this.db.prepare("SELECT COUNT(*) as count, SUM(value) as total, SUM(pnl) as pnl FROM transactions WHERE type = 'SELL'").get();
    const profitableTrades = this.db.prepare("SELECT COUNT(*) as count FROM transactions WHERE type = 'SELL' AND pnl > 0").get();
    const lossTrades = this.db.prepare("SELECT COUNT(*) as count FROM transactions WHERE type = 'SELL' AND pnl < 0").get();

    return {
      totalTrades: totalTrades.count,
      totalBuys: totalBuys.count,
      totalBuyValue: totalBuys.total || 0,
      totalSells: totalSells.count,
      totalSellValue: totalSells.total || 0,
      totalPnl: totalSells.pnl || 0,
      profitableTrades: profitableTrades.count,
      lossTrades: lossTrades.count,
      winRate: totalSells.count > 0 ? ((profitableTrades.count / totalSells.count) * 100).toFixed(2) : 0
    };
  }

  // Daily Strategy Methods
  createDailyStrategy(params) {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().split('T')[0];
    const stmt = this.db.prepare(`
      INSERT INTO daily_strategies (date, grid_percentage, target_percentage, stop_loss_percentage, per_trade_amount, capital, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `);
    return stmt.run(
      today,
      params.gridPercentage,
      params.targetPercentage,
      params.stopLossPercentage,
      params.perTradeAmount,
      params.capital
    );
  }

  updateDailyStrategy(date, metrics) {
    const fields = Object.keys(metrics).map(k => `${k} = ?`).join(', ');
    const stmt = this.db.prepare(`
      UPDATE daily_strategies SET ${fields} WHERE date = ?
    `);
    return stmt.run(...Object.values(metrics), date);
  }

  getDailyStrategy(date) {
    const stmt = this.db.prepare('SELECT * FROM daily_strategies WHERE date = ?');
    return stmt.get(date);
  }

  getTodayStrategy() {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().split('T')[0];
    return this.getDailyStrategy(today);
  }

  getAllDailyStrategies(limit = 30) {
    const stmt = this.db.prepare(`
      SELECT * FROM daily_strategies
      ORDER BY date DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  // Strategy Calendar Methods

  /**
   * Add or update a strategy in the calendar
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Object} params - Strategy parameters
   */
  upsertCalendarStrategy(date, params) {
    const stmt = this.db.prepare(`
      INSERT INTO strategy_calendar (date, grid_percentage, target_percentage, stop_loss_percentage, per_trade_amount, capital, is_holiday, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        grid_percentage = excluded.grid_percentage,
        target_percentage = excluded.target_percentage,
        stop_loss_percentage = excluded.stop_loss_percentage,
        per_trade_amount = excluded.per_trade_amount,
        capital = excluded.capital,
        is_holiday = excluded.is_holiday,
        notes = excluded.notes,
        updated_at = datetime('now', 'localtime')
    `);
    return stmt.run(
      date,
      params.gridPercentage,
      params.targetPercentage,
      params.stopLossPercentage,
      params.perTradeAmount,
      params.capital,
      params.isHoliday ? 1 : 0,
      params.notes || null
    );
  }

  /**
   * Get strategy from calendar for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Object|null} Strategy params or null
   */
  getCalendarStrategy(date) {
    const stmt = this.db.prepare('SELECT * FROM strategy_calendar WHERE date = ?');
    return stmt.get(date);
  }

  /**
   * Get the most recent strategy before a given date (fallback logic)
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Object|null} Most recent strategy or null
   */
  getLastCalendarStrategy(date) {
    const stmt = this.db.prepare(`
      SELECT * FROM strategy_calendar
      WHERE date < ? AND is_holiday = 0
      ORDER BY date DESC
      LIMIT 1
    `);
    return stmt.get(date);
  }

  /**
   * Get strategy for a date with fallback to the most recent strategy
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Object} Strategy with source indicator
   */
  getCalendarStrategyWithFallback(date) {
    // First check if date is marked as holiday
    const calendarEntry = this.getCalendarStrategy(date);
    if (calendarEntry && calendarEntry.is_holiday === 1) {
      return { strategy: null, source: 'holiday', date: date };
    }

    // If strategy exists for this date, use it
    if (calendarEntry) {
      return { strategy: calendarEntry, source: 'calendar', date: date };
    }

    // Fallback to the most recent strategy
    const fallbackStrategy = this.getLastCalendarStrategy(date);
    if (fallbackStrategy) {
      return { strategy: fallbackStrategy, source: 'fallback', date: fallbackStrategy.date };
    }

    return { strategy: null, source: 'none', date: null };
  }

  /**
   * Get upcoming calendar entries
   * @param {number} days - Number of days to look ahead
   * @returns {Array} List of upcoming strategies
   */
  getUpcomingCalendarStrategies(days = 7) {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().split('T')[0];
    const stmt = this.db.prepare(`
      SELECT * FROM strategy_calendar
      WHERE date >= ?
      ORDER BY date ASC
      LIMIT ?
    `);
    return stmt.all(today, days);
  }

  /**
   * Delete a calendar entry
   * @param {string} date - Date in YYYY-MM-DD format
   */
  deleteCalendarStrategy(date) {
    const stmt = this.db.prepare('DELETE FROM strategy_calendar WHERE date = ?');
    return stmt.run(date);
  }

  /**
   * Mark a date as a market holiday
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} notes - Optional reason
   */
  markAsHoliday(date, notes = null) {
    const stmt = this.db.prepare(`
      INSERT INTO strategy_calendar (date, grid_percentage, target_percentage, stop_loss_percentage, per_trade_amount, capital, is_holiday, notes)
      VALUES (?, 0, 0, 0, 0, 0, 1, ?)
      ON CONFLICT(date) DO UPDATE SET
        is_holiday = 1,
        notes = ?,
        updated_at = datetime('now', 'localtime')
    `);
    return stmt.run(date, notes, notes);
  }

  // Reset portfolio (for testing)
  resetPortfolio(initialCapital) {
    this.db.exec('DELETE FROM transactions');
    this.db.exec('DELETE FROM holdings');
    this.db.exec('DELETE FROM daily_pnl');
    this.initializePortfolio(initialCapital);
    logger.info('Portfolio reset in database');
  }

  close() {
    if (this.db) {
      this.db.close();
      logger.info('Database connection closed');
    }
  }
}

module.exports = new DatabaseService();
