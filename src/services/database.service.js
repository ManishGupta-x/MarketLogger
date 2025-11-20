const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.db = null;
    this.supabase = null;
    this.dbPath = path.join(__dirname, '../../trading.db');
    this.syncInterval = null;
    this.syncQueue = [];
    this.isProcessingQueue = false;
    this.maxQueueSize = 1000;
    this.batchSize = 50; // Process 50 items at a time
  }

  async initialize() {
    try {
      logger.info('🗄️ Initializing hybrid database (SQLite + Supabase)...');

      // Initialize local SQLite database
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.createTables();
      this.initializeConfig();
      logger.info('✅ Local SQLite database initialized');

      // Initialize Supabase connection
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        logger.info('✅ Supabase connection established');

        // Start sync interval (every 5 minutes)
        this.startSyncInterval();
      } else {
        logger.warn('⚠️ Supabase not configured - running in local-only mode');
      }

      logger.info('✅ Hybrid database initialized');
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
        notes TEXT,
        synced INTEGER DEFAULT 0
      )
    `);

    // Add synced column if it doesn't exist (migration for existing databases)
    try {
      this.db.exec(`ALTER TABLE virtual_orders ADD COLUMN synced INTEGER DEFAULT 0`);
      logger.info('✅ Added synced column to virtual_orders');
    } catch (e) {
      // Column already exists, ignore
    }

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
        holdings_count INTEGER DEFAULT 0,
        synced INTEGER DEFAULT 0
      )
    `);

    // Add synced column to portfolio if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE virtual_portfolio ADD COLUMN synced INTEGER DEFAULT 0`);
      logger.info('✅ Added synced column to virtual_portfolio');
    } catch (e) {
      // Column already exists, ignore
    }

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

    // Configuration table - check if old format exists and migrate
    const configTableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='config'").get();

    if (configTableExists) {
      // Check if it has channel_id column
      const tableInfo = this.db.pragma('table_info(config)');
      const hasChannelId = tableInfo.some(col => col.name === 'channel_id');

      if (!hasChannelId) {
        // Old table format - need to migrate
        logger.info('🔄 Migrating config table to new format...');
        try {
          this.db.exec(`ALTER TABLE config RENAME TO config_old`);
          this.db.exec(`
            CREATE TABLE config (
              channel_id TEXT NOT NULL DEFAULT 'default',
              key TEXT NOT NULL,
              value TEXT NOT NULL,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (channel_id, key)
            )
          `);
          this.db.exec(`INSERT INTO config (channel_id, key, value, updated_at) SELECT 'default', key, value, updated_at FROM config_old`);
          this.db.exec(`DROP TABLE config_old`);
          logger.info('✅ Config table migrated');
        } catch (e) {
          logger.error('❌ Config migration failed:', e.message);
        }
      }
    } else {
      // Create new table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS config (
          channel_id TEXT NOT NULL DEFAULT 'default',
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (channel_id, key)
        )
      `);
    }

    // Create indexes for better performance (only if tables have required columns)
    try {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_orders_channel ON virtual_orders(channel_id);
        CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON virtual_orders(timestamp);
        CREATE INDEX IF NOT EXISTS idx_orders_symbol ON virtual_orders(symbol);
        CREATE INDEX IF NOT EXISTS idx_orders_synced ON virtual_orders(synced);
        CREATE INDEX IF NOT EXISTS idx_holdings_channel ON virtual_holdings(channel_id);
        CREATE INDEX IF NOT EXISTS idx_portfolio_channel ON virtual_portfolio(channel_id);
        CREATE INDEX IF NOT EXISTS idx_portfolio_synced ON virtual_portfolio(synced);
        CREATE INDEX IF NOT EXISTS idx_grid_channel ON grid_levels(channel_id);
        CREATE INDEX IF NOT EXISTS idx_grid_active ON grid_levels(is_active);
      `);
    } catch (e) {
      logger.warn('⚠️ Some indexes could not be created:', e.message);
    }

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

    const stmt = this.db.prepare('INSERT OR IGNORE INTO config (channel_id, key, value) VALUES (?, ?, ?)');
    for (const [key, value] of Object.entries(defaultConfig)) {
      stmt.run('default', key, value);
    }
  }

  // Queue management
  addToSyncQueue(operation) {
    if (this.syncQueue.length >= this.maxQueueSize) {
      // Remove oldest items if queue is full
      this.syncQueue.splice(0, 100);
      logger.warn('⚠️ Sync queue overflow - removed 100 oldest items');
    }
    this.syncQueue.push(operation);
  }

  startSyncInterval() {
    // Sync every 5 minutes
    this.syncInterval = setInterval(() => {
      this.syncToSupabase();
    }, 5 * 60 * 1000);

    logger.info('🔄 Supabase sync interval started (every 5 minutes)');
  }

  async syncToSupabase() {
    if (!this.supabase || this.isProcessingQueue) return;

    this.isProcessingQueue = true;
    logger.info('🔄 Starting Supabase sync...');

    try {
      // Sync unsynced orders
      await this.syncOrders();

      // Sync unsynced portfolio snapshots
      await this.syncPortfolioSnapshots();

      // Sync current holdings
      await this.syncHoldings();

      // Sync grid levels
      await this.syncGridLevels();

      // Sync config
      await this.syncConfig();

      logger.info('✅ Supabase sync complete');
    } catch (error) {
      logger.error('❌ Supabase sync failed:', error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  async syncOrders() {
    const unsyncedOrders = this.db.prepare(`
      SELECT * FROM virtual_orders WHERE synced = 0 ORDER BY id LIMIT ?
    `).all(this.batchSize);

    if (unsyncedOrders.length === 0) return;

    const ordersToSync = unsyncedOrders.map(order => ({
      channel_id: order.channel_id,
      timestamp: order.timestamp,
      type: order.type,
      token: order.token,
      symbol: order.symbol,
      qty: order.qty,
      price: order.price,
      value: order.value,
      balance: order.balance,
      pnl: order.pnl,
      pnl_percent: order.pnl_percent,
      grid_level: order.grid_level,
      reference_price: order.reference_price,
      notes: order.notes
    }));

    const { error } = await this.supabase.from('virtual_orders').insert(ordersToSync);

    if (!error) {
      const ids = unsyncedOrders.map(o => o.id);
      this.db.prepare(`UPDATE virtual_orders SET synced = 1 WHERE id IN (${ids.join(',')})`).run();
      logger.info(`✅ Synced ${unsyncedOrders.length} orders to Supabase`);
    } else {
      logger.error('❌ Failed to sync orders:', error);
    }
  }

  async syncPortfolioSnapshots() {
    const unsyncedSnapshots = this.db.prepare(`
      SELECT * FROM virtual_portfolio WHERE synced = 0 ORDER BY id LIMIT ?
    `).all(this.batchSize);

    if (unsyncedSnapshots.length === 0) return;

    const snapshotsToSync = unsyncedSnapshots.map(snap => ({
      channel_id: snap.channel_id,
      timestamp: snap.timestamp,
      cash_balance: snap.cash_balance,
      holdings_value: snap.holdings_value,
      total_value: snap.total_value,
      total_pnl: snap.total_pnl,
      total_pnl_percent: snap.total_pnl_percent,
      realized_pnl: snap.realized_pnl,
      unrealized_pnl: snap.unrealized_pnl,
      holdings_count: snap.holdings_count
    }));

    const { error } = await this.supabase.from('virtual_portfolio').insert(snapshotsToSync);

    if (!error) {
      const ids = unsyncedSnapshots.map(s => s.id);
      this.db.prepare(`UPDATE virtual_portfolio SET synced = 1 WHERE id IN (${ids.join(',')})`).run();
      logger.info(`✅ Synced ${unsyncedSnapshots.length} portfolio snapshots to Supabase`);
    } else {
      logger.error('❌ Failed to sync portfolio snapshots:', error);
    }
  }

  async syncHoldings() {
    const holdings = this.db.prepare('SELECT * FROM virtual_holdings').all();

    if (holdings.length === 0) return;

    // Upsert all holdings
    for (const holding of holdings) {
      await this.supabase.from('virtual_holdings').upsert({
        channel_id: holding.channel_id,
        token: holding.token,
        symbol: holding.symbol,
        qty: holding.qty,
        avg_price: holding.avg_price,
        current_price: holding.current_price,
        invested_value: holding.invested_value,
        current_value: holding.current_value,
        unrealized_pnl: holding.unrealized_pnl,
        unrealized_pnl_percent: holding.unrealized_pnl_percent,
        last_updated: holding.last_updated
      }, { onConflict: 'channel_id,token' });
    }

    logger.info(`✅ Synced ${holdings.length} holdings to Supabase`);
  }

  async syncGridLevels() {
    const grids = this.db.prepare('SELECT * FROM grid_levels').all();

    if (grids.length === 0) return;

    for (const grid of grids) {
      await this.supabase.from('grid_levels').upsert({
        channel_id: grid.channel_id,
        token: grid.token,
        symbol: grid.symbol,
        last_buy_price: grid.last_buy_price,
        last_sell_price: grid.last_sell_price,
        reference_price: grid.reference_price,
        buy_count: grid.buy_count,
        sell_count: grid.sell_count,
        total_pnl: grid.total_pnl,
        is_active: grid.is_active === 1,
        last_updated: grid.last_updated
      }, { onConflict: 'channel_id,token' });
    }

    logger.info(`✅ Synced ${grids.length} grid levels to Supabase`);
  }

  async syncConfig() {
    const configs = this.db.prepare('SELECT * FROM config').all();

    if (configs.length === 0) return;

    for (const config of configs) {
      await this.supabase.from('config').upsert({
        channel_id: config.channel_id,
        key: config.key,
        value: config.value,
        updated_at: config.updated_at
      }, { onConflict: 'channel_id,key' });
    }

    logger.info(`✅ Synced ${configs.length} config items to Supabase`);
  }

  // Configuration methods (synchronous - using SQLite)
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

  // Async wrapper for compatibility
  async getAllConfigAsync(channelId = 'default') {
    return this.getAllConfig(channelId);
  }

  // Order methods
  insertOrder(order, channelId = 'default') {
    const stmt = this.db.prepare(`
      INSERT INTO virtual_orders
      (channel_id, type, token, symbol, qty, price, value, balance, pnl, pnl_percent, grid_level, reference_price, notes, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
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

  getTodayOrders(channelId = 'default') {
    const stmt = this.db.prepare(`
      SELECT * FROM virtual_orders
      WHERE channel_id = ? AND DATE(timestamp) = DATE('now', 'localtime')
      ORDER BY timestamp DESC
    `);
    return stmt.all(channelId);
  }

  // Async wrapper for compatibility
  async getTodayOrdersAsync(channelId = 'default') {
    return this.getTodayOrders(channelId);
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

  // Async wrapper for compatibility
  async getAllHoldingsAsync(channelId = 'default') {
    return this.getAllHoldings(channelId);
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
       realized_pnl, unrealized_pnl, holdings_count, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
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

  // Async wrapper for compatibility
  async getLatestPortfolioAsync(channelId = 'default') {
    return this.getLatestPortfolio(channelId);
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

  // Async wrapper for compatibility
  async getAllGridLevelsAsync(channelId = 'default') {
    return this.getAllGridLevels(channelId);
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

  // Async wrapper for compatibility
  async getTotalPnLAsync(channelId = 'default') {
    return this.getTotalPnL(channelId);
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

  // Async wrapper for compatibility
  async getTodayStatsAsync(channelId = 'default') {
    return this.getTodayStats(channelId);
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

  // Async wrapper for compatibility
  async getTopPerformersAsync(limit = 10, channelId = 'default') {
    return this.getTopPerformers(limit, channelId);
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

  // Async wrapper for compatibility
  async getWorstPerformersAsync(limit = 10, channelId = 'default') {
    return this.getWorstPerformers(limit, channelId);
  }

  // Reset methods
  resetPortfolio(channelId = 'default') {
    this.db.exec(`DELETE FROM virtual_orders WHERE channel_id = '${channelId}'`);
    this.db.exec(`DELETE FROM virtual_holdings WHERE channel_id = '${channelId}'`);
    this.db.exec(`DELETE FROM virtual_portfolio WHERE channel_id = '${channelId}'`);
    this.db.exec(`DELETE FROM grid_levels WHERE channel_id = '${channelId}'`);

    logger.info(`🔄 Portfolio reset complete for channel ${channelId}`);
  }

  // Force immediate sync
  async forceSync() {
    await this.syncToSupabase();
  }

  close() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Final sync before closing
    if (this.supabase) {
      this.syncToSupabase().then(() => {
        logger.info('✅ Final sync complete');
      });
    }

    if (this.db) {
      this.db.close();
      logger.info('🔒 Database connection closed');
    }
  }
}

module.exports = new DatabaseService();
