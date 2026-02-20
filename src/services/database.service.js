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

    // Market regime history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS market_regime_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        regime TEXT NOT NULL CHECK(regime IN ('BULLISH', 'BEARISH', 'SIDEWAYS')),
        confidence REAL NOT NULL,
        nifty_price REAL,
        nifty_bank_price REAL,
        ema20 REAL,
        ema50 REAL,
        adx REAL,
        rsi REAL,
        signals TEXT,
        is_manual_override INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // Stock rankings snapshot
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stock_rankings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        regime TEXT NOT NULL CHECK(regime IN ('BULLISH', 'BEARISH', 'SIDEWAYS')),
        rank INTEGER NOT NULL,
        token INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        score REAL NOT NULL,
        momentum_score REAL,
        rsi REAL,
        relative_strength REAL,
        beta REAL,
        volatility REAL,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // Position tracking for adaptive exits
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS position_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        entry_price REAL NOT NULL,
        entry_time TEXT NOT NULL,
        current_trailing_stop REAL,
        highest_price REAL NOT NULL,
        lowest_price REAL NOT NULL,
        exit_price REAL,
        exit_time TEXT,
        exit_reason TEXT,
        pnl REAL,
        pnl_percent REAL,
        is_open INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // Risk events table for portfolio risk management
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS risk_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        message TEXT NOT NULL,
        portfolio_value REAL,
        daily_pnl REAL,
        daily_pnl_percent REAL,
        drawdown_percent REAL,
        resolved_at TEXT,
        resolution_notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // Create indexes for new tables
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_regime_history_created ON market_regime_history(created_at);
      CREATE INDEX IF NOT EXISTS idx_stock_rankings_date ON stock_rankings(date);
      CREATE INDEX IF NOT EXISTS idx_stock_rankings_regime ON stock_rankings(regime);
      CREATE INDEX IF NOT EXISTS idx_position_tracking_token ON position_tracking(token);
      CREATE INDEX IF NOT EXISTS idx_position_tracking_open ON position_tracking(is_open);
      CREATE INDEX IF NOT EXISTS idx_risk_events_type ON risk_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_risk_events_created ON risk_events(created_at);
    `);

    // Add market_regime and exit_reason columns to transactions if not exist
    try {
      this.db.exec(`ALTER TABLE transactions ADD COLUMN market_regime TEXT`);
    } catch (e) {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE transactions ADD COLUMN exit_reason TEXT`);
    } catch (e) {
      // Column already exists
    }

    // Add dominant_regime to daily_strategies if not exist
    try {
      this.db.exec(`ALTER TABLE daily_strategies ADD COLUMN dominant_regime TEXT`);
    } catch (e) {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE daily_strategies ADD COLUMN regime_changes INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists
    }
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
      INSERT INTO transactions (type, token, symbol, qty, price, value, brokerage, pnl, pnl_percent, balance_after, grid_level, market_regime, exit_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      transaction.gridLevel || 0,
      transaction.marketRegime || null,
      transaction.exitReason || null
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

  // ==========================================
  // Market Regime Methods
  // ==========================================

  /**
   * Record a market regime change
   * @param {Object} regimeData - Regime change data
   */
  recordRegimeChange(regimeData) {
    const stmt = this.db.prepare(`
      INSERT INTO market_regime_history (regime, confidence, nifty_price, nifty_bank_price, ema20, ema50, adx, rsi, signals, is_manual_override)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      regimeData.newRegime,
      regimeData.confidence,
      regimeData.nifty50Price || null,
      regimeData.niftyBankPrice || null,
      regimeData.indicators?.nifty50?.ema20 || null,
      regimeData.indicators?.nifty50?.ema50 || null,
      regimeData.indicators?.nifty50?.adx || null,
      regimeData.indicators?.nifty50?.rsi || null,
      JSON.stringify(regimeData.signals || []),
      regimeData.isManualOverride ? 1 : 0
    );
  }

  /**
   * Get regime history
   * @param {number} hours - Hours to look back
   * @returns {Array} Regime history
   */
  getRegimeHistory(hours = 24) {
    const stmt = this.db.prepare(`
      SELECT * FROM market_regime_history
      WHERE created_at >= datetime('now', 'localtime', '-' || ? || ' hours')
      ORDER BY created_at DESC
    `);
    return stmt.all(hours);
  }

  /**
   * Get current/latest regime from database
   * @returns {Object|null} Latest regime entry
   */
  getLatestRegime() {
    const stmt = this.db.prepare(`
      SELECT * FROM market_regime_history
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return stmt.get();
  }

  /**
   * Get regime statistics for a date range
   * @param {number} days - Days to look back
   * @returns {Object} Regime stats
   */
  getRegimeStats(days = 7) {
    const stmt = this.db.prepare(`
      SELECT regime, COUNT(*) as count
      FROM market_regime_history
      WHERE created_at >= datetime('now', 'localtime', '-' || ? || ' days')
      GROUP BY regime
    `);
    return stmt.all(days);
  }

  // ==========================================
  // Stock Rankings Methods
  // ==========================================

  /**
   * Save stock rankings for a regime
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} regime - BULLISH, BEARISH, or SIDEWAYS
   * @param {Array} rankings - Array of ranked stocks
   */
  saveStockRankings(date, regime, rankings) {
    // Delete existing rankings for this date and regime
    const deleteStmt = this.db.prepare('DELETE FROM stock_rankings WHERE date = ? AND regime = ?');
    deleteStmt.run(date, regime);

    // Insert new rankings
    const insertStmt = this.db.prepare(`
      INSERT INTO stock_rankings (date, regime, rank, token, symbol, score, momentum_score, rsi, relative_strength, beta, volatility)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    rankings.forEach((stock, index) => {
      insertStmt.run(
        date,
        regime,
        index + 1,
        stock.token,
        stock.symbol,
        stock.score,
        stock.roc || null,
        stock.rsi || null,
        stock.relativeStrength || null,
        stock.beta || null,
        stock.volatility || null
      );
    });
  }

  /**
   * Get stock rankings for a date and regime
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} regime - BULLISH, BEARISH, or SIDEWAYS
   * @returns {Array} Ranked stocks
   */
  getStockRankings(date, regime) {
    const stmt = this.db.prepare(`
      SELECT * FROM stock_rankings
      WHERE date = ? AND regime = ?
      ORDER BY rank ASC
    `);
    return stmt.all(date, regime);
  }

  /**
   * Get top stocks for a regime (latest rankings)
   * @param {string} regime - BULLISH, BEARISH, or SIDEWAYS
   * @param {number} count - Number of stocks
   * @returns {Array} Top stocks
   */
  getTopStocksForRegime(regime, count = 10) {
    const stmt = this.db.prepare(`
      SELECT * FROM stock_rankings
      WHERE regime = ?
      AND date = (SELECT MAX(date) FROM stock_rankings WHERE regime = ?)
      ORDER BY rank ASC
      LIMIT ?
    `);
    return stmt.all(regime, regime, count);
  }

  // ==========================================
  // Position Tracking Methods
  // ==========================================

  /**
   * Create position tracking record
   * @param {Object} positionData - Position data
   */
  createPositionTracking(positionData) {
    const stmt = this.db.prepare(`
      INSERT INTO position_tracking (token, symbol, entry_price, entry_time, highest_price, lowest_price, is_open)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    return stmt.run(
      positionData.token,
      positionData.symbol,
      positionData.entryPrice,
      positionData.entryTime,
      positionData.highestPrice || positionData.entryPrice,
      positionData.lowestPrice || positionData.entryPrice
    );
  }

  /**
   * Update position tracking
   * @param {string} token - Instrument token
   * @param {Object} updates - Fields to update
   */
  updatePositionTracking(token, updates) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const stmt = this.db.prepare(`
      UPDATE position_tracking SET ${fields}
      WHERE token = ? AND is_open = 1
    `);
    return stmt.run(...Object.values(updates), token);
  }

  /**
   * Close position tracking
   * @param {string} token - Instrument token
   * @param {Object} exitData - Exit data
   */
  closePositionTracking(token, exitData) {
    const stmt = this.db.prepare(`
      UPDATE position_tracking
      SET exit_price = ?, exit_time = ?, exit_reason = ?, pnl_percent = ?,
          highest_price = ?, lowest_price = ?, is_open = 0
      WHERE token = ? AND is_open = 1
    `);
    return stmt.run(
      exitData.exitPrice,
      exitData.exitTime,
      exitData.exitReason,
      exitData.pnlPercent,
      exitData.highestPrice,
      exitData.lowestPrice,
      token
    );
  }

  /**
   * Get open positions
   * @returns {Array} Open positions
   */
  getOpenPositions() {
    const stmt = this.db.prepare('SELECT * FROM position_tracking WHERE is_open = 1');
    return stmt.all();
  }

  /**
   * Get position history
   * @param {number} days - Days to look back
   * @returns {Array} Position history
   */
  getPositionHistory(days = 30) {
    const stmt = this.db.prepare(`
      SELECT * FROM position_tracking
      WHERE created_at >= datetime('now', 'localtime', '-' || ? || ' days')
      ORDER BY created_at DESC
    `);
    return stmt.all(days);
  }

  /**
   * Get exit reason statistics
   * @param {number} days - Days to look back
   * @returns {Array} Exit reason stats
   */
  getExitReasonStats(days = 30) {
    const stmt = this.db.prepare(`
      SELECT exit_reason, COUNT(*) as count, AVG(pnl_percent) as avg_pnl
      FROM position_tracking
      WHERE is_open = 0 AND exit_reason IS NOT NULL
        AND created_at >= datetime('now', 'localtime', '-' || ? || ' days')
      GROUP BY exit_reason
    `);
    return stmt.all(days);
  }

  /**
   * Get regime performance statistics
   * @param {number} days - Days to look back
   * @returns {Array} Performance by regime
   */
  getRegimePerformanceStats(days = 30) {
    const stmt = this.db.prepare(`
      SELECT market_regime, COUNT(*) as trades, AVG(pnl) as avg_pnl, SUM(pnl) as total_pnl
      FROM transactions
      WHERE type = 'SELL' AND market_regime IS NOT NULL
        AND created_at >= datetime('now', 'localtime', '-' || ? || ' days')
      GROUP BY market_regime
    `);
    return stmt.all(days);
  }

  // ==========================================
  // Risk Event Methods
  // ==========================================

  /**
   * Record a risk event
   * @param {Object} eventData - Risk event data
   */
  recordRiskEvent(eventData) {
    const stmt = this.db.prepare(`
      INSERT INTO risk_events (event_type, message, portfolio_value, daily_pnl, daily_pnl_percent, drawdown_percent)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      eventData.type,
      eventData.message,
      eventData.portfolioValue || null,
      eventData.dailyPnL || null,
      eventData.dailyPnLPercent || null,
      eventData.drawdownPercent || null
    );
  }

  /**
   * Get recent risk events
   * @param {number} days - Days to look back
   * @returns {Array} Risk events
   */
  getRiskEvents(days = 30) {
    const stmt = this.db.prepare(`
      SELECT * FROM risk_events
      WHERE created_at >= datetime('now', 'localtime', '-' || ? || ' days')
      ORDER BY created_at DESC
    `);
    return stmt.all(days);
  }

  /**
   * Get today's risk events
   * @returns {Array} Today's risk events
   */
  getTodayRiskEvents() {
    const stmt = this.db.prepare(`
      SELECT * FROM risk_events
      WHERE date(created_at, '+5 hours', '30 minutes') = date('now', '+5 hours', '30 minutes')
      ORDER BY created_at DESC
    `);
    return stmt.all();
  }

  /**
   * Resolve a risk event
   * @param {number} eventId - Event ID
   * @param {string} notes - Resolution notes
   */
  resolveRiskEvent(eventId, notes) {
    const stmt = this.db.prepare(`
      UPDATE risk_events
      SET resolved_at = datetime('now', 'localtime'), resolution_notes = ?
      WHERE id = ?
    `);
    return stmt.run(notes, eventId);
  }

  close() {
    if (this.db) {
      this.db.close();
      logger.info('Database connection closed');
    }
  }
}

module.exports = new DatabaseService();
