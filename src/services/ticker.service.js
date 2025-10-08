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
    this.subscriptionConfirmed = false;
  }

  async initialize() {
    logger.info('🔧 Initializing Ticker Service...');

    if (!this.tickerChannelId) {
      logger.error('❌ DISCORD_TICKER_CHANNEL_ID not set in environment');
      return;
    }

    try {
      await this.waitForDiscordReady();
      await this.loadInstruments();
      await this.connectWebSocket();
      await this.waitForConnection();
      await this.subscribeToStocks();

      setTimeout(() => {
        this.startDiscordUpdates();
      }, 2000);

      logger.info('✅ Ticker service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize ticker:', error);
    }
  }

  async waitForDiscordReady() {
    return new Promise((resolve) => {
      if (discordService.client && discordService.client.isReady()) {
        resolve();
      } else {
        const checkInterval = setInterval(() => {
          if (discordService.client && discordService.client.isReady()) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 500);
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 30000);
      }
    });
  }

  async waitForConnection() {
    return new Promise((resolve) => {
      if (this.isConnected) {
        resolve();
        return;
      }
      const checkInterval = setInterval(() => {
        if (this.isConnected) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    });
  }

  async loadInstruments() {
    try {
      logger.info('📥 Loading NSE instruments...');
      const instruments = await zerodhaService.kite.getInstruments('NSE');

      instruments.forEach(inst => {
        const symbol = `NSE:${inst.tradingsymbol}`;
        const token = typeof inst.instrument_token === 'number' 
          ? inst.instrument_token 
          : parseInt(inst.instrument_token);
        
        this.instrumentsCache.set(symbol, {
          token: token,
          tradingsymbol: inst.tradingsymbol,
          name: inst.name,
          exchange: inst.exchange
        });

        this.tokenToSymbolMap.set(token, symbol);
      });

      logger.info(`✅ Loaded ${this.instrumentsCache.size} instruments`);
    } catch (error) {
      logger.error('❌ Error loading instruments:', error);
      throw error;
    }
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      const API_KEY = process.env.ZERODHA_API_KEY;
      const ACCESS_TOKEN = process.env.ZERODHA_ACCESS_TOKEN;

      if (!API_KEY || !ACCESS_TOKEN) {
        reject(new Error('Missing API_KEY or ACCESS_TOKEN'));
        return;
      }

      const WS_URL = `wss://ws.kite.trade?api_key=${API_KEY}&access_token=${ACCESS_TOKEN}`;
      this.ws = new WebSocket(WS_URL);

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        logger.info('✅ WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on('message', (message) => {
        this.handleMessage(message);
      });

      this.ws.on('close', () => {
        logger.warn('⚠️ WebSocket disconnected');
        this.isConnected = false;
        this.subscriptionConfirmed = false;
        this.attemptReconnect();
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('❌ WebSocket error:', err.message);
        if (!this.isConnected) {
          reject(err);
        }
      });
    });
  }

  handleMessage(message) {
    if (Buffer.isBuffer(message)) {
      // JSON text message
      if (message.length > 0 && message[0] === 0x7b) {
        try {
          const parsed = JSON.parse(message.toString('utf8'));
          if (parsed.type === 'error') {
            logger.error('Subscription error:', parsed.data);
          }
          return;
        } catch (err) {
          // Ignore parse errors
        }
      }

      // Heartbeat
      if (message.length === 1 && message[0] === 0x00) {
        this.heartbeatCount++;
        return;
      }

      // Binary tick parsing
      try {
        let data = message;
        if (message.length >= 2 && message[0] === 0x78 &&
          (message[1] === 0x9c || message[1] === 0x01 || message[1] === 0xda)) {
          data = zlib.inflateSync(message);
        }

        const ticks = this.parseBinaryTicks(data);
        if (ticks.length > 0) {
          this.tickCount += ticks.length;
          this.lastTickTime = new Date();

          if (!this.subscriptionConfirmed) {
            this.subscriptionConfirmed = true;
            logger.info('🎉 Subscription confirmed - receiving ticks');
          }

          this.processTicks(ticks);
        }
      } catch (err) {
        logger.error('Binary message error:', err.message);
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
        if (offset + 2 > buffer.length) break;
        const packetLength = buffer.readUInt16BE(offset);
        offset += 2;
        if (offset + packetLength > buffer.length) break;

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

          tick.last_price = packet.readUInt32BE(4) / 100.0;

          if (packet.length >= 44) {
            tick.last_traded_quantity = packet.readUInt32BE(8);
            tick.average_traded_price = packet.readUInt32BE(12) / 100.0;
            tick.volume_traded = packet.readUInt32BE(16);
            tick.total_buy_quantity = packet.readUInt32BE(20);
            tick.total_sell_quantity = packet.readUInt32BE(24);
            tick.ohlc = {
              open: packet.readUInt32BE(28) / 100.0,
              high: packet.readUInt32BE(32) / 100.0,
              low: packet.readUInt32BE(36) / 100.0,
              close: packet.readUInt32BE(40) / 100.0
            };
            tick.change = tick.last_price - tick.ohlc.close;
          }

          if (packet.length >= 184) {
            tick.last_trade_time = packet.readUInt32BE(44);
            tick.oi = packet.readUInt32BE(48);
            tick.oi_day_high = packet.readUInt32BE(52);
            tick.oi_day_low = packet.readUInt32BE(56);
            tick.timestamp = packet.readUInt32BE(60);
            tick.depth = { buy: [], sell: [] };

            let depthOffset = 64;
            for (let j = 0; j < 5; j++) {
              tick.depth.buy.push({
                quantity: packet.readUInt32BE(depthOffset),
                price: packet.readUInt32BE(depthOffset + 4) / 100.0,
                orders: packet.readUInt16BE(depthOffset + 8)
              });
              depthOffset += 12;
            }

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
      logger.error('Parse error:', err.message);
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
          volume: tick.volume_traded,
          oi: tick.oi,
          buy_quantity: tick.total_buy_quantity,
          sell_quantity: tick.total_sell_quantity,
          last_trade_time: tick.last_trade_time,
          ohlc: tick.ohlc,
          depth: tick.depth,
          average_price: tick.average_traded_price,
          last_qty: tick.last_traded_quantity,
          timestamp: new Date()
        });
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
        return;
      }

      const data = fs.readFileSync(subsPath, 'utf8');
      const subscriptions = JSON.parse(data);

      if (subscriptions.length === 0) {
        logger.info('ℹ️ No stocks to subscribe');
        return;
      }

      const tokens = [];
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
        }
      });

      if (tokens.length > 0) {
        this.subscribedTokens = tokens;

        if (!this.isConnected) {
          throw new Error('WebSocket not connected');
        }

        // Subscribe
        const subscribeMsg = { a: "subscribe", v: tokens };
        this.ws.send(JSON.stringify(subscribeMsg));
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Set mode to FULL for complete market depth
        const modeMsg = { a: "mode", v: ["full", tokens] };
        this.ws.send(JSON.stringify(modeMsg));

        logger.info(`✅ Subscribed to ${tokens.length} stocks in FULL mode`);
        foundStocks.forEach(s => {
          logger.info(`  - ${s.symbol}`);
        });
      }
    } catch (error) {
      logger.error('❌ Error subscribing to stocks:', error);
      throw error;
    }
  }

  startDiscordUpdates() {
    this.updateInterval = setInterval(async () => {
      await this.updateDiscordMessage();
    }, 3000);
    logger.info('✅ Discord updates started (3s interval)');
  }

  async updateDiscordMessage() {
    try {
      if (!discordService.client || !discordService.client.isReady()) return;

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
      } else {
        await this.tickerMessage.edit(message);
      }
    } catch (error) {
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
      message += `⚠️ WebSocket disconnected\n`;
      return message;
    }

    if (this.stockData.size === 0) {
      message += `⏳ Waiting for market data...\n\n`;
      message += `📡 Connected ✅ | 🎫 ${this.tickCount} ticks\n`;
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
      
      // OHLC
      if (data.ohlc) {
        message += `   📊 O: ₹${data.ohlc.open.toFixed(2)} | H: ₹${data.ohlc.high.toFixed(2)} | L: ₹${data.ohlc.low.toFixed(2)}\n`;
      }
      
      // Volume and quantities
      message += `   📈 Vol: ${((data.volume || 0) / 100000).toFixed(2)}L | Avg: ₹${(data.average_price || 0).toFixed(2)}\n`;
      
      // Buy/Sell quantities
      const buyQty = ((data.buy_quantity || 0) / 1000).toFixed(1);
      const sellQty = ((data.sell_quantity || 0) / 1000).toFixed(1);
      message += `   🔵 Buy: ${buyQty}K | 🔴 Sell: ${sellQty}K\n`;
      
      // Market depth (best bid/ask)
      if (data.depth && data.depth.buy.length > 0 && data.depth.sell.length > 0) {
        const bestBid = data.depth.buy[0];
        const bestAsk = data.depth.sell[0];
        message += `   💰 Bid: ₹${bestBid.price.toFixed(2)} (${bestBid.quantity}) | Ask: ₹${bestAsk.price.toFixed(2)} (${bestAsk.quantity})\n`;
      }
      
      message += `\n`;
    });

    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📈 ${this.stockData.size} stocks | 🎫 ${this.tickCount} ticks | 💓 ${this.heartbeatCount} beats`;

    return message;
  }

  async addStock(symbol) {
    const instrument = this.instrumentsCache.get(symbol);
    if (!instrument) return false;
    if (this.subscribedTokens.includes(instrument.token)) return true;

    try {
      this.subscribedTokens.push(instrument.token);

      if (this.isConnected) {
        const subscribeMsg = { a: "subscribe", v: [instrument.token] };
        this.ws.send(JSON.stringify(subscribeMsg));
        await new Promise(resolve => setTimeout(resolve, 500));

        const modeMsg = { a: "mode", v: ["full", [instrument.token]] };
        this.ws.send(JSON.stringify(modeMsg));

        logger.info(`➕ Added ${symbol}`);
      }
      return true;
    } catch (error) {
      logger.error(`❌ Error adding ${symbol}:`, error);
      return false;
    }
  }

  async removeStock(symbol) {
    const instrument = this.instrumentsCache.get(symbol);
    if (!instrument) return false;

    const index = this.subscribedTokens.indexOf(instrument.token);
    if (index === -1) return true;

    try {
      this.subscribedTokens.splice(index, 1);
      if (this.isConnected) {
        const unsubscribeMsg = { a: "unsubscribe", v: [instrument.token] };
        this.ws.send(JSON.stringify(unsubscribeMsg));
      }
      this.stockData.delete(symbol);
      logger.info(`➖ Removed ${symbol}`);
      return true;
    } catch (error) {
      logger.error(`❌ Error removing ${symbol}:`, error);
      return false;
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    logger.info(`🔄 Reconnecting... Attempt ${this.reconnectAttempts}`);

    setTimeout(async () => {
      try {
        await this.connectWebSocket();
        await this.waitForConnection();
        await this.subscribeToStocks();
        logger.info('✅ Reconnected successfully');
      } catch (error) {
        logger.error('❌ Reconnection failed:', error.message);
      }
    }, this.reconnectDelay);
  }

  async restart() {
    logger.info('🔄 Restarting ticker service...');
    await this.stop();
    this.tickCount = 0;
    this.heartbeatCount = 0;
    this.lastTickTime = null;
    this.reconnectAttempts = 0;
    this.subscriptionConfirmed = false;
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.initialize();
    logger.info('✅ Ticker service restarted');
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
    this.subscriptionConfirmed = false;
    this.tickerMessage = null;
    this.stockData.clear();
  }

  getStatus() {
    return {
      connected: this.isConnected,
      subscriptionConfirmed: this.subscriptionConfirmed,
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
}

module.exports = new TickerService();