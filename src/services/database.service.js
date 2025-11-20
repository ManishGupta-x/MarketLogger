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
        channel_id TEXT NOT NULL DEFAULT 'default',
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
        channel_id TEXT NOT NULL DEFAULT 'default',
        token TEXT NOT NULL,
        symbol TEXT NOT NULL,
        qty INTEGER NOT NULL,
        avg_price REAL NOT NULL,
        current_price REAL,
        invested_value REAL NOT NULL,
        current_value REAL,
        unrealized_pnl REAL,
        unrealized_pnl_percent REAL,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (channel_id, token)
      )
    `);

    // Virtual portfolio snapshots table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS virtual_portfolio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL DEFAULT 'default',
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
        channel_id TEXT NOT NULL DEFAULT 'default',
        token TEXT NOT NULL,
        symbol TEXT NOT NULL,
        last_buy_price REAL,
        last_sell_price REAL,
        reference_price REAL NOT NULL,
        buy_count INTEGER DEFAULT 0,
        sell_count INTEGER DEFAULT 0,
        total_pnl REAL DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (channel_id, token)
      )
    `);

    // Configuration table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        channel_id TEXT NOT NULL DEFAULT 'default',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (channel_id, key)
      )
    `);

    // Apply migrations to add channel_id to existing tables
    this.applyMigrations();

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_orders_channel ON virtual_orders(channel_id);
      CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON virtual_orders(timestamp);
      CREATE INDEX IF NOT EXISTS idx_orders_symbol ON virtual_orders(symbol);
      CREATE INDEX IF NOT EXISTS idx_orders_type ON virtual_orders(type);
      CREATE INDEX IF NOT EXISTS idx_holdings_channel ON virtual_holdings(channel_id);
      CREATE INDEX IF NOT EXISTS idx_portfolio_channel ON virtual_portfolio(channel_id);
      CREATE INDEX IF NOT EXISTS idx_portfolio_timestamp ON virtual_portfolio(timestamp);
      CREATE INDEX IF NOT EXISTS idx_grid_channel ON grid_levels(channel_id);
      CREATE INDEX IF NOT EXISTS idx_grid_active ON grid_levels(is_active);
      CREATE INDEX IF NOT EXISTS idx_config_channel ON config(channel_id);
    `);

    logger.info('✅ Database tables created');
  }

  applyMigrations() {
    // Check if channel_id column exists in virtual_orders
    const tableInfo = this.db.pragma('table_info(virtual_orders)');
    const hasChannelId = tableInfo.some(col => col.name === 'channel_id');

    if (!hasChannelId) {
      logger.info('🔄 Migrating database to support multi-channel...');

      // Add channel_id column to existing tables with default value
      try {
        this.db.exec(`ALTER TABLE virtual_orders ADD COLUMN channel_id TEXT NOT NULL DEFAULT 'default'`);
        logger.info('✅ Added channel_id to virtual_orders');
      } catch (e) {
        // Column might already exist
      }

      try {
        // For virtual_holdings, we need to recreate the table due to composite primary key
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS virtual_holdings_new (
            channel_id TEXT NOT NULL DEFAULT 'default',
            token TEXT NOT NULL,
            symbol TEXT NOT NULL,
            qty INTEGER NOT NULL,
            avg_price REAL NOT NULL,
            current_price REAL,
            invested_value REAL NOT NULL,
            current_value REAL,
            unrealized_pnl REAL,
            unrealized_pnl_percent REAL,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (channel_id, token)
          )
        `);

        this.db.exec(`
          INSERT INTO virtual_holdings_new
          SELECT 'default', token, symbol, qty, avg_price, current_price,
                 invested_value, current_value, unrealized_pnl, unrealized_pnl_percent, last_updated
          FROM virtual_holdings
        `);

        this.db.exec(`DROP TABLE virtual_holdings`);
        this.db.exec(`ALTER TABLE virtual_holdings_new RENAME TO virtual_holdings`);
        logger.info('✅ Migrated virtual_holdings with channel_id');
      } catch (e) {
        // Table might already be migrated
      }

      try {
        this.db.exec(`ALTER TABLE virtual_portfolio ADD COLUMN channel_id TEXT NOT NULL DEFAULT 'default'`);
        logger.info('✅ Added channel_id to virtual_portfolio');
      } catch (e) {
        // Column might already exist
      }

      try {
        // For grid_levels, we need to recreate the table due to composite primary key
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS grid_levels_new (
            channel_id TEXT NOT NULL DEFAULT 'default',
            token TEXT NOT NULL,
            symbol TEXT NOT NULL,
            last_buy_price REAL,
            last_sell_price REAL,
            reference_price REAL NOT NULL,
            buy_count INTEGER DEFAULT 0,
            sell_count INTEGER DEFAULT 0,
            total_pnl REAL DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (channel_id, token)
          )
        `);

        this.db.exec(`
          INSERT INTO grid_levels_new
          SELECT 'default', token, symbol, last_buy_price, last_sell_price, reference_price,
                 buy_count, sell_count, total_pnl, is_active, last_updated
          FROM grid_levels
        `);

        this.db.exec(`DROP TABLE grid_levels`);
        this.db.exec(`ALTER TABLE grid_levels_new RENAME TO grid_levels`);
        logger.info('✅ Migrated grid_levels with channel_id');
      } catch (e) {
        // Table might already be migrated
      }

      try {
        // For config, we need to recreate the table due to composite primary key
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS config_new (
            channel_id TEXT NOT NULL DEFAULT 'default',
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (channel_id, key)
          )
        `);

        this.db.exec(`
          INSERT INTO config_new
          SELECT 'default', key, value, updated_at
          FROM config
        `);

        this.db.exec(`DROP TABLE config`);
        this.db.exec(`ALTER TABLE config_new RENAME TO config`);
        logger.info('✅ Migrated config with channel_id');
      } catch (e) {
        // Table might already be migrated
      }

      logger.info('✅ Database migration complete');
    }
  }

  initializeConfig() {
    const defaultConfig = {
      initial_capital: '500000',
      amount_per_trade: '10000',
      grid_percentage: '5.0',
      max_positions_per_stock: '5',
      trading_enabled: 'false'
    };

    const stmt = this.db.prepare('INSERT OR IGNORE INTO config (channel_id, key, value) VALUES (?, ?, ?)');

    for (const [key, value] of Object.entries(defaultConfig)) {
      stmt.run('default', key, value);
    }

    logger.info('✅ Default configuration initialized');
  }

  // Configuration methods
  getConfig(key, channelId = 'default') {
    const stmt = this.db.prepare('SELECT value FROM config WHERE channel_id = ? AND key = ?');
    const row = stmt.get(channelId, key);
    return row ? row.value : null;
  }

  setConfig(key, value, channelId = 'default') {
    const stmt = this.db.prepare(`
      INSERT INTO config (channel_id, key, value, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(channel_id, key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(channelId, key, value, value);
  }

  getAllConfig(channelId = 'default') {
    const stmt = this.db.prepare('SELECT key, value FROM config WHERE channel_id = ?');
    const rows = stmt.all(channelId);
    const config = {};
    rows.forEach(row => {
      config[row.key] = row.value;
    });
    return config;
  }

  // Order methods
  insertOrder(order, channelId = 'default') {
    const stmt = this.db.prepare(`
      INSERT INTO virtual_orders
      (channel_id, type, token, symbol, qty, price, value, balance, pnl, pnl_percent, grid_level, reference_price, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      channelId,
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

  getOrders(channelId = 'default', limit = 100, offset = 0) {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_orders
      WHERE channel_id = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(channelId, limit, offset);
  }

  getOrdersByDate(date, channelId = 'default') {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_orders
      WHERE channel_id = ? AND DATE(timestamp) = DATE(?)
      ORDER BY timestamp DESC
    `);
    return stmt.all(channelId, date);
  }

  getTodayOrders(channelId = 'default') {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_orders
      WHERE channel_id = ? AND DATE(timestamp) = DATE('now', 'localtime')
      ORDER BY timestamp DESC
    `);
    return stmt.all(channelId);
  }

  getOrdersBySymbol(symbol, channelId = 'default') {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_orders
      WHERE channel_id = ? AND symbol = ?
      ORDER BY timestamp DESC
    `);
    return stmt.all(channelId, symbol);
  }

  // Holdings methods
  upsertHolding(holding, channelId = 'default') {
    const stmt = this.db.prepare(`
      INSERT INTO virtual_holdings
      (channel_id, token, symbol, qty, avg_price, current_price, invested_value, current_value,
       unrealized_pnl, unrealized_pnl_percent, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(channel_id, token) DO UPDATE SET
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
      channelId,
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

  getHolding(token, channelId = 'default') {
    const stmt = this.db.prepare('SELECT * FROM virtual_holdings WHERE channel_id = ? AND token = ?');
    return stmt.get(channelId, token);
  }

  getAllHoldings(channelId = 'default') {
    const stmt = this.db.prepare('SELECT * FROM virtual_holdings WHERE channel_id = ? ORDER BY symbol');
    return stmt.all(channelId);
  }

  deleteHolding(token, channelId = 'default') {
    const stmt = this.db.prepare('DELETE FROM virtual_holdings WHERE channel_id = ? AND token = ?');
    stmt.run(channelId, token);
  }

  updateHoldingPrice(token, currentPrice, channelId = 'default') {
    const holding = this.getHolding(token, channelId);
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
      WHERE channel_id = ? AND token = ?
    `);

    stmt.run(currentPrice, currentValue, unrealizedPnl, unrealizedPnlPercent, channelId, token);
  }

  // Portfolio snapshot methods
  insertPortfolioSnapshot(portfolio, channelId = 'default') {
    const stmt = this.db.prepare(`
      INSERT INTO virtual_portfolio
      (channel_id, cash_balance, holdings_value, total_value, total_pnl, total_pnl_percent,
       realized_pnl, unrealized_pnl, holdings_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      channelId,
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

  getLatestPortfolio(channelId = 'default') {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_portfolio
      WHERE channel_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    return stmt.get(channelId);
  }

  getPortfolioHistory(days = 7, channelId = 'default') {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_portfolio
      WHERE channel_id = ? AND timestamp >= datetime('now', '-' || ? || ' days')
      ORDER BY timestamp ASC
    `);
    return stmt.all(channelId, days);
  }

  // Grid levels methods
  upsertGridLevel(grid, channelId = 'default') {
    const stmt = this.db.prepare(`
      INSERT INTO grid_levels
      (channel_id, token, symbol, last_buy_price, last_sell_price, reference_price,
       buy_count, sell_count, total_pnl, is_active, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(channel_id, token) DO UPDATE SET
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
      channelId,
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

  getGridLevel(token, channelId = 'default') {
    const stmt = this.db.prepare('SELECT * FROM grid_levels WHERE channel_id = ? AND token = ?');
    return stmt.get(channelId, token);
  }

  getAllGridLevels(channelId = 'default') {
    const stmt = this.db.prepare('SELECT * FROM grid_levels WHERE channel_id = ? AND is_active = 1 ORDER BY symbol');
    return stmt.all(channelId);
  }

  incrementGridBuyCount(token, channelId = 'default') {
    const stmt = this.db.prepare(`
      UPDATE grid_levels
      SET buy_count = buy_count + 1, last_updated = CURRENT_TIMESTAMP
      WHERE channel_id = ? AND token = ?
    `);
    stmt.run(channelId, token);
  }

  incrementGridSellCount(token, channelId = 'default') {
    const stmt = this.db.prepare(`
      UPDATE grid_levels
      SET sell_count = sell_count + 1, last_updated = CURRENT_TIMESTAMP
      WHERE channel_id = ? AND token = ?
    `);
    stmt.run(channelId, token);
  }

  updateGridPnl(token, pnl, channelId = 'default') {
    const stmt = this.db.prepare(`
      UPDATE grid_levels
      SET total_pnl = total_pnl + ?, last_updated = CURRENT_TIMESTAMP
      WHERE channel_id = ? AND token = ?
    `);
    stmt.run(pnl, channelId, token);
  }

  deactivateGridLevel(token, channelId = 'default') {
    const stmt = this.db.prepare(`
      UPDATE grid_levels
      SET is_active = 0, last_updated = CURRENT_TIMESTAMP
      WHERE channel_id = ? AND token = ?
    `);
    stmt.run(channelId, token);
  }

  // Statistics methods
  getTotalPnL(channelId = 'default') {
    const stmt = this.db.prepare(`
      SELECT
        SUM(CASE WHEN type = 'SELL' THEN pnl ELSE 0 END) as realized_pnl,
        COUNT(DISTINCT symbol) as traded_symbols,
        COUNT(*) as total_orders,
        SUM(CASE WHEN type = 'BUY' THEN 1 ELSE 0 END) as buy_orders,
        SUM(CASE WHEN type = 'SELL' THEN 1 ELSE 0 END) as sell_orders
      FROM virtual_orders
      WHERE channel_id = ?
    `);
    return stmt.get(channelId);
  }

  getTodayStats(channelId = 'default') {
    const stmt = this.db.prepare(`
      SELECT
        SUM(CASE WHEN type = 'SELL' THEN pnl ELSE 0 END) as today_pnl,
        COUNT(*) as today_orders,
        SUM(CASE WHEN type = 'BUY' THEN 1 ELSE 0 END) as today_buys,
        SUM(CASE WHEN type = 'SELL' THEN 1 ELSE 0 END) as today_sells
      FROM virtual_orders
      WHERE channel_id = ? AND DATE(timestamp) = DATE('now', 'localtime')
    `);
    return stmt.get(channelId);
  }

  getTopPerformers(limit = 10, channelId = 'default') {
    const stmt = this.db.prepare(`
      SELECT
        symbol,
        SUM(CASE WHEN type = 'SELL' THEN pnl ELSE 0 END) as total_pnl,
        COUNT(*) as trade_count
      FROM virtual_orders
      WHERE channel_id = ?
      GROUP BY symbol
      ORDER BY total_pnl DESC
      LIMIT ?
    `);
    return stmt.all(channelId, limit);
  }

  getWorstPerformers(limit = 10, channelId = 'default') {
    const stmt = this.db.prepare(`
      SELECT
        symbol,
        SUM(CASE WHEN type = 'SELL' THEN pnl ELSE 0 END) as total_pnl,
        COUNT(*) as trade_count
      FROM virtual_orders
      WHERE channel_id = ?
      GROUP BY symbol
      ORDER BY total_pnl ASC
      LIMIT ?
    `);
    return stmt.all(channelId, limit);
  }

  // Reset methods
  resetPortfolio(channelId = 'default') {
    this.db.exec(`DELETE FROM virtual_orders WHERE channel_id = '${channelId}'`);
    this.db.exec(`DELETE FROM virtual_holdings WHERE channel_id = '${channelId}'`);
    this.db.exec(`DELETE FROM virtual_portfolio WHERE channel_id = '${channelId}'`);
    this.db.exec(`DELETE FROM grid_levels WHERE channel_id = '${channelId}'`);

    logger.info(`🔄 Portfolio reset complete for channel ${channelId}`);
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
