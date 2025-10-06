const KiteTicker = require('kiteconnect').KiteTicker;
const zerodhaService = require('./zerodha.service');
const discordService = require('./discord.service');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class TickerService {
  constructor() {
    this.ticker = null;
    this.subscribedTokens = [];
    this.stockData = new Map();
    this.tickerMessage = null;
    this.updateInterval = null;
    this.isConnected = false;
    this.tickerChannelId = process.env.DISCORD_TICKER_CHANNEL_ID;
    this.instrumentsCache = new Map();
  }

  async initialize() {
    if (!this.tickerChannelId) {
      logger.error('DISCORD_TICKER_CHANNEL_ID not set in environment');
      return;
    }

    try {
      // Load instruments to get tokens
      await this.loadInstruments();

      // Initialize KiteTicker
      this.ticker = new KiteTicker({
        api_key: process.env.ZERODHA_API_KEY,
        access_token: process.env.ZERODHA_ACCESS_TOKEN
      });

      this.setupTickerHandlers();
      
      // Connect ticker
      this.ticker.connect();
      
      // Subscribe to current stocks
      await this.subscribeToStocks();

      // Start Discord message updates
      this.startDiscordUpdates();

      logger.info('✅ Ticker service initialized');
    } catch (error) {
      logger.error('Failed to initialize ticker:', error);
    }
  }

  async loadInstruments() {
    try {
      const instruments = await zerodhaService.kite.getInstruments('NSE');
      
      // Cache instrument tokens
      instruments.forEach(inst => {
        const symbol = `NSE:${inst.tradingsymbol}`;
        this.instrumentsCache.set(symbol, {
          token: inst.instrument_token,
          tradingsymbol: inst.tradingsymbol,
          name: inst.name
        });
      });

      logger.info(`Loaded ${this.instrumentsCache.size} instruments`);
    } catch (error) {
      logger.error('Error loading instruments:', error);
    }
  }

  setupTickerHandlers() {
    this.ticker.on('connect', () => {
      logger.info('🔌 WebSocket connected');
      this.isConnected = true;
    });

    this.ticker.on('disconnect', () => {
      logger.warn('🔌 WebSocket disconnected');
      this.isConnected = false;
    });

    this.ticker.on('error', (error) => {
      logger.error('WebSocket error:', error);
    });

    this.ticker.on('close', () => {
      logger.info('WebSocket closed');
      this.isConnected = false;
    });

    // Handle tick data
    this.ticker.on('ticks', (ticks) => {
      this.processTicks(ticks);
    });

    this.ticker.on('order_update', (order) => {
      logger.info('Order update:', order);
    });
  }

  processTicks(ticks) {
    ticks.forEach(tick => {
      // Find symbol for this token
      const symbol = this.getSymbolFromToken(tick.instrument_token);
      
      if (symbol) {
        this.stockData.set(symbol, {
          last_price: tick.last_price,
          change: tick.change,
          volume: tick.volume,
          oi: tick.oi,
          buy_quantity: tick.buy_quantity,
          sell_quantity: tick.sell_quantity,
          last_trade_time: tick.last_trade_time,
          ohlc: tick.ohlc,
          timestamp: new Date()
        });
      }
    });
  }

  getSymbolFromToken(token) {
    for (const [symbol, data] of this.instrumentsCache.entries()) {
      if (data.token === token) {
        return symbol;
      }
    }
    return null;
  }

  async subscribeToStocks() {
    try {
      // Read subscriptions
      const subsPath = path.join(__dirname, '../../subscriptions.json');
      
      if (!fs.existsSync(subsPath)) {
        logger.warn('No subscriptions file found');
        return;
      }

      const subscriptions = JSON.parse(fs.readFileSync(subsPath, 'utf8'));
      
      if (subscriptions.length === 0) {
        logger.info('No stocks to subscribe');
        return;
      }

      // Get tokens for subscribed stocks
      const tokens = [];
      
      subscriptions.forEach(symbol => {
        const instrument = this.instrumentsCache.get(symbol);
        if (instrument) {
          tokens.push(instrument.token);
        } else {
          logger.warn(`No instrument found for ${symbol}`);
        }
      });

      if (tokens.length > 0) {
        this.subscribedTokens = tokens;
        
        // Subscribe to full mode for detailed data
        this.ticker.subscribe(tokens);
        this.ticker.setMode(this.ticker.modeFull, tokens);
        
        logger.info(`📊 Subscribed to ${tokens.length} stocks on WebSocket`);
      }
    } catch (error) {
      logger.error('Error subscribing to stocks:', error);
    }
  }

  async addStock(symbol) {
    const instrument = this.instrumentsCache.get(symbol);
    
    if (!instrument) {
      logger.warn(`Cannot add ${symbol} - instrument not found`);
      return false;
    }

    if (this.subscribedTokens.includes(instrument.token)) {
      logger.info(`${symbol} already subscribed`);
      return true;
    }

    try {
      this.subscribedTokens.push(instrument.token);
      this.ticker.subscribe([instrument.token]);
      this.ticker.setMode(this.ticker.modeFull, [instrument.token]);
      
      logger.info(`➕ Added ${symbol} to ticker stream`);
      return true;
    } catch (error) {
      logger.error(`Error adding ${symbol} to ticker:`, error);
      return false;
    }
  }

  async removeStock(symbol) {
    const instrument = this.instrumentsCache.get(symbol);
    
    if (!instrument) {
      return false;
    }

    const index = this.subscribedTokens.indexOf(instrument.token);
    if (index === -1) {
      return true;
    }

    try {
      this.subscribedTokens.splice(index, 1);
      this.ticker.unsubscribe([instrument.token]);
      this.stockData.delete(symbol);
      
      logger.info(`➖ Removed ${symbol} from ticker stream`);
      return true;
    } catch (error) {
      logger.error(`Error removing ${symbol} from ticker:`, error);
      return false;
    }
  }

  startDiscordUpdates() {
    // Update Discord message every 3 seconds
    this.updateInterval = setInterval(async () => {
      await this.updateDiscordMessage();
    }, 3000);

    logger.info('🔄 Started Discord ticker updates (3s interval)');
  }

  async updateDiscordMessage() {
    if (!this.isConnected || this.stockData.size === 0) {
      return;
    }

    try {
      const tickerChannel = discordService.client.channels.cache.get(this.tickerChannelId);
      
      if (!tickerChannel) {
        logger.warn('Ticker channel not found');
        return;
      }

      const message = this.formatTickerMessage();

      // Create or update message
      if (!this.tickerMessage) {
        this.tickerMessage = await tickerChannel.send(message);
      } else {
        await this.tickerMessage.edit(message);
      }
    } catch (error) {
      logger.error('Error updating Discord ticker:', error);
      // Reset message on error
      this.tickerMessage = null;
    }
  }

  formatTickerMessage() {
    const timestamp = new Date().toLocaleTimeString('en-IN', { 
      timeZone: 'Asia/Kolkata',
      hour12: false 
    });

    let message = `📊 **LIVE MARKET TICKER** | ${timestamp} IST\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (this.stockData.size === 0) {
      message += `⏳ Waiting for data...\n`;
      return message;
    }

    // Sort by symbol name
    const sortedData = Array.from(this.stockData.entries()).sort((a, b) => 
      a[0].localeCompare(b[0])
    );

    sortedData.forEach(([symbol, data]) => {
      const shortSymbol = symbol.replace('NSE:', '');
      const change = data.last_price - data.ohlc.close;
      const changePercent = ((change / data.ohlc.close) * 100).toFixed(2);
      const emoji = change >= 0 ? '🟢' : '🔴';
      const arrow = change >= 0 ? '▲' : '▼';

      message += `${emoji} **${shortSymbol}** ₹${data.last_price.toFixed(2)}\n`;
      message += `   ${arrow} ${change >= 0 ? '+' : ''}₹${change.toFixed(2)} (${changePercent}%)\n`;
      message += `   Vol: ${(data.volume / 100000).toFixed(2)}L\n\n`;
    });

    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📈 Tracking ${this.stockData.size} stocks`;

    return message;
  }

  async stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    if (this.ticker) {
      this.ticker.disconnect();
    }

    logger.info('🛑 Ticker service stopped');
  }
}

module.exports = new TickerService();