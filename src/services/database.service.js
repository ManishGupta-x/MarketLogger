const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.db = null;
    this.dbPath = path.join(__dirname, '../../trading.db');
  }

  initialize() {
    try {
      logger.info('🗄️ Initializing database...');

      // Create database connection
      this.db = new Database(this.dbPath);

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');

      // Create tables
      this.createTables();

      // Insert default config
      this.initializeConfig();

      logger.info('✅ Database initialized');

      return true;
    } catch (error) {
      logger.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  createTables() {
    // Virtual orders table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS virtual_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        type TEXT NOT NULL,
        token TEXT NOT NULL,
        symbol TEXT NOT NULL,
        qty INTEGER NOT NULL,
        price REAL NOT NULL,
        value REAL NOT NULL,
        balance REAL NOT NULL,
        pnl REAL DEFAULT 0,
        pnl_percent REAL DEFAULT 0,
        grid_level INTEGER DEFAULT 0,
        reference_price REAL,
        notes TEXT
      )
    `);

    // Virtual holdings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS virtual_holdings (
        token TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        qty INTEGER NOT NULL,
        avg_price REAL NOT NULL,
        current_price REAL,
        invested_value REAL NOT NULL,
        current_value REAL,
        unrealized_pnl REAL,
        unrealized_pnl_percent REAL,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Virtual portfolio snapshots table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS virtual_portfolio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        cash_balance REAL NOT NULL,
        holdings_value REAL NOT NULL,
        total_value REAL NOT NULL,
        total_pnl REAL NOT NULL,
        total_pnl_percent REAL NOT NULL,
        realized_pnl REAL DEFAULT 0,
        unrealized_pnl REAL DEFAULT 0,
        holdings_count INTEGER DEFAULT 0
      )
    `);

    // Grid levels table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS grid_levels (
        token TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        last_buy_price REAL,
        last_sell_price REAL,
        reference_price REAL NOT NULL,
        buy_count INTEGER DEFAULT 0,
        sell_count INTEGER DEFAULT 0,
        total_pnl REAL DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Configuration table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON virtual_orders(timestamp);
      CREATE INDEX IF NOT EXISTS idx_orders_symbol ON virtual_orders(symbol);
      CREATE INDEX IF NOT EXISTS idx_orders_type ON virtual_orders(type);
      CREATE INDEX IF NOT EXISTS idx_portfolio_timestamp ON virtual_portfolio(timestamp);
      CREATE INDEX IF NOT EXISTS idx_grid_active ON grid_levels(is_active);
    `);

    logger.info('✅ Database tables created');
  }

  initializeConfig() {
    const defaultConfig = {
      initial_capital: '500000',
      amount_per_trade: '10000',
      grid_percentage: '5.0',
      max_positions_per_stock: '5',
      trading_enabled: 'false'
    };

    const stmt = this.db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');

    for (const [key, value] of Object.entries(defaultConfig)) {
      stmt.run(key, value);
    }

    logger.info('✅ Default configuration initialized');
  }

  // Configuration methods
  getConfig(key) {
    const stmt = this.db.prepare('SELECT value FROM config WHERE key = ?');
    const row = stmt.get(key);
    return row ? row.value : null;
  }

  setConfig(key, value) {
    const stmt = this.db.prepare(`
      INSERT INTO config (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(key, value, value);
  }

  getAllConfig() {
    const stmt = this.db.prepare('SELECT key, value FROM config');
    const rows = stmt.all();
    const config = {};
    rows.forEach(row => {
      config[row.key] = row.value;
    });
    return config;
  }

  // Order methods
  insertOrder(order) {
    const stmt = this.db.prepare(`
      INSERT INTO virtual_orders
      (type, token, symbol, qty, price, value, balance, pnl, pnl_percent, grid_level, reference_price, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      order.type,
      order.token,
      order.symbol,
      order.qty,
      order.price,
      order.value,
      order.balance,
      order.pnl || 0,
      order.pnl_percent || 0,
      order.grid_level || 0,
      order.reference_price || null,
      order.notes || null
    );

    return result.lastInsertRowid;
  }

  getOrders(limit = 100, offset = 0) {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_orders
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  }

  getOrdersByDate(date) {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_orders
      WHERE DATE(timestamp) = DATE(?)
      ORDER BY timestamp DESC
    `);
    return stmt.all(date);
  }

  getTodayOrders() {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_orders
      WHERE DATE(timestamp) = DATE('now', 'localtime')
      ORDER BY timestamp DESC
    `);
    return stmt.all();
  }

  getOrdersBySymbol(symbol) {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_orders
      WHERE symbol = ?
      ORDER BY timestamp DESC
    `);
    return stmt.all(symbol);
  }

  // Holdings methods
  upsertHolding(holding) {
    const stmt = this.db.prepare(`
      INSERT INTO virtual_holdings
      (token, symbol, qty, avg_price, current_price, invested_value, current_value,
       unrealized_pnl, unrealized_pnl_percent, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(token) DO UPDATE SET
        qty = ?,
        avg_price = ?,
        current_price = ?,
        invested_value = ?,
        current_value = ?,
        unrealized_pnl = ?,
        unrealized_pnl_percent = ?,
        last_updated = CURRENT_TIMESTAMP
    `);

    stmt.run(
      holding.token,
      holding.symbol,
      holding.qty,
      holding.avg_price,
      holding.current_price || null,
      holding.invested_value,
      holding.current_value || null,
      holding.unrealized_pnl || null,
      holding.unrealized_pnl_percent || null,
      // UPDATE values
      holding.qty,
      holding.avg_price,
      holding.current_price || null,
      holding.invested_value,
      holding.current_value || null,
      holding.unrealized_pnl || null,
      holding.unrealized_pnl_percent || null
    );
  }

  getHolding(token) {
    const stmt = this.db.prepare('SELECT * FROM virtual_holdings WHERE token = ?');
    return stmt.get(token);
  }

  getAllHoldings() {
    const stmt = this.db.prepare('SELECT * FROM virtual_holdings ORDER BY symbol');
    return stmt.all();
  }

  deleteHolding(token) {
    const stmt = this.db.prepare('DELETE FROM virtual_holdings WHERE token = ?');
    stmt.run(token);
  }

  updateHoldingPrice(token, currentPrice) {
    const holding = this.getHolding(token);
    if (!holding) return;

    const currentValue = holding.qty * currentPrice;
    const unrealizedPnl = currentValue - holding.invested_value;
    const unrealizedPnlPercent = (unrealizedPnl / holding.invested_value) * 100;

    const stmt = this.db.prepare(`
      UPDATE virtual_holdings
      SET current_price = ?,
          current_value = ?,
          unrealized_pnl = ?,
          unrealized_pnl_percent = ?,
          last_updated = CURRENT_TIMESTAMP
      WHERE token = ?
    `);

    stmt.run(currentPrice, currentValue, unrealizedPnl, unrealizedPnlPercent, token);
  }

  // Portfolio snapshot methods
  insertPortfolioSnapshot(portfolio) {
    const stmt = this.db.prepare(`
      INSERT INTO virtual_portfolio
      (cash_balance, holdings_value, total_value, total_pnl, total_pnl_percent,
       realized_pnl, unrealized_pnl, holdings_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      portfolio.cash_balance,
      portfolio.holdings_value,
      portfolio.total_value,
      portfolio.total_pnl,
      portfolio.total_pnl_percent,
      portfolio.realized_pnl || 0,
      portfolio.unrealized_pnl || 0,
      portfolio.holdings_count || 0
    ).lastInsertRowid;
  }

  getLatestPortfolio() {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_portfolio
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    return stmt.get();
  }

  getPortfolioHistory(days = 7) {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_portfolio
      WHERE timestamp >= datetime('now', '-' || ? || ' days')
      ORDER BY timestamp ASC
    `);
    return stmt.all(days);
  }

  // Grid levels methods
  upsertGridLevel(grid) {
    const stmt = this.db.prepare(`
      INSERT INTO grid_levels
      (token, symbol, last_buy_price, last_sell_price, reference_price,
       buy_count, sell_count, total_pnl, is_active, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(token) DO UPDATE SET
        last_buy_price = ?,
        last_sell_price = ?,
        reference_price = ?,
        buy_count = ?,
        sell_count = ?,
        total_pnl = ?,
        is_active = ?,
        last_updated = CURRENT_TIMESTAMP
    `);

    stmt.run(
      grid.token,
      grid.symbol,
      grid.last_buy_price || null,
      grid.last_sell_price || null,
      grid.reference_price,
      grid.buy_count || 0,
      grid.sell_count || 0,
      grid.total_pnl || 0,
      grid.is_active !== undefined ? grid.is_active : 1,
      // UPDATE values
      grid.last_buy_price || null,
      grid.last_sell_price || null,
      grid.reference_price,
      grid.buy_count || 0,
      grid.sell_count || 0,
      grid.total_pnl || 0,
      grid.is_active !== undefined ? grid.is_active : 1
    );
  }

  getGridLevel(token) {
    const stmt = this.db.prepare('SELECT * FROM grid_levels WHERE token = ?');
    return stmt.get(token);
  }

  getAllGridLevels() {
    const stmt = this.db.prepare('SELECT * FROM grid_levels WHERE is_active = 1 ORDER BY symbol');
    return stmt.all();
  }

  incrementGridBuyCount(token) {
    const stmt = this.db.prepare(`
      UPDATE grid_levels
      SET buy_count = buy_count + 1, last_updated = CURRENT_TIMESTAMP
      WHERE token = ?
    `);
    stmt.run(token);
  }

  incrementGridSellCount(token) {
    const stmt = this.db.prepare(`
      UPDATE grid_levels
      SET sell_count = sell_count + 1, last_updated = CURRENT_TIMESTAMP
      WHERE token = ?
    `);
    stmt.run(token);
  }

  updateGridPnl(token, pnl) {
    const stmt = this.db.prepare(`
      UPDATE grid_levels
      SET total_pnl = total_pnl + ?, last_updated = CURRENT_TIMESTAMP
      WHERE token = ?
    `);
    stmt.run(pnl, token);
  }

  deactivateGridLevel(token) {
    const stmt = this.db.prepare(`
      UPDATE grid_levels
      SET is_active = 0, last_updated = CURRENT_TIMESTAMP
      WHERE token = ?
    `);
    stmt.run(token);
  }

  // Statistics methods
  getTotalPnL() {
    const stmt = this.db.prepare(`
      SELECT
        SUM(CASE WHEN type = 'SELL' THEN pnl ELSE 0 END) as realized_pnl,
        COUNT(DISTINCT symbol) as traded_symbols,
        COUNT(*) as total_orders,
        SUM(CASE WHEN type = 'BUY' THEN 1 ELSE 0 END) as buy_orders,
        SUM(CASE WHEN type = 'SELL' THEN 1 ELSE 0 END) as sell_orders
      FROM virtual_orders
    `);
    return stmt.get();
  }

  getTodayStats() {
    const stmt = this.db.prepare(`
      SELECT
        SUM(CASE WHEN type = 'SELL' THEN pnl ELSE 0 END) as today_pnl,
        COUNT(*) as today_orders,
        SUM(CASE WHEN type = 'BUY' THEN 1 ELSE 0 END) as today_buys,
        SUM(CASE WHEN type = 'SELL' THEN 1 ELSE 0 END) as today_sells
      FROM virtual_orders
      WHERE DATE(timestamp) = DATE('now', 'localtime')
    `);
    return stmt.get();
  }

  getTopPerformers(limit = 10) {
    const stmt = this.db.prepare(`
      SELECT
        symbol,
        SUM(CASE WHEN type = 'SELL' THEN pnl ELSE 0 END) as total_pnl,
        COUNT(*) as trade_count
      FROM virtual_orders
      GROUP BY symbol
      ORDER BY total_pnl DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  getWorstPerformers(limit = 10) {
    const stmt = this.db.prepare(`
      SELECT
        symbol,
        SUM(CASE WHEN type = 'SELL' THEN pnl ELSE 0 END) as total_pnl,
        COUNT(*) as trade_count
      FROM virtual_orders
      GROUP BY symbol
      ORDER BY total_pnl ASC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  // Reset methods
  resetPortfolio() {
    this.db.exec('DELETE FROM virtual_orders');
    this.db.exec('DELETE FROM virtual_holdings');
    this.db.exec('DELETE FROM virtual_portfolio');
    this.db.exec('DELETE FROM grid_levels');

    logger.info('🔄 Portfolio reset complete');
  }

  // Backup methods
  backup(backupPath) {
    const backup = this.db.backup(backupPath);
    backup.wait();
    logger.info(`📦 Database backed up to ${backupPath}`);
  }

  close() {
    if (this.db) {
      this.db.close();
      logger.info('🔒 Database connection closed');
    }
  }
}

module.exports = new DatabaseService();
