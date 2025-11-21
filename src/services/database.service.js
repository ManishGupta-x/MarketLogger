const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const logger = require('../utils/logger');
const discordService = require('./discord.service');

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
      logger.info('✅ Local SQLite database initialized');

      // Initialize Supabase connection
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        logger.info('✅ Supabase connection established');

        // Initial sync comparison on startup
        await this.initialSyncComparison();

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

    // Migration for existing databases - add channel_id and synced columns
    try {
      this.db.exec(`ALTER TABLE virtual_orders ADD COLUMN channel_id TEXT NOT NULL DEFAULT 'default'`);
      logger.info('✅ Added channel_id column to virtual_orders');
    } catch (e) {
      // Column already exists, ignore
    }

    try {
      this.db.exec(`ALTER TABLE virtual_orders ADD COLUMN synced INTEGER DEFAULT 0`);
      logger.info('✅ Added synced column to virtual_orders');
    } catch (e) {
      // Column already exists, ignore
    }

    // Virtual holdings table - check and migrate if needed
    const holdingsTableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='virtual_holdings'").get();

    if (holdingsTableExists) {
      const tableInfo = this.db.pragma('table_info(virtual_holdings)');
      const hasChannelId = tableInfo.some(col => col.name === 'channel_id');

      if (!hasChannelId) {
        logger.info('🔄 Migrating virtual_holdings table...');
        try {
          // Need to recreate table with new primary key
          this.db.exec(`ALTER TABLE virtual_holdings RENAME TO virtual_holdings_old`);
          this.db.exec(`
            CREATE TABLE virtual_holdings (
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
            INSERT INTO virtual_holdings (channel_id, token, symbol, qty, avg_price, current_price, invested_value, current_value, unrealized_pnl, unrealized_pnl_percent, last_updated)
            SELECT 'default', token, symbol, qty, avg_price, current_price, invested_value, current_value, unrealized_pnl, unrealized_pnl_percent, last_updated
            FROM virtual_holdings_old
          `);
          this.db.exec(`DROP TABLE virtual_holdings_old`);
          logger.info('✅ Migrated virtual_holdings to new format');
        } catch (e) {
          logger.error('Failed to migrate virtual_holdings:', e.message);
        }
      }
    } else {
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
    }

    // Virtual portfolio snapshots table - check and migrate if needed
    const portfolioTableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='virtual_portfolio'").get();

    if (portfolioTableExists) {
      const tableInfo = this.db.pragma('table_info(virtual_portfolio)');
      const hasChannelId = tableInfo.some(col => col.name === 'channel_id');

      if (!hasChannelId) {
        logger.info('🔄 Migrating virtual_portfolio table...');
        try {
          this.db.exec(`ALTER TABLE virtual_portfolio ADD COLUMN channel_id TEXT NOT NULL DEFAULT 'default'`);
          logger.info('✅ Added channel_id to virtual_portfolio');
        } catch (e) {
          // Column might already exist
        }
      }

      // Add synced column if missing
      const hasSynced = tableInfo.some(col => col.name === 'synced');
      if (!hasSynced) {
        try {
          this.db.exec(`ALTER TABLE virtual_portfolio ADD COLUMN synced INTEGER DEFAULT 0`);
          logger.info('✅ Added synced column to virtual_portfolio');
        } catch (e) {
          // Column already exists
        }
      }
    } else {
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
    }

    // Channels table for storing channel configuration
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        channel_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        initial_capital REAL NOT NULL,
        amount_per_trade REAL NOT NULL,
        grid_percentage REAL NOT NULL,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    try {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_orders_channel ON virtual_orders(channel_id);
        CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON virtual_orders(timestamp);
        CREATE INDEX IF NOT EXISTS idx_orders_symbol ON virtual_orders(symbol);
        CREATE INDEX IF NOT EXISTS idx_orders_synced ON virtual_orders(synced);
        CREATE INDEX IF NOT EXISTS idx_holdings_channel ON virtual_holdings(channel_id);
        CREATE INDEX IF NOT EXISTS idx_portfolio_channel ON virtual_portfolio(channel_id);
        CREATE INDEX IF NOT EXISTS idx_portfolio_synced ON virtual_portfolio(synced);
      `);
    } catch (e) {
      logger.warn('⚠️ Some indexes could not be created:', e.message);
    }

    logger.info('✅ Database tables created');
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
    // Sync every 5 seconds
    this.syncInterval = setInterval(() => {
      this.syncToSupabase();
    }, 5 * 60000);

    logger.info('🔄 Supabase sync interval started (every 5 minutes)');
  }

  async initialSyncComparison() {
    if (!this.supabase) return;

    logger.info('🔄 Running initial database sync comparison...');

    try {
      // Get local counts
      const localOrders = this.db.prepare('SELECT COUNT(*) as count FROM virtual_orders').get().count;
      const localHoldings = this.db.prepare('SELECT COUNT(*) as count FROM virtual_holdings').get().count;
      const localPortfolio = this.db.prepare('SELECT COUNT(*) as count FROM virtual_portfolio').get().count;
      const localChannels = this.db.prepare('SELECT COUNT(*) as count FROM channels').get().count;

      // Get Supabase counts
      const { count: remoteOrders } = await this.supabase
        .from('virtual_orders')
        .select('*', { count: 'exact', head: true });

      const { count: remoteHoldings } = await this.supabase
        .from('virtual_holdings')
        .select('*', { count: 'exact', head: true });

      const { count: remotePortfolio } = await this.supabase
        .from('virtual_portfolio')
        .select('*', { count: 'exact', head: true });

      const { count: remoteChannels } = await this.supabase
        .from('channels')
        .select('*', { count: 'exact', head: true });

      logger.info(`📊 Database comparison:`);
      logger.info(`   Orders: Local=${localOrders}, Supabase=${remoteOrders || 0}`);
      logger.info(`   Holdings: Local=${localHoldings}, Supabase=${remoteHoldings || 0}`);
      logger.info(`   Portfolio: Local=${localPortfolio}, Supabase=${remotePortfolio || 0}`);
      logger.info(`   Channels: Local=${localChannels}, Supabase=${remoteChannels || 0}`);

      // Store sync status for later Discord logging
      this.lastSyncStatus = {
        localOrders,
        remoteOrders: remoteOrders || 0,
        localHoldings,
        remoteHoldings: remoteHoldings || 0,
        localPortfolio,
        remotePortfolio: remotePortfolio || 0,
        localChannels,
        remoteChannels: remoteChannels || 0
      };

      // Perform bidirectional sync
      await this.syncToSupabase();

      logger.info('✅ Initial sync comparison complete');
    } catch (error) {
      logger.error('❌ Initial sync comparison failed:', error);
    }
  }

  async logSyncStatusToDiscord() {
    if (!this.lastSyncStatus) return;

    const s = this.lastSyncStatus;
    await discordService.log(
      `📊 **Database Sync Comparison**\n` +
      `Orders: Local=${s.localOrders}, Supabase=${s.remoteOrders}\n` +
      `Holdings: Local=${s.localHoldings}, Supabase=${s.remoteHoldings}\n` +
      `Portfolio: Local=${s.localPortfolio}, Supabase=${s.remotePortfolio}\n` +
      `Channels: Local=${s.localChannels}, Supabase=${s.remoteChannels}`,
      'info'
    );
  }

  async syncToSupabase() {
    if (!this.supabase || this.isProcessingQueue) return;

    this.isProcessingQueue = true;
    console.log(`[${new Date().toLocaleTimeString()}] 🔄 Starting Supabase sync...`);

    try {
      // Sync unsynced orders
      await this.syncOrders();

      // Sync unsynced portfolio snapshots
      await this.syncPortfolioSnapshots();

      // Sync current holdings
      await this.syncHoldings();

      // Sync channel configurations
      await this.syncChannels();

      // Bidirectional: pull missing data from Supabase
      await this.syncFromSupabase();

      console.log(`[${new Date().toLocaleTimeString()}] ✅ Supabase sync complete`);
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
      console.log(`   → Synced ${unsyncedOrders.length} orders`);
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
      console.log(`   → Synced ${unsyncedSnapshots.length} portfolio snapshots`);
    } else {
      logger.error('❌ Failed to sync portfolio snapshots:', error);
    }
  }

  async syncHoldings() {
    const holdings = this.db.prepare('SELECT * FROM virtual_holdings').all();

    // Get all channels from channels table to handle channels with 0 holdings
    const channels = this.db.prepare('SELECT channel_id FROM channels').all();
    const channelIds = channels.map(c => c.channel_id);

    // Group local holdings by channel_id
    const holdingsByChannel = {};
    for (const channelId of channelIds) {
      holdingsByChannel[channelId] = [];
    }
    for (const holding of holdings) {
      if (!holdingsByChannel[holding.channel_id]) {
        holdingsByChannel[holding.channel_id] = [];
      }
      holdingsByChannel[holding.channel_id].push(holding);
    }

    // For each channel, delete holdings from Supabase that don't exist locally
    for (const channelId of Object.keys(holdingsByChannel)) {
      const channelHoldings = holdingsByChannel[channelId];
      const localTokens = channelHoldings.map(h => h.token);

      if (localTokens.length === 0) {
        // Channel has no holdings - delete all holdings for this channel in Supabase
        const { error } = await this.supabase
          .from('virtual_holdings')
          .delete()
          .eq('channel_id', channelId);

        if (error) {
          logger.error(`❌ Failed to delete holdings for channel ${channelId}:`, error);
        } else {
          console.log(`   → Deleted all holdings for channel ${channelId} from Supabase`);
        }
      } else {
        // Delete holdings that are not in local DB (sold positions)
        const { error } = await this.supabase
          .from('virtual_holdings')
          .delete()
          .eq('channel_id', channelId)
          .not('token', 'in', `(${localTokens.join(',')})`);

        if (error) {
          logger.error(`❌ Failed to delete sold holdings for channel ${channelId}:`, error);
        }
      }
    }

    // Upsert all current holdings
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

    console.log(`   → Synced ${holdings.length} holdings (deleted stale entries from Supabase)`);
  }

  async syncChannels() {
    const channels = this.db.prepare('SELECT * FROM channels').all();

    if (channels.length === 0) return;

    for (const channel of channels) {
      await this.supabase.from('channels').upsert({
        channel_id: channel.channel_id,
        name: channel.name,
        initial_capital: channel.initial_capital,
        amount_per_trade: channel.amount_per_trade,
        grid_percentage: channel.grid_percentage,
        last_updated: channel.last_updated
      }, { onConflict: 'channel_id' });
    }

    console.log(`   → Synced ${channels.length} channels`);
  }

  async syncFromSupabase() {
    if (!this.supabase) return;

    logger.info('🔄 Checking Supabase for missing data...');

    try {
      // Sync orders from Supabase (get orders not in local DB)
      const localOrderCount = this.db.prepare('SELECT COUNT(*) as count FROM virtual_orders').get().count;
      const { count: supabaseOrderCount } = await this.supabase
        .from('virtual_orders')
        .select('*', { count: 'exact', head: true });

      if (supabaseOrderCount > localOrderCount) {
        const { data: supabaseOrders, error: ordersError } = await this.supabase
          .from('virtual_orders')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(supabaseOrderCount - localOrderCount + 100);

        if (!ordersError && supabaseOrders) {
          for (const order of supabaseOrders) {
            // Check if order exists by timestamp and channel
            const exists = this.db.prepare(
              'SELECT 1 FROM virtual_orders WHERE channel_id = ? AND timestamp = ? AND symbol = ? AND type = ?'
            ).get(order.channel_id, order.timestamp, order.symbol, order.type);

            if (!exists) {
              this.db.prepare(`
                INSERT INTO virtual_orders
                (channel_id, timestamp, type, token, symbol, qty, price, value, balance, pnl, pnl_percent, grid_level, reference_price, notes, synced)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
              `).run(
                order.channel_id, order.timestamp, order.type, order.token, order.symbol,
                order.qty, order.price, order.value, order.balance, order.pnl || 0,
                order.pnl_percent || 0, order.grid_level || 0, order.reference_price, order.notes
              );
            }
          }
          logger.info(`✅ Synced orders from Supabase (local: ${localOrderCount}, remote: ${supabaseOrderCount})`);
        }
      }

      // Sync holdings from Supabase
      const { data: supabaseHoldings, error: holdingsError } = await this.supabase
        .from('virtual_holdings')
        .select('*');

      if (!holdingsError && supabaseHoldings) {
        for (const holding of supabaseHoldings) {
          const exists = this.db.prepare(
            'SELECT 1 FROM virtual_holdings WHERE channel_id = ? AND token = ?'
          ).get(holding.channel_id, holding.token);

          if (!exists) {
            this.db.prepare(`
              INSERT INTO virtual_holdings (channel_id, token, symbol, qty, avg_price, invested_value, current_price, current_value, unrealized_pnl, unrealized_pnl_percent, last_updated)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              holding.channel_id, holding.token, holding.symbol, holding.qty,
              holding.avg_price, holding.invested_value, holding.current_price,
              holding.current_value, holding.unrealized_pnl, holding.unrealized_pnl_percent,
              holding.last_updated
            );
          }
        }
        logger.info(`✅ Synced ${supabaseHoldings.length} holdings from Supabase`);
      }

      // Sync portfolio snapshots from Supabase
      const localPortfolioCount = this.db.prepare('SELECT COUNT(*) as count FROM virtual_portfolio').get().count;
      const { count: supabasePortfolioCount } = await this.supabase
        .from('virtual_portfolio')
        .select('*', { count: 'exact', head: true });

      if (supabasePortfolioCount > localPortfolioCount) {
        const { data: supabasePortfolio, error: portfolioError } = await this.supabase
          .from('virtual_portfolio')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(supabasePortfolioCount - localPortfolioCount + 50);

        if (!portfolioError && supabasePortfolio) {
          for (const portfolio of supabasePortfolio) {
            const exists = this.db.prepare(
              'SELECT 1 FROM virtual_portfolio WHERE channel_id = ? AND timestamp = ?'
            ).get(portfolio.channel_id, portfolio.timestamp);

            if (!exists) {
              this.db.prepare(`
                INSERT INTO virtual_portfolio
                (channel_id, timestamp, cash_balance, holdings_value, total_value, total_pnl, total_pnl_percent, realized_pnl, unrealized_pnl, holdings_count, synced)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
              `).run(
                portfolio.channel_id, portfolio.timestamp, portfolio.cash_balance,
                portfolio.holdings_value, portfolio.total_value, portfolio.total_pnl,
                portfolio.total_pnl_percent, portfolio.realized_pnl || 0,
                portfolio.unrealized_pnl || 0, portfolio.holdings_count || 0
              );
            }
          }
          logger.info(`✅ Synced portfolio snapshots from Supabase (local: ${localPortfolioCount}, remote: ${supabasePortfolioCount})`);
        }
      }

      // Sync channels from Supabase
      const { data: supabaseChannels, error: channelsError } = await this.supabase
        .from('channels')
        .select('*');

      if (!channelsError && supabaseChannels) {
        for (const channel of supabaseChannels) {
          this.db.prepare(`
            INSERT INTO channels (channel_id, name, initial_capital, amount_per_trade, grid_percentage, last_updated)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(channel_id) DO UPDATE SET
              name = ?,
              initial_capital = ?,
              amount_per_trade = ?,
              grid_percentage = ?,
              last_updated = ?
          `).run(
            channel.channel_id, channel.name, channel.initial_capital,
            channel.amount_per_trade, channel.grid_percentage, channel.last_updated,
            channel.name, channel.initial_capital, channel.amount_per_trade,
            channel.grid_percentage, channel.last_updated
          );
        }
        logger.info(`✅ Synced ${supabaseChannels.length} channels from Supabase`);
      }

      logger.info('✅ Bidirectional sync complete');
    } catch (error) {
      logger.error('❌ Sync from Supabase failed:', error);
    }
  }

  // Channel methods
  upsertChannel(channel) {
    const stmt = this.db.prepare(`
      INSERT INTO channels (channel_id, name, initial_capital, amount_per_trade, grid_percentage, last_updated)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(channel_id) DO UPDATE SET
        name = ?,
        initial_capital = ?,
        amount_per_trade = ?,
        grid_percentage = ?,
        last_updated = CURRENT_TIMESTAMP
    `);

    stmt.run(
      channel.channel_id,
      channel.name,
      channel.initial_capital,
      channel.amount_per_trade,
      channel.grid_percentage,
      channel.name,
      channel.initial_capital,
      channel.amount_per_trade,
      channel.grid_percentage
    );
  }

  getChannel(channelId) {
    const stmt = this.db.prepare('SELECT * FROM channels WHERE channel_id = ?');
    return stmt.get(channelId);
  }

  getAllChannels() {
    const stmt = this.db.prepare('SELECT * FROM channels ORDER BY name');
    return stmt.all();
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
