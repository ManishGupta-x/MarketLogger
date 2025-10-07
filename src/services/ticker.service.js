const WebSocket = require('ws');
const zlib = require('zlib');
const zerodhaService = require('./zerodha.service');
const discordService = require('./discord.service');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class TickerService {
  constructor() {
    this.ws = null;
    this.subscribedTokens = [];
    this.stockData = new Map();
    this.tickerMessage = null;
    this.updateInterval = null;
    this.isConnected = false;
    this.tickerChannelId = process.env.DISCORD_TICKER_CHANNEL_ID;
    this.instrumentsCache = new Map();
    this.tokenToSymbolMap = new Map();
    this.lastTickTime = null;
    this.tickCount = 0;
    this.channelWarningShown = false;
    this.heartbeatCount = 0;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
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
      await this.connectWebSocket();
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
      console.log(`📋 Fetched ${instruments.length} instruments from NSE`);
      
      instruments.forEach(inst => {
        const symbol = `NSE:${inst.tradingsymbol}`;
        this.instrumentsCache.set(symbol, {
          token: inst.instrument_token,
          tradingsymbol: inst.tradingsymbol,
          name: inst.name,
          exchange: inst.exchange
        });
        
        this.tokenToSymbolMap.set(inst.instrument_token, symbol);
      });

      logger.info(`✅ Loaded ${this.instrumentsCache.size} instruments`);
      console.log(`✅ Instrument cache ready with ${this.instrumentsCache.size} entries\n`);
    } catch (error) {
      logger.error('❌ Error loading instruments:', error);
      throw error;
    }
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      const API_KEY = process.env.ZERODHA_API_KEY;
      const ACCESS_TOKEN = process.env.ZERODHA_ACCESS_TOKEN;
      const WS_URL = `wss://ws.kite.trade?api_key=${API_KEY}&access_token=${ACCESS_TOKEN}`;

      logger.info('🔌 Creating WebSocket connection...');
      console.log('🔗 Connecting to Zerodha WebSocket...\n');

      this.ws = new WebSocket(WS_URL);

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        logger.info('✅ WebSocket connected successfully!');
        console.log('✅ WebSocket is CONNECTED!\n');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on('message', (message) => {
        this.handleMessage(message);
      });

      this.ws.on('close', () => {
        logger.warn('⚠️ WebSocket disconnected');
        console.log('\n⚠️ WebSocket DISCONNECTED\n');
        this.isConnected = false;
        this.attemptReconnect();
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('❌ WebSocket error:', err.message);
        console.error('\n❌ WebSocket Error:', err.message, '\n');
        
        if (!this.isConnected) {
          reject(err);
        }
      });
    });
  }

  handleMessage(message) {
    if (Buffer.isBuffer(message)) {
      // Heartbeat
      if (message.length === 1) {
        this.heartbeatCount++;
        if (this.heartbeatCount % 50 === 0) {
          logger.info(`💓 Heartbeat ${this.heartbeatCount} (connection alive)`);
        }
        return;
      }

      try {
        let data = message;
        
        // Check if compressed (zlib magic bytes)
        if (message.length >= 2 && message[0] === 0x78 && 
            (message[1] === 0x9c || message[1] === 0x01 || message[1] === 0xda)) {
          data = zlib.inflateSync(message);
        }

        const ticks = this.parseBinaryTicks(data);
        
        if (ticks.length > 0) {
          this.tickCount += ticks.length;
          this.lastTickTime = new Date();
          
          logger.info(`📊 ✅ TICKS RECEIVED! Count: ${ticks.length}, Total: ${this.tickCount}`);
          
          // Log first few ticks
          if (this.tickCount <= 10) {
            console.log('\n🎉 TICK DATA FLOWING!\n');
            ticks.forEach((tick, idx) => {
              const symbol = this.tokenToSymbolMap.get(tick.instrument_token);
              console.log(`Tick ${idx + 1}:`, {
                symbol: symbol || 'UNKNOWN',
                token: tick.instrument_token,
                ltp: tick.last_price,
                volume: tick.volume,
                change: tick.change
              });
            });
            console.log('');
          }
          
          this.processTicks(ticks);
        }
      } catch (err) {
        logger.error('⚠️ Binary message error:', err.message);
      }
    } else {
      // Text message
      try {
        const text = message.toString();
        const parsed = JSON.parse(text);
        logger.info('📜 Text Message:', parsed);
        console.log('📜 Server Message:', parsed);
      } catch {
        logger.info('📜 Raw Text:', message.toString());
      }
    }
  }

  parseBinaryTicks(buffer) {
    const packets = [];
    let offset = 0;

    try {
      if (buffer.length < 2) return packets;
      
      const numPackets = buffer.readUInt16BE(offset);
      offset += 2;

      for (let i = 0; i < numPackets; i++) {
        if (offset + 2 > buffer.length) {
          logger.warn(`⚠️ Insufficient data for packet ${i} length`);
          break;
        }

        const packetLength = buffer.readUInt16BE(offset);
        offset += 2;

        if (offset + packetLength > buffer.length) {
          logger.warn(`⚠️ Insufficient data for packet ${i}`);
          break;
        }

        const packet = buffer.slice(offset, offset + packetLength);
        offset += packetLength;

        if (packet.length >= 8) {
          const instrument_token = packet.readUInt32BE(0);
          
          const tick = {
            instrument_token,
            mode: packet.length === 8 ? 'ltp' : 
                  packet.length === 28 ? 'index_quote' :
                  packet.length === 44 ? 'quote' : 'full'
          };

          // All modes have last_price
          if (packet.length >= 8) {
            tick.last_price = packet.readUInt32BE(4) / 100.0;
          }

          // Quote and Full modes
          if (packet.length >= 44) {
            tick.last_traded_quantity = packet.readUInt32BE(8);
            tick.average_traded_price = packet.readUInt32BE(12) / 100.0;
            tick.volume = packet.readUInt32BE(16);
            tick.total_buy_quantity = packet.readUInt32BE(20);
            tick.total_sell_quantity = packet.readUInt32BE(24);
            tick.ohlc = {
              open: packet.readUInt32BE(28) / 100.0,
              high: packet.readUInt32BE(32) / 100.0,
              low: packet.readUInt32BE(36) / 100.0,
              close: packet.readUInt32BE(40) / 100.0
            };
            
            // Calculate change
            tick.change = tick.last_price - tick.ohlc.close;
          }

          // Full mode additional data
          if (packet.length >= 184) {
            tick.last_trade_time = packet.readUInt32BE(44);
            tick.oi = packet.readUInt32BE(48);
            tick.oi_day_high = packet.readUInt32BE(52);
            tick.oi_day_low = packet.readUInt32BE(56);
            tick.timestamp = packet.readUInt32BE(60);
            
            // Market depth
            tick.depth = {
              buy: [],
              sell: []
            };

            let depthOffset = 64;
            // 5 buy orders
            for (let j = 0; j < 5; j++) {
              tick.depth.buy.push({
                quantity: packet.readUInt32BE(depthOffset),
                price: packet.readUInt32BE(depthOffset + 4) / 100.0,
                orders: packet.readUInt16BE(depthOffset + 8)
              });
              depthOffset += 12;
            }
            
            // 5 sell orders
            for (let j = 0; j < 5; j++) {
              tick.depth.sell.push({
                quantity: packet.readUInt32BE(depthOffset),
                price: packet.readUInt32BE(depthOffset + 4) / 100.0,
                orders: packet.readUInt16BE(depthOffset + 8)
              });
              depthOffset += 12;
            }
          }

          packets.push(tick);
        }
      }

      return packets;
    } catch (err) {
      logger.error("❌ Parse error:", err.message);
      return packets;
    }
  }

  processTicks(ticks) {
    ticks.forEach(tick => {
      const symbol = this.tokenToSymbolMap.get(tick.instrument_token);
      
      if (symbol) {
        this.stockData.set(symbol, {
          last_price: tick.last_price,
          change: tick.change,
          volume: tick.volume,
          oi: tick.oi,
          buy_quantity: tick.total_buy_quantity,
          sell_quantity: tick.total_sell_quantity,
          last_trade_time: tick.last_trade_time,
          ohlc: tick.ohlc,
          timestamp: new Date()
        });
        
        if (this.tickCount % 20 === 0) {
          logger.info(`📈 ${symbol}: ₹${tick.last_price?.toFixed(2) || 'N/A'}`);
        }
      } else {
        logger.warn(`⚠️ Received tick for unknown token: ${tick.instrument_token}`);
      }
    });
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
      console.log(`\n📋 Processing ${subscriptions.length} subscriptions...\n`);
      
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
          console.log(`  ✅ ${symbol} → Token: ${instrument.token} - ${instrument.name}`);
        } else {
          notFound.push(symbol);
          logger.warn(`⚠️ No instrument found for ${symbol}`);
          console.log(`  ❌ ${symbol} → NOT FOUND`);
        }
      });

      if (notFound.length > 0) {
        console.log('\n⚠️ Could not find instruments for:', notFound.join(', '));
        console.log('💡 Try using !search to find correct symbols\n');
      }

      if (tokens.length > 0) {
        this.subscribedTokens = tokens;
        
        console.log(`\n🎯 Subscribing to ${tokens.length} instruments...\n`);
        logger.info(`🎯 Tokens to subscribe: ${tokens.join(', ')}`);
        
        if (!this.isConnected) {
          logger.error('❌ WebSocket not connected! Cannot subscribe.');
          throw new Error('WebSocket not connected');
        }
        
        // Subscribe
        const subscribeMsg = { a: "subscribe", v: tokens };
        this.ws.send(JSON.stringify(subscribeMsg));
        logger.info('📡 Subscribed:', subscribeMsg);
        console.log('📡 Subscribe command sent:', tokens.join(', '));
        
        // Wait before setting mode
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Set mode to full
        const modeMsg = { a: "mode", v: ["full", tokens] };
        this.ws.send(JSON.stringify(modeMsg));
        logger.info('⚙️ Set mode to full:', modeMsg);
        console.log('⚙️ Mode set to FULL\n');
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔍 SUBSCRIPTION DIAGNOSTICS:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`WebSocket connected: ${this.isConnected}`);
        console.log(`Subscribed tokens: ${this.subscribedTokens.length}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        console.log('📊 SUBSCRIBED INSTRUMENTS:');
        foundStocks.forEach((s, idx) => {
          console.log(`${idx + 1}. ${s.symbol} (${s.token}) - ${s.name}`);
        });
        console.log('');
        
        this.checkMarketHours();
        
      } else {
        logger.warn('⚠️ No valid tokens to subscribe');
        console.log('\n⚠️ No valid instruments found to subscribe\n');
      }
    } catch (error) {
      logger.error('❌ Error subscribing to stocks:', error);
      console.error('\n❌ Subscription error:', error.message, '\n');
      throw error;
    }
  }

  checkMarketHours() {
    const now = new Date();
    const istTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
    
    const istHour = parseInt(new Date().toLocaleString('en-IN', { 
      timeZone: 'Asia/Kolkata', 
      hour: 'numeric', 
      hour12: false 
    }));
    
    const istMinute = parseInt(new Date().toLocaleString('en-IN', { 
      timeZone: 'Asia/Kolkata', 
      minute: 'numeric'
    }));
    
    const dayOfWeek = new Date().toLocaleString('en-IN', { 
      timeZone: 'Asia/Kolkata', 
      weekday: 'long' 
    });
    
    const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';
    const inMarketHours = !isWeekend && 
      ((istHour === 9 && istMinute >= 15) || 
       (istHour > 9 && istHour < 15) || 
       (istHour === 15 && istMinute <= 30));
    
    logger.info(`⏰ Current time: ${istTime} (${dayOfWeek})`);
    console.log(`⏰ Current IST time: ${istTime} (${dayOfWeek})`);
    
    if (isWeekend) {
      console.log('\n📅 Market is CLOSED (Weekend)');
      console.log('💡 Market operates Monday-Friday only\n');
    } else if (inMarketHours) {
      logger.info('✅ Market is OPEN - expecting live ticks');
      console.log('✅ Market is OPEN (9:15 AM - 3:30 PM IST)');
      console.log('📊 Ticks should start arriving within 10-30 seconds\n');
    } else {
      logger.warn('⚠️ Outside market hours');
      console.log('\n⏰ Market is CLOSED');
      console.log('📅 Trading hours: Monday-Friday, 9:15 AM - 3:30 PM IST\n');
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
        const subscribeMsg = { a: "subscribe", v: [instrument.token] };
        this.ws.send(JSON.stringify(subscribeMsg));
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const modeMsg = { a: "mode", v: ["full", [instrument.token]] };
        this.ws.send(JSON.stringify(modeMsg));
        
        logger.info(`➕ Added ${symbol} to ticker stream (Token: ${instrument.token})`);
      } else {
        logger.warn(`⚠️ WebSocket not connected, ${symbol} will be subscribed on reconnect`);
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
        const unsubscribeMsg = { a: "unsubscribe", v: [instrument.token] };
        this.ws.send(JSON.stringify(unsubscribeMsg));
      }
      
      this.stockData.delete(symbol);
      
      logger.info(`➖ Removed ${symbol} from ticker stream`);
      return true;
    } catch (error) {
      logger.error(`❌ Error removing ${symbol} from ticker:`, error);
      return false;
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('❌ Max reconnection attempts reached');
      console.error('\n❌ Could not reconnect after multiple attempts\n');
      return;
    }

    this.reconnectAttempts++;
    logger.info(`🔄 Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    console.log(`\n🔄 Reconnecting in ${this.reconnectDelay / 1000}s... (Attempt ${this.reconnectAttempts})\n`);

    setTimeout(async () => {
      try {
        await this.connectWebSocket();
        await this.subscribeToStocks();
        logger.info('✅ Reconnected successfully');
      } catch (error) {
        logger.error('❌ Reconnection failed:', error.message);
      }
    }, this.reconnectDelay);
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
      message += `💓 Heartbeats: ${this.heartbeatCount}\n`;
      
      if (this.lastTickTime) {
        const secAgo = Math.floor((Date.now() - this.lastTickTime) / 1000);
        message += `⏱️ Last tick: ${secAgo}s ago\n`;
      }
      
      const istHour = parseInt(new Date().toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata', 
        hour: 'numeric', 
        hour12: false 
      }));
      
      const istMinute = parseInt(new Date().toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata', 
        minute: 'numeric'
      }));
      
      const dayOfWeek = new Date().toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata', 
        weekday: 'long' 
      });
      const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';
      
      if (isWeekend) {
        message += `\n📅 ${dayOfWeek} - Market closed\n`;
      } else if (istHour < 9 || (istHour === 9 && istMinute < 15)) {
        message += `\n⏰ Pre-market (Opens 9:15 AM IST)\n`;
      } else if (istHour > 15 || (istHour === 15 && istMinute > 30)) {
        message += `\n⏰ After hours (Closed at 3:30 PM IST)\n`;
      } else {
        message += `\n✅ Market hours - Waiting for ticks...\n`;
      }
      
      return message;
    }

    const sortedData = Array.from(this.stockData.entries()).sort((a, b) => 
      a[0].localeCompare(b[0])
    );

    sortedData.forEach(([symbol, data]) => {
      const shortSymbol = symbol.replace('NSE:', '');
      const change = data.change || 0;
      const changePercent = data.ohlc ? ((change / data.ohlc.close) * 100).toFixed(2) : '0.00';
      const emoji = change >= 0 ? '🟢' : '🔴';
      const arrow = change >= 0 ? '▲' : '▼';

      message += `${emoji} **${shortSymbol}** ₹${data.last_price.toFixed(2)}\n`;
      message += `   ${arrow} ${change >= 0 ? '+' : ''}₹${change.toFixed(2)} (${changePercent}%)\n`;
      message += `   Vol: ${((data.volume || 0) / 100000).toFixed(2)}L\n\n`;
    });

    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📈 Tracking ${this.stockData.size} stocks | 🎫 ${this.tickCount} ticks`;

    return message;
  }

  async restart() {
    logger.info('🔄 Restarting ticker service...');
    console.log('\n🔄 TICKER RESTART INITIATED\n');
    
    await this.stop();
    
    this.tickCount = 0;
    this.heartbeatCount = 0;
    this.lastTickTime = null;
    this.reconnectAttempts = 0;
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await this.initialize();
    
    logger.info('✅ Ticker service restarted');
    console.log('\n✅ TICKER RESTART COMPLETE\n');
  }

  async stop() {
    logger.info('🛑 Stopping ticker service...');
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.ws && this.isConnected) {
      this.ws.close();
    }

    this.isConnected = false;
    this.tickerMessage = null;
    this.stockData.clear();
    
    logger.info('✅ Ticker service stopped');
  }

  getStatus() {
    return {
      connected: this.isConnected,
      subscribedTokens: this.subscribedTokens.length,
      stocksWithData: this.stockData.size,
      totalTicks: this.tickCount,
      heartbeats: this.heartbeatCount,
      lastTick: this.lastTickTime,
      channelId: this.tickerChannelId,
      messageCreated: !!this.tickerMessage,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  async debugSubscription() {
    console.log('\n🔍 DEBUG SUBSCRIPTION STATUS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`WebSocket State: ${this.isConnected ? 'CONNECTED ✅' : 'DISCONNECTED ❌'}`);
    console.log(`Subscribed Tokens: ${this.subscribedTokens.length}`);
    console.log(`Ticks Received: ${this.tickCount}`);
    console.log(`Heartbeats: ${this.heartbeatCount}`);
    console.log(`Stocks with Data: ${this.stockData.size}`);
    
    if (this.subscribedTokens.length > 0) {
      console.log('\nSubscribed Tokens:');
      this.subscribedTokens.forEach(token => {
        const symbol = this.tokenToSymbolMap.get(token);
        console.log(`  - ${token}: ${symbol || 'UNKNOWN'}`);
      });
    }
    
    if (this.isConnected && this.subscribedTokens.length > 0) {
      console.log('\n🔄 Attempting resubscription...');
      try {
        const subscribeMsg = { a: "subscribe", v: this.subscribedTokens };
        this.ws.send(JSON.stringify(subscribeMsg));
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const modeMsg = { a: "mode", v: ["full", this.subscribedTokens] };
        this.ws.send(JSON.stringify(modeMsg));
        
        console.log('✅ Resubscription sent\n');
      } catch (error) {
        console.error('❌ Resubscription failed:', error.message, '\n');
      }
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

module.exports = new TickerService();