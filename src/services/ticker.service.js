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
    this.lastTickTime = null;
    this.tickCount = 0;
    this.channelWarningShown = false;
  }

  async initialize() {
    logger.info('🔧 Initializing Ticker Service...');
    
    if (!this.tickerChannelId) {
      logger.error('❌ DISCORD_TICKER_CHANNEL_ID not set in environment');
      console.error('\n⚠️  Please add DISCORD_TICKER_CHANNEL_ID to your .env file\n');
      return;
    }

    logger.info(`📺 Ticker Channel ID: ${this.tickerChannelId}`);

    try {
      await this.loadInstruments();

      logger.info('🔌 Creating WebSocket connection...');
      this.ticker = new KiteTicker({
        api_key: process.env.ZERODHA_API_KEY,
        access_token: process.env.ZERODHA_ACCESS_TOKEN
      });

      this.setupTickerHandlers();
      
      logger.info('🔗 Connecting to Zerodha WebSocket...');
      this.ticker.connect();
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await this.subscribeToStocks();

      this.startDiscordUpdates();

      logger.info('✅ Ticker service initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize ticker:', error);
      console.error('Ticker initialization error:', error.message);
    }
  }

  async loadInstruments() {
    try {
      logger.info('📥 Loading NSE instruments...');
      const instruments = await zerodhaService.kite.getInstruments('NSE');
      
      instruments.forEach(inst => {
        const symbol = `NSE:${inst.tradingsymbol}`;
        this.instrumentsCache.set(symbol, {
          token: inst.instrument_token,
          tradingsymbol: inst.tradingsymbol,
          name: inst.name,
          exchange: inst.exchange
        });
      });

      logger.info(`✅ Loaded ${this.instrumentsCache.size} instruments`);
    } catch (error) {
      logger.error('❌ Error loading instruments:', error);
      throw error;
    }
  }

  setupTickerHandlers() {
    this.ticker.on('connect', () => {
      logger.info('🔌 WebSocket connected successfully!');
      this.isConnected = true;
      console.log('\n✅ WebSocket is CONNECTED!\n');
      
      if (this.subscribedTokens.length > 0) {
        logger.info('🔄 Re-subscribing to tokens after connect...');
        this.ticker.subscribe(this.subscribedTokens);
        this.ticker.setMode(this.ticker.modeFull, this.subscribedTokens);
      }
    });

    this.ticker.on('ticks', (ticks) => {
      this.tickCount += ticks.length;
      this.lastTickTime = new Date();
      
      logger.info(`📊 ✅ Received ${ticks.length} ticks! Total: ${this.tickCount}`);
      
      if (this.tickCount <= 5) {
        console.log('\n🎉 TICKS ARE FLOWING!\n');
        console.log('Sample tick:', JSON.stringify({
          token: ticks[0].instrument_token,
          ltp: ticks[0].last_price,
          volume: ticks[0].volume
        }, null, 2));
      }
      
      this.processTicks(ticks);
    });

    this.ticker.on('disconnect', (error) => {
      logger.warn('⚠️ WebSocket disconnected:', error);
      this.isConnected = false;
      console.log('\n⚠️ WebSocket DISCONNECTED\n');
    });

    this.ticker.on('error', (error) => {
      logger.error('❌ WebSocket error:', error);
      console.error('\n❌ WebSocket Error Details:\n', error, '\n');
    });

    this.ticker.on('close', (code, reason) => {
      logger.info(`🔌 WebSocket closed - Code: ${code}, Reason: ${reason}`);
      this.isConnected = false;
    });

    this.ticker.on('reconnect', (reconnect_count, reconnect_interval) => {
      logger.info(`🔄 Reconnecting... Attempt: ${reconnect_count}, Interval: ${reconnect_interval}ms`);
    });

    this.ticker.on('noreconnect', () => {
      logger.error('❌ Max reconnection attempts reached');
    });

    this.ticker.on('order_update', (order) => {
      logger.info('📋 Order update received:', order.order_id);
    });

    this.ticker.on('message', (binary_msg) => {
      logger.info('📩 Raw message received, length:', binary_msg.length);
    });
  }

  processTicks(ticks) {
    ticks.forEach(tick => {
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
        
        if (this.tickCount % 20 === 0) {
          logger.info(`📈 ${symbol}: ₹${tick.last_price}`);
        }
      } else {
        logger.warn(`⚠️ Received tick for unknown token: ${tick.instrument_token}`);
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
      let subsPath = path.join(__dirname, '../../subscriptions.json');
      
      if (process.env.RAILWAY_ENVIRONMENT && fs.existsSync('/app/data/subscriptions.json')) {
        subsPath = '/app/data/subscriptions.json';
      }
      
      if (!fs.existsSync(subsPath)) {
        logger.warn('⚠️ No subscriptions file found');
        console.log('\n⚠️ subscriptions.json not found. Use !subscribe SYMBOL to add stocks.\n');
        return;
      }

      const data = fs.readFileSync(subsPath, 'utf8');
      const subscriptions = JSON.parse(data);
      
      logger.info(`📋 Found ${subscriptions.length} subscriptions: ${subscriptions.join(', ')}`);
      
      if (subscriptions.length === 0) {
        logger.info('ℹ️ No stocks to subscribe');
        console.log('\n💡 No stocks subscribed. Use !subscribe SYMBOL to add stocks.\n');
        return;
      }

      const tokens = [];
      const notFound = [];
      const foundStocks = [];
      
      subscriptions.forEach(symbol => {
        const instrument = this.instrumentsCache.get(symbol);
        if (instrument) {
          tokens.push(instrument.token);
          foundStocks.push({
            symbol: symbol,
            token: instrument.token,
            name: instrument.name
          });
          logger.info(`✅ ${symbol} → Token: ${instrument.token} (${instrument.name})`);
        } else {
          notFound.push(symbol);
          logger.warn(`⚠️ No instrument found for ${symbol}`);
        }
      });

      if (notFound.length > 0) {
        console.log('\n⚠️ Could not find instruments for:', notFound.join(', '));
        console.log('💡 Try using !search to find correct symbols\n');
      }

      if (tokens.length > 0) {
        this.subscribedTokens = tokens;
        
        logger.info(`🎯 Subscribing to ${tokens.length} tokens via WebSocket...`);
        console.log('\nSubscribing to:');
        foundStocks.forEach(s => {
          console.log(`  - ${s.symbol} (Token: ${s.token}) - ${s.name}`);
        });
        console.log('');
        
        this.ticker.subscribe(tokens);
        this.ticker.setMode(this.ticker.modeFull, tokens);
        
        logger.info(`📊 Subscribed to ${tokens.length} stocks on WebSocket`);
        console.log(`✅ WebSocket subscription complete!\n`);
        
        const now = new Date();
        const istTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
        
        const istHour = parseInt(new Date().toLocaleString('en-IN', { 
          timeZone: 'Asia/Kolkata', 
          hour: 'numeric', 
          hour12: false 
        }));
        const inMarketHours = istHour >= 9 && istHour < 16;
        
        logger.info(`⏰ Current time: ${istTime}`);
        if (inMarketHours) {
          logger.info('✅ Market hours - expecting live ticks');
          console.log('🕐 Market is OPEN - Waiting for ticks from exchange...\n');
        } else {
          logger.warn('⚠️ Outside market hours (9:15 AM - 3:30 PM IST) - no ticks expected');
          console.log('\n⏰ Market is closed. Ticks will flow when market opens.\n');
        }
      }
    } catch (error) {
      logger.error('❌ Error subscribing to stocks:', error);
      console.error('Subscription error:', error.message);
    }
  }

  async addStock(symbol) {
    const instrument = this.instrumentsCache.get(symbol);
    
    if (!instrument) {
      logger.warn(`❌ Cannot add ${symbol} - instrument not found`);
      return false;
    }

    if (this.subscribedTokens.includes(instrument.token)) {
      logger.info(`ℹ️ ${symbol} already subscribed`);
      return true;
    }

    try {
      this.subscribedTokens.push(instrument.token);
      
      if (this.isConnected) {
        this.ticker.subscribe([instrument.token]);
        this.ticker.setMode(this.ticker.modeFull, [instrument.token]);
        logger.info(`➕ Added ${symbol} to ticker stream (Token: ${instrument.token})`);
      } else {
        logger.warn(`⚠️ WebSocket not connected, ${symbol} will be subscribed on next connect`);
      }
      
      return true;
    } catch (error) {
      logger.error(`❌ Error adding ${symbol} to ticker:`, error);
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
      
      if (this.isConnected) {
        this.ticker.unsubscribe([instrument.token]);
      }
      
      this.stockData.delete(symbol);
      
      logger.info(`➖ Removed ${symbol} from ticker stream`);
      return true;
    } catch (error) {
      logger.error(`❌ Error removing ${symbol} from ticker:`, error);
      return false;
    }
  }

  startDiscordUpdates() {
    logger.info('🔄 Starting Discord ticker updates...');
    
    this.updateInterval = setInterval(async () => {
      await this.updateDiscordMessage();
    }, 3000);

    logger.info('✅ Discord ticker updates started (3s interval)');
  }

  async updateDiscordMessage() {
    try {
      const tickerChannel = discordService.client.channels.cache.get(this.tickerChannelId);
      
      if (!tickerChannel) {
        if (!this.channelWarningShown) {
          logger.error(`❌ Ticker channel not found: ${this.tickerChannelId}`);
          this.channelWarningShown = true;
        }
        return;
      }

      const message = this.formatTickerMessage();

      if (!this.tickerMessage) {
        this.tickerMessage = await tickerChannel.send(message);
        logger.info('✅ Ticker message created!');
      } else {
        await this.tickerMessage.edit(message);
        
        if (this.tickCount > 0 && this.tickCount % 60 === 0) {
          logger.info(`🔄 Ticker updated (${this.tickCount} ticks received)`);
        }
      }
    } catch (error) {
      logger.error('❌ Error updating Discord ticker:', error);
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

    if (!this.isConnected) {
      message += `⚠️ WebSocket disconnected - reconnecting...\n`;
      return message;
    }

    if (this.stockData.size === 0) {
      message += `⏳ Waiting for market data...\n`;
      message += `\n📡 WebSocket: Connected ✅\n`;
      message += `📊 Subscribed: ${this.subscribedTokens.length} stocks\n`;
      message += `🎫 Ticks received: ${this.tickCount}\n`;
      
      if (this.lastTickTime) {
        const secAgo = Math.floor((Date.now() - this.lastTickTime) / 1000);
        message += `⏱️ Last tick: ${secAgo}s ago\n`;
      }
      
      const istHour = parseInt(new Date().toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata', 
        hour: 'numeric', 
        hour12: false 
      }));
      
      const dayOfWeek = new Date().toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata', 
        weekday: 'long' 
      });
      const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';
      
      if (isWeekend) {
        message += `\n📅 ${dayOfWeek} - Market closed\n`;
      } else if (istHour < 9) {
        message += `\n⏰ Pre-market (Opens 9:15 AM IST)\n`;
      } else if (istHour >= 16) {
        message += `\n⏰ After hours (Closed at 3:30 PM IST)\n`;
      } else {
        message += `\n✅ Market hours - Waiting for ticks...\n`;
        message += `💡 If no ticks after 1 min, try !ticker restart\n`;
      }
      
      return message;
    }

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
    message += `📈 Tracking ${this.stockData.size} stocks | 🎫 ${this.tickCount} ticks`;

    return message;
  }

  async stop() {
    logger.info('🛑 Stopping ticker service...');
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    if (this.ticker && this.isConnected) {
      this.ticker.disconnect();
    }

    this.isConnected = false;
    logger.info('✅ Ticker service stopped');
  }

  getStatus() {
    return {
      connected: this.isConnected,
      subscribedTokens: this.subscribedTokens.length,
      stocksWithData: this.stockData.size,
      totalTicks: this.tickCount,
      lastTick: this.lastTickTime,
      channelId: this.tickerChannelId,
      messageCreated: !!this.tickerMessage
    };
  }
}

module.exports = new TickerService();