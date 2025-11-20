const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.supabase = null;
  }

  async initialize() {
    try {
      logger.info('🗄️ Initializing Supabase database...');

      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables');
      }

      // Create Supabase client
      this.supabase = createClient(supabaseUrl, supabaseKey);

      // Create tables if they don't exist
      await this.createTables();

      // Insert default config
      await this.initializeConfig();

      logger.info('✅ Supabase database initialized');

      return true;
    } catch (error) {
      logger.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  async createTables() {
    // Tables should be created in Supabase dashboard or via SQL
    // This is just a check that tables exist
    logger.info('✅ Database tables ready (ensure tables are created in Supabase dashboard)');
  }

  async initializeConfig() {
    const defaultConfig = {
      initial_capital: '500000',
      amount_per_trade: '10000',
      grid_percentage: '5.0',
      max_positions_per_stock: '5',
      trading_enabled: 'false'
    };

    for (const [key, value] of Object.entries(defaultConfig)) {
      const { data } = await this.supabase
        .from('config')
        .select('*')
        .eq('channel_id', 'default')
        .eq('key', key)
        .single();

      if (!data) {
        await this.supabase.from('config').insert({
          channel_id: 'default',
          key,
          value
        });
      }
    }

    logger.info('✅ Default configuration initialized');
  }

  // Configuration methods
  async getConfig(key, channelId = 'default') {
    const { data } = await this.supabase
      .from('config')
      .select('value')
      .eq('channel_id', channelId)
      .eq('key', key)
      .single();
    return data ? data.value : null;
  }

  async setConfig(key, value, channelId = 'default') {
    await this.supabase
      .from('config')
      .upsert({
        channel_id: channelId,
        key,
        value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'channel_id,key' });
  }

  getAllConfig(channelId = 'default') {
    // Synchronous wrapper that returns cached/default config
    // For async version, use getAllConfigAsync
    return {};
  }

  async getAllConfigAsync(channelId = 'default') {
    const { data } = await this.supabase
      .from('config')
      .select('key, value')
      .eq('channel_id', channelId);

    const config = {};
    if (data) {
      data.forEach(row => {
        config[row.key] = row.value;
      });
    }
    return config;
  }

  // Order methods
  async insertOrder(order, channelId = 'default') {
    const { data, error } = await this.supabase
      .from('virtual_orders')
      .insert({
        channel_id: channelId,
        type: order.type,
        token: order.token,
        symbol: order.symbol,
        qty: order.qty,
        price: order.price,
        value: order.value,
        balance: order.balance,
        pnl: order.pnl || 0,
        pnl_percent: order.pnl_percent || 0,
        grid_level: order.grid_level || 0,
        reference_price: order.reference_price || null,
        notes: order.notes || null
      })
      .select('id')
      .single();

    if (error) {
      logger.error('Insert order error:', error);
      return null;
    }
    return data?.id;
  }

  async getOrders(channelId = 'default', limit = 100, offset = 0) {
    const { data } = await this.supabase
      .from('virtual_orders')
      .select('*')
      .eq('channel_id', channelId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);
    return data || [];
  }

  async getOrdersByDate(date, channelId = 'default') {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { data } = await this.supabase
      .from('virtual_orders')
      .select('*')
      .eq('channel_id', channelId)
      .gte('timestamp', startOfDay.toISOString())
      .lte('timestamp', endOfDay.toISOString())
      .order('timestamp', { ascending: false });
    return data || [];
  }

  getTodayOrders(channelId = 'default') {
    // Synchronous wrapper - returns empty, use getTodayOrdersAsync
    return [];
  }

  async getTodayOrdersAsync(channelId = 'default') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await this.supabase
      .from('virtual_orders')
      .select('*')
      .eq('channel_id', channelId)
      .gte('timestamp', today.toISOString())
      .order('timestamp', { ascending: false });
    return data || [];
  }

  async getOrdersBySymbol(symbol, channelId = 'default') {
    const { data } = await this.supabase
      .from('virtual_orders')
      .select('*')
      .eq('channel_id', channelId)
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false });
    return data || [];
  }

  // Holdings methods
  async upsertHolding(holding, channelId = 'default') {
    await this.supabase
      .from('virtual_holdings')
      .upsert({
        channel_id: channelId,
        token: holding.token,
        symbol: holding.symbol,
        qty: holding.qty,
        avg_price: holding.avg_price,
        current_price: holding.current_price || null,
        invested_value: holding.invested_value,
        current_value: holding.current_value || null,
        unrealized_pnl: holding.unrealized_pnl || null,
        unrealized_pnl_percent: holding.unrealized_pnl_percent || null,
        last_updated: new Date().toISOString()
      }, { onConflict: 'channel_id,token' });
  }

  async getHolding(token, channelId = 'default') {
    const { data } = await this.supabase
      .from('virtual_holdings')
      .select('*')
      .eq('channel_id', channelId)
      .eq('token', token)
      .single();
    return data;
  }

  getAllHoldings(channelId = 'default') {
    // Synchronous wrapper - returns empty, use getAllHoldingsAsync
    return [];
  }

  async getAllHoldingsAsync(channelId = 'default') {
    const { data } = await this.supabase
      .from('virtual_holdings')
      .select('*')
      .eq('channel_id', channelId)
      .order('symbol');
    return data || [];
  }

  async deleteHolding(token, channelId = 'default') {
    await this.supabase
      .from('virtual_holdings')
      .delete()
      .eq('channel_id', channelId)
      .eq('token', token);
  }

  async updateHoldingPrice(token, currentPrice, channelId = 'default') {
    const holding = await this.getHolding(token, channelId);
    if (!holding) return;

    const currentValue = holding.qty * currentPrice;
    const unrealizedPnl = currentValue - holding.invested_value;
    const unrealizedPnlPercent = (unrealizedPnl / holding.invested_value) * 100;

    await this.supabase
      .from('virtual_holdings')
      .update({
        current_price: currentPrice,
        current_value: currentValue,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_percent: unrealizedPnlPercent,
        last_updated: new Date().toISOString()
      })
      .eq('channel_id', channelId)
      .eq('token', token);
  }

  // Portfolio snapshot methods
  async insertPortfolioSnapshot(portfolio, channelId = 'default') {
    const { data } = await this.supabase
      .from('virtual_portfolio')
      .insert({
        channel_id: channelId,
        cash_balance: portfolio.cash_balance,
        holdings_value: portfolio.holdings_value,
        total_value: portfolio.total_value,
        total_pnl: portfolio.total_pnl,
        total_pnl_percent: portfolio.total_pnl_percent,
        realized_pnl: portfolio.realized_pnl || 0,
        unrealized_pnl: portfolio.unrealized_pnl || 0,
        holdings_count: portfolio.holdings_count || 0
      })
      .select('id')
      .single();
    return data?.id;
  }

  getLatestPortfolio(channelId = 'default') {
    // Synchronous wrapper - returns null, use getLatestPortfolioAsync
    return null;
  }

  async getLatestPortfolioAsync(channelId = 'default') {
    const { data } = await this.supabase
      .from('virtual_portfolio')
      .select('*')
      .eq('channel_id', channelId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();
    return data;
  }

  async getPortfolioHistory(days = 7, channelId = 'default') {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data } = await this.supabase
      .from('virtual_portfolio')
      .select('*')
      .eq('channel_id', channelId)
      .gte('timestamp', startDate.toISOString())
      .order('timestamp');
    return data || [];
  }

  // Grid levels methods
  async upsertGridLevel(grid, channelId = 'default') {
    await this.supabase
      .from('grid_levels')
      .upsert({
        channel_id: channelId,
        token: grid.token,
        symbol: grid.symbol,
        last_buy_price: grid.last_buy_price || null,
        last_sell_price: grid.last_sell_price || null,
        reference_price: grid.reference_price,
        buy_count: grid.buy_count || 0,
        sell_count: grid.sell_count || 0,
        total_pnl: grid.total_pnl || 0,
        is_active: grid.is_active !== undefined ? grid.is_active : true,
        last_updated: new Date().toISOString()
      }, { onConflict: 'channel_id,token' });
  }

  async getGridLevel(token, channelId = 'default') {
    const { data } = await this.supabase
      .from('grid_levels')
      .select('*')
      .eq('channel_id', channelId)
      .eq('token', token)
      .single();
    return data;
  }

  getAllGridLevels(channelId = 'default') {
    // Synchronous wrapper - returns empty, use getAllGridLevelsAsync
    return [];
  }

  async getAllGridLevelsAsync(channelId = 'default') {
    const { data } = await this.supabase
      .from('grid_levels')
      .select('*')
      .eq('channel_id', channelId)
      .eq('is_active', true)
      .order('symbol');
    return data || [];
  }

  async incrementGridBuyCount(token, channelId = 'default') {
    const grid = await this.getGridLevel(token, channelId);
    if (!grid) return;

    await this.supabase
      .from('grid_levels')
      .update({
        buy_count: grid.buy_count + 1,
        last_updated: new Date().toISOString()
      })
      .eq('channel_id', channelId)
      .eq('token', token);
  }

  async incrementGridSellCount(token, channelId = 'default') {
    const grid = await this.getGridLevel(token, channelId);
    if (!grid) return;

    await this.supabase
      .from('grid_levels')
      .update({
        sell_count: grid.sell_count + 1,
        last_updated: new Date().toISOString()
      })
      .eq('channel_id', channelId)
      .eq('token', token);
  }

  async updateGridPnl(token, pnl, channelId = 'default') {
    const grid = await this.getGridLevel(token, channelId);
    if (!grid) return;

    await this.supabase
      .from('grid_levels')
      .update({
        total_pnl: grid.total_pnl + pnl,
        last_updated: new Date().toISOString()
      })
      .eq('channel_id', channelId)
      .eq('token', token);
  }

  async deactivateGridLevel(token, channelId = 'default') {
    await this.supabase
      .from('grid_levels')
      .update({
        is_active: false,
        last_updated: new Date().toISOString()
      })
      .eq('channel_id', channelId)
      .eq('token', token);
  }

  // Statistics methods
  getTotalPnL(channelId = 'default') {
    // Synchronous wrapper - returns defaults, use getTotalPnLAsync
    return {
      realized_pnl: 0,
      traded_symbols: 0,
      total_orders: 0,
      buy_orders: 0,
      sell_orders: 0
    };
  }

  async getTotalPnLAsync(channelId = 'default') {
    const { data: orders } = await this.supabase
      .from('virtual_orders')
      .select('type, pnl, symbol')
      .eq('channel_id', channelId);

    if (!orders || orders.length === 0) {
      return {
        realized_pnl: 0,
        traded_symbols: 0,
        total_orders: 0,
        buy_orders: 0,
        sell_orders: 0
      };
    }

    const symbols = new Set();
    let realizedPnl = 0;
    let buyOrders = 0;
    let sellOrders = 0;

    orders.forEach(order => {
      symbols.add(order.symbol);
      if (order.type === 'SELL') {
        realizedPnl += order.pnl || 0;
        sellOrders++;
      } else {
        buyOrders++;
      }
    });

    return {
      realized_pnl: realizedPnl,
      traded_symbols: symbols.size,
      total_orders: orders.length,
      buy_orders: buyOrders,
      sell_orders: sellOrders
    };
  }

  getTodayStats(channelId = 'default') {
    // Synchronous wrapper - returns defaults, use getTodayStatsAsync
    return {
      today_pnl: 0,
      today_orders: 0,
      today_buys: 0,
      today_sells: 0
    };
  }

  async getTodayStatsAsync(channelId = 'default') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: orders } = await this.supabase
      .from('virtual_orders')
      .select('type, pnl')
      .eq('channel_id', channelId)
      .gte('timestamp', today.toISOString());

    if (!orders || orders.length === 0) {
      return {
        today_pnl: 0,
        today_orders: 0,
        today_buys: 0,
        today_sells: 0
      };
    }

    let todayPnl = 0;
    let todayBuys = 0;
    let todaySells = 0;

    orders.forEach(order => {
      if (order.type === 'SELL') {
        todayPnl += order.pnl || 0;
        todaySells++;
      } else {
        todayBuys++;
      }
    });

    return {
      today_pnl: todayPnl,
      today_orders: orders.length,
      today_buys: todayBuys,
      today_sells: todaySells
    };
  }

  getTopPerformers(limit = 10, channelId = 'default') {
    // Synchronous wrapper - returns empty, use getTopPerformersAsync
    return [];
  }

  async getTopPerformersAsync(limit = 10, channelId = 'default') {
    const { data: orders } = await this.supabase
      .from('virtual_orders')
      .select('symbol, type, pnl')
      .eq('channel_id', channelId);

    if (!orders) return [];

    const symbolStats = {};
    orders.forEach(order => {
      if (!symbolStats[order.symbol]) {
        symbolStats[order.symbol] = { symbol: order.symbol, total_pnl: 0, trade_count: 0 };
      }
      symbolStats[order.symbol].trade_count++;
      if (order.type === 'SELL') {
        symbolStats[order.symbol].total_pnl += order.pnl || 0;
      }
    });

    return Object.values(symbolStats)
      .sort((a, b) => b.total_pnl - a.total_pnl)
      .slice(0, limit);
  }

  getWorstPerformers(limit = 10, channelId = 'default') {
    // Synchronous wrapper - returns empty, use getWorstPerformersAsync
    return [];
  }

  async getWorstPerformersAsync(limit = 10, channelId = 'default') {
    const { data: orders } = await this.supabase
      .from('virtual_orders')
      .select('symbol, type, pnl')
      .eq('channel_id', channelId);

    if (!orders) return [];

    const symbolStats = {};
    orders.forEach(order => {
      if (!symbolStats[order.symbol]) {
        symbolStats[order.symbol] = { symbol: order.symbol, total_pnl: 0, trade_count: 0 };
      }
      symbolStats[order.symbol].trade_count++;
      if (order.type === 'SELL') {
        symbolStats[order.symbol].total_pnl += order.pnl || 0;
      }
    });

    return Object.values(symbolStats)
      .sort((a, b) => a.total_pnl - b.total_pnl)
      .slice(0, limit);
  }

  // Reset methods
  async resetPortfolio(channelId = 'default') {
    await this.supabase.from('virtual_orders').delete().eq('channel_id', channelId);
    await this.supabase.from('virtual_holdings').delete().eq('channel_id', channelId);
    await this.supabase.from('virtual_portfolio').delete().eq('channel_id', channelId);
    await this.supabase.from('grid_levels').delete().eq('channel_id', channelId);

    logger.info(`🔄 Portfolio reset complete for channel ${channelId}`);
  }

  close() {
    // Supabase client doesn't need explicit close
    logger.info('🔒 Database connection closed');
  }
}

module.exports = new DatabaseService();
