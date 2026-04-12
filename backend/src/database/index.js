const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');

class DatabaseService {
  constructor() {
    this.db = null;
  }

  initialize() {
    const dbPath = path.join(__dirname, '../../../data/portfolio.db');
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.createTables();
    logger.info(`SQLite database initialized at ${dbPath}`);
  }

  createTables() {
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
        market_regime TEXT,
        exit_reason TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE IF NOT EXISTS holdings (
        token INTEGER PRIMARY KEY,
        symbol TEXT NOT NULL,
        qty INTEGER NOT NULL,
        avg_price REAL NOT NULL,
        invested_value REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE IF NOT EXISTS portfolio_state (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        cash_balance REAL NOT NULL,
        initial_capital REAL NOT NULL,
        realized_pnl REAL DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE IF NOT EXISTS daily_pnl (
        date TEXT PRIMARY KEY,
        realized_pnl REAL DEFAULT 0,
        trades_count INTEGER DEFAULT 0,
        buy_value REAL DEFAULT 0,
        sell_value REAL DEFAULT 0
      );
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
        dominant_regime TEXT,
        regime_changes INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed')),
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        completed_at TEXT
      );
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
      );
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
      );
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
      );
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
      );
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
      );
      CREATE INDEX IF NOT EXISTS idx_transactions_symbol ON transactions(symbol);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_strategy_calendar_date ON strategy_calendar(date);
      CREATE INDEX IF NOT EXISTS idx_regime_history_created ON market_regime_history(created_at);
      CREATE INDEX IF NOT EXISTS idx_stock_rankings_date ON stock_rankings(date);
      CREATE INDEX IF NOT EXISTS idx_stock_rankings_regime ON stock_rankings(regime);
      CREATE INDEX IF NOT EXISTS idx_position_tracking_token ON position_tracking(token);
      CREATE INDEX IF NOT EXISTS idx_position_tracking_open ON position_tracking(is_open);
      CREATE INDEX IF NOT EXISTS idx_risk_events_type ON risk_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_risk_events_created ON risk_events(created_at);
    `);
  }

  // ── Portfolio State ──────────────────────────────────────────────────────

  initializePortfolio(initialCapital) {
    this.db.prepare(`
      INSERT OR REPLACE INTO portfolio_state (id, cash_balance, initial_capital, realized_pnl)
      VALUES (1, ?, ?, 0)
    `).run(initialCapital, initialCapital);
  }

  getPortfolioState() {
    return this.db.prepare('SELECT * FROM portfolio_state WHERE id = 1').get();
  }

  updateCashBalance(newBalance) {
    this.db.prepare(`
      UPDATE portfolio_state SET cash_balance = ?, updated_at = datetime('now', 'localtime') WHERE id = 1
    `).run(newBalance);
  }

  addRealizedPnl(pnl) {
    this.db.prepare(`
      UPDATE portfolio_state SET realized_pnl = realized_pnl + ?, updated_at = datetime('now', 'localtime') WHERE id = 1
    `).run(pnl);
  }

  // ── Transactions ─────────────────────────────────────────────────────────

  recordTransaction(t) {
    const id = this.db.prepare(`
      INSERT INTO transactions (type, token, symbol, qty, price, value, brokerage, pnl, pnl_percent, balance_after, market_regime, exit_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(t.type, t.token, t.symbol, t.qty, t.price, t.value,
          t.brokerage || 0, t.pnl || 0, t.pnlPercent || 0,
          t.balanceAfter, t.marketRegime || null, t.exitReason || null).lastInsertRowid;

    if (t.type === 'SELL' && t.pnl) this.updateDailyPnl(t.pnl, t.value, 'sell');
    else if (t.type === 'BUY') this.updateDailyPnl(0, t.value, 'buy');

    return id;
  }

  getTransactions(limit = 100, offset = 0) {
    return this.db.prepare(`SELECT * FROM transactions ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  }

  getTodayTransactions() {
    return this.db.prepare(`
      SELECT * FROM transactions
      WHERE date(created_at, '+5 hours', '30 minutes') = date('now', '+5 hours', '30 minutes')
      ORDER BY created_at DESC
    `).all();
  }

  // ── Holdings ─────────────────────────────────────────────────────────────

  upsertHolding(token, symbol, qty, avgPrice, investedValue) {
    this.db.prepare(`
      INSERT INTO holdings (token, symbol, qty, avg_price, invested_value) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        qty = excluded.qty, avg_price = excluded.avg_price, invested_value = excluded.invested_value,
        updated_at = datetime('now', 'localtime')
    `).run(token, symbol, qty, avgPrice, investedValue);
  }

  deleteHolding(token) {
    this.db.prepare('DELETE FROM holdings WHERE token = ?').run(token);
  }

  getHolding(token) {
    return this.db.prepare('SELECT * FROM holdings WHERE token = ?').get(token);
  }

  getAllHoldings() {
    return this.db.prepare('SELECT * FROM holdings ORDER BY symbol').all();
  }

  // ── Daily PnL ─────────────────────────────────────────────────────────────

  updateDailyPnl(pnl, value, type) {
    const today = this._todayIST();
    const existing = this.db.prepare('SELECT * FROM daily_pnl WHERE date = ?').get(today);
    if (existing) {
      if (type === 'sell') {
        this.db.prepare(`UPDATE daily_pnl SET realized_pnl = realized_pnl + ?, trades_count = trades_count + 1, sell_value = sell_value + ? WHERE date = ?`)
          .run(pnl, value, today);
      } else {
        this.db.prepare(`UPDATE daily_pnl SET trades_count = trades_count + 1, buy_value = buy_value + ? WHERE date = ?`)
          .run(value, today);
      }
    } else {
      this.db.prepare(`INSERT INTO daily_pnl (date, realized_pnl, trades_count, buy_value, sell_value) VALUES (?, ?, 1, ?, ?)`)
        .run(today, pnl, type === 'buy' ? value : 0, type === 'sell' ? value : 0);
    }
  }

  getDailyPnl(days = 30) {
    return this.db.prepare(`SELECT * FROM daily_pnl ORDER BY date DESC LIMIT ?`).all(days);
  }

  getTodayPnl() {
    const today = this._todayIST();
    return this.db.prepare('SELECT * FROM daily_pnl WHERE date = ?').get(today)
      || { date: today, realized_pnl: 0, trades_count: 0, buy_value: 0, sell_value: 0 };
  }

  getStats() {
    const totalTrades  = this.db.prepare('SELECT COUNT(*) as count FROM transactions').get();
    const totalBuys    = this.db.prepare("SELECT COUNT(*) as count, SUM(value) as total FROM transactions WHERE type = 'BUY'").get();
    const totalSells   = this.db.prepare("SELECT COUNT(*) as count, SUM(value) as total, SUM(pnl) as pnl FROM transactions WHERE type = 'SELL'").get();
    const profitable   = this.db.prepare("SELECT COUNT(*) as count FROM transactions WHERE type = 'SELL' AND pnl > 0").get();
    const losing       = this.db.prepare("SELECT COUNT(*) as count FROM transactions WHERE type = 'SELL' AND pnl < 0").get();
    return {
      totalTrades: totalTrades.count,
      totalBuys: totalBuys.count,
      totalBuyValue: totalBuys.total || 0,
      totalSells: totalSells.count,
      totalSellValue: totalSells.total || 0,
      totalPnl: totalSells.pnl || 0,
      profitableTrades: profitable.count,
      lossTrades: losing.count,
      winRate: totalSells.count > 0 ? ((profitable.count / totalSells.count) * 100).toFixed(2) : 0
    };
  }

  // ── Daily Strategies ──────────────────────────────────────────────────────

  createDailyStrategy(params) {
    const today = this._todayIST();
    return this.db.prepare(`
      INSERT INTO daily_strategies (date, grid_percentage, target_percentage, stop_loss_percentage, per_trade_amount, capital, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(today, params.gridPercentage, params.targetPercentage, params.stopLossPercentage, params.perTradeAmount, params.capital);
  }

  updateDailyStrategy(date, metrics) {
    const fields = Object.keys(metrics).map(k => `${k} = ?`).join(', ');
    return this.db.prepare(`UPDATE daily_strategies SET ${fields} WHERE date = ?`).run(...Object.values(metrics), date);
  }

  getDailyStrategy(date) {
    return this.db.prepare('SELECT * FROM daily_strategies WHERE date = ?').get(date);
  }

  getTodayStrategy() {
    return this.getDailyStrategy(this._todayIST());
  }

  getAllDailyStrategies(limit = 30) {
    return this.db.prepare(`SELECT * FROM daily_strategies ORDER BY date DESC LIMIT ?`).all(limit);
  }

  // ── Strategy Calendar ─────────────────────────────────────────────────────

  upsertCalendarStrategy(date, params) {
    return this.db.prepare(`
      INSERT INTO strategy_calendar (date, grid_percentage, target_percentage, stop_loss_percentage, per_trade_amount, capital, is_holiday, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        grid_percentage = excluded.grid_percentage, target_percentage = excluded.target_percentage,
        stop_loss_percentage = excluded.stop_loss_percentage, per_trade_amount = excluded.per_trade_amount,
        capital = excluded.capital, is_holiday = excluded.is_holiday, notes = excluded.notes,
        updated_at = datetime('now', 'localtime')
    `).run(date, params.gridPercentage, params.targetPercentage, params.stopLossPercentage,
           params.perTradeAmount, params.capital, params.isHoliday ? 1 : 0, params.notes || null);
  }

  getCalendarStrategy(date) {
    return this.db.prepare('SELECT * FROM strategy_calendar WHERE date = ?').get(date);
  }

  getLastCalendarStrategy(date) {
    return this.db.prepare(`SELECT * FROM strategy_calendar WHERE date < ? AND is_holiday = 0 ORDER BY date DESC LIMIT 1`).get(date);
  }

  getCalendarStrategyWithFallback(date) {
    const entry = this.getCalendarStrategy(date);
    if (entry && entry.is_holiday === 1) return { strategy: null, source: 'holiday', date };
    if (entry) return { strategy: entry, source: 'calendar', date };
    const fallback = this.getLastCalendarStrategy(date);
    if (fallback) return { strategy: fallback, source: 'fallback', date: fallback.date };
    return { strategy: null, source: 'none', date: null };
  }

  getUpcomingCalendarStrategies(days = 7) {
    const today = this._todayIST();
    return this.db.prepare(`SELECT * FROM strategy_calendar WHERE date >= ? ORDER BY date ASC LIMIT ?`).all(today, days);
  }

  deleteCalendarStrategy(date) {
    return this.db.prepare('DELETE FROM strategy_calendar WHERE date = ?').run(date);
  }

  markAsHoliday(date, notes = null) {
    return this.db.prepare(`
      INSERT INTO strategy_calendar (date, grid_percentage, target_percentage, stop_loss_percentage, per_trade_amount, capital, is_holiday, notes)
      VALUES (?, 0, 0, 0, 0, 0, 1, ?)
      ON CONFLICT(date) DO UPDATE SET is_holiday = 1, notes = ?, updated_at = datetime('now', 'localtime')
    `).run(date, notes, notes);
  }

  // ── Market Regime ─────────────────────────────────────────────────────────

  recordRegimeChange(r) {
    return this.db.prepare(`
      INSERT INTO market_regime_history (regime, confidence, nifty_price, nifty_bank_price, ema20, ema50, adx, rsi, signals, is_manual_override)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(r.newRegime, r.confidence,
           r.nifty50Price || null, r.niftyBankPrice || null,
           r.indicators?.nifty50?.ema20 || null, r.indicators?.nifty50?.ema50 || null,
           r.indicators?.nifty50?.adx || null, r.indicators?.nifty50?.rsi || null,
           JSON.stringify(r.signals || []), r.isManualOverride ? 1 : 0);
  }

  getRegimeHistory(hours = 24) {
    return this.db.prepare(`
      SELECT * FROM market_regime_history
      WHERE created_at >= datetime('now', 'localtime', '-' || ? || ' hours')
      ORDER BY created_at DESC
    `).all(hours);
  }

  getLatestRegime() {
    return this.db.prepare(`SELECT * FROM market_regime_history ORDER BY created_at DESC LIMIT 1`).get();
  }

  getRegimeStats(days = 7) {
    return this.db.prepare(`
      SELECT regime, COUNT(*) as count FROM market_regime_history
      WHERE created_at >= datetime('now', 'localtime', '-' || ? || ' days')
      GROUP BY regime
    `).all(days);
  }

  // ── Stock Rankings ────────────────────────────────────────────────────────

  saveStockRankings(date, regime, rankings) {
    this.db.prepare('DELETE FROM stock_rankings WHERE date = ? AND regime = ?').run(date, regime);
    const ins = this.db.prepare(`
      INSERT INTO stock_rankings (date, regime, rank, token, symbol, score, momentum_score, rsi, relative_strength, beta, volatility)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    rankings.forEach((s, i) =>
      ins.run(date, regime, i + 1, s.token, s.symbol, s.score, s.roc || null,
              s.rsi || null, s.relativeStrength || null, s.beta || null, s.volatility || null));
  }

  getStockRankings(date, regime) {
    return this.db.prepare(`SELECT * FROM stock_rankings WHERE date = ? AND regime = ? ORDER BY rank ASC`).all(date, regime);
  }

  getTopStocksForRegime(regime, count = 10) {
    return this.db.prepare(`
      SELECT * FROM stock_rankings WHERE regime = ?
      AND date = (SELECT MAX(date) FROM stock_rankings WHERE regime = ?)
      ORDER BY rank ASC LIMIT ?
    `).all(regime, regime, count);
  }

  // ── Position Tracking ─────────────────────────────────────────────────────

  createPositionTracking(p) {
    return this.db.prepare(`
      INSERT INTO position_tracking (token, symbol, entry_price, entry_time, highest_price, lowest_price, is_open)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(p.token, p.symbol, p.entryPrice, p.entryTime,
           p.highestPrice || p.entryPrice, p.lowestPrice || p.entryPrice);
  }

  updatePositionTracking(token, updates) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    return this.db.prepare(`UPDATE position_tracking SET ${fields} WHERE token = ? AND is_open = 1`)
      .run(...Object.values(updates), token);
  }

  closePositionTracking(token, e) {
    return this.db.prepare(`
      UPDATE position_tracking
      SET exit_price = ?, exit_time = ?, exit_reason = ?, pnl_percent = ?, highest_price = ?, lowest_price = ?, is_open = 0
      WHERE token = ? AND is_open = 1
    `).run(e.exitPrice, e.exitTime, e.exitReason, e.pnlPercent, e.highestPrice, e.lowestPrice, token);
  }

  getOpenPositions() {
    return this.db.prepare('SELECT * FROM position_tracking WHERE is_open = 1').all();
  }

  getPositionHistory(days = 30) {
    return this.db.prepare(`
      SELECT * FROM position_tracking
      WHERE created_at >= datetime('now', 'localtime', '-' || ? || ' days')
      ORDER BY created_at DESC
    `).all(days);
  }

  getExitReasonStats(days = 30) {
    return this.db.prepare(`
      SELECT exit_reason, COUNT(*) as count, AVG(pnl_percent) as avg_pnl
      FROM position_tracking WHERE is_open = 0 AND exit_reason IS NOT NULL
        AND created_at >= datetime('now', 'localtime', '-' || ? || ' days')
      GROUP BY exit_reason
    `).all(days);
  }

  getRegimePerformanceStats(days = 30) {
    return this.db.prepare(`
      SELECT market_regime, COUNT(*) as trades, AVG(pnl) as avg_pnl, SUM(pnl) as total_pnl
      FROM transactions WHERE type = 'SELL' AND market_regime IS NOT NULL
        AND created_at >= datetime('now', 'localtime', '-' || ? || ' days')
      GROUP BY market_regime
    `).all(days);
  }

  // ── Risk Events ───────────────────────────────────────────────────────────

  recordRiskEvent(e) {
    return this.db.prepare(`
      INSERT INTO risk_events (event_type, message, portfolio_value, daily_pnl, daily_pnl_percent, drawdown_percent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(e.type, e.message, e.portfolioValue || null, e.dailyPnL || null,
           e.dailyPnLPercent || null, e.drawdownPercent || null);
  }

  getRiskEvents(days = 30) {
    return this.db.prepare(`
      SELECT * FROM risk_events
      WHERE created_at >= datetime('now', 'localtime', '-' || ? || ' days')
      ORDER BY created_at DESC
    `).all(days);
  }

  getTodayRiskEvents() {
    return this.db.prepare(`
      SELECT * FROM risk_events
      WHERE date(created_at, '+5 hours', '30 minutes') = date('now', '+5 hours', '30 minutes')
      ORDER BY created_at DESC
    `).all();
  }

  resolveRiskEvent(eventId, notes) {
    return this.db.prepare(`
      UPDATE risk_events SET resolved_at = datetime('now', 'localtime'), resolution_notes = ? WHERE id = ?
    `).run(notes, eventId);
  }

  // ── Misc ──────────────────────────────────────────────────────────────────

  resetPortfolio(initialCapital) {
    this.db.exec('DELETE FROM transactions; DELETE FROM holdings; DELETE FROM daily_pnl;');
    this.initializePortfolio(initialCapital);
    logger.info('Portfolio reset');
  }

  close() {
    if (this.db) { this.db.close(); logger.info('Database closed'); }
  }

  _todayIST() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().split('T')[0];
  }
}

module.exports = new DatabaseService();
