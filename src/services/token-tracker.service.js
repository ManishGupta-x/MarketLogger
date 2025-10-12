const WebSocket = require('ws');
const zlib = require('zlib');
const zerodhaService = require('./zerodha.service');
const discordService = require('./discord.service');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class TokenTrackerService {
  constructor() {
    this.ws = null;
    this.tokens = [];
    this.stockData = new Map();
    this.previousData = new Map();
    this.messageMap = new Map(); // Map to store token -> messageId mapping
    this.discordMessages = new Map(); // Map to store messageId -> Discord Message object
    this.updateInterval = null;
    this.isConnected = false;
    this.trackerChannelId = '1426943221082095729';
    this.alertChannelId = '1426943248672489484';
    this.tokenToSymbolMap = new Map();
    this.lastTickTime = null;
    this.tickCount = 0;
    this.heartbeatCount = 0;
    this.textMessageCount = 0;
    this.STOCKS_PER_MESSAGE = 50;
    
    // Alert thresholds
    this.CRASH_THRESHOLD = -3;
    this.SPIKE_THRESHOLD = 3;
    this.VOLUME_SPIKE = 2;
    this.TIME_WINDOW = 300000;
  }

  async initialize() {
    logger.info('🔧 Initializing Token Tracker Service...');

    try {
      await this.waitForDiscordReady();
      await this.loadExistingMessages(); // Load existing messages from channel
      await this.loadTokensAndInstruments();
      await this.connectWebSocket();
      await this.waitForConnection();
      await this.subscribeToTokens();

      setTimeout(() => {
        this.startDiscordUpdates();
      }, 2000);

      logger.info('✅ Token Tracker service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize token tracker:', error);
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

  async loadExistingMessages() {
    try {
      const trackerChannel = discordService.client.channels.cache.get(this.trackerChannelId);
      if (!trackerChannel) {
        logger.warn('⚠️ Tracker channel not found, will create new messages');
        return;
      }

      logger.info('🔍 Fetching existing messages from channel...');
      
      // Fetch last 100 messages from the channel
      const messages = await trackerChannel.messages.fetch({ limit: 100 });
      
      // Filter messages sent by this bot that match our format
      const botMessages = messages.filter(msg => 
        msg.author.id === discordService.client.user.id && 
        msg.content.includes('📊 LIVE TRACKER') &&
        msg.content.startsWith('```')
      );

      // Sort by timestamp (oldest first)
      const sortedMessages = Array.from(botMessages.values()).sort((a, b) => 
        a.createdTimestamp - b.createdTimestamp
      );

      // Map them to chunks
      sortedMessages.forEach((msg, index) => {
        const chunkKey = `chunk_${index}`;
        this.discordMessages.set(chunkKey, msg);
        logger.info(`✅ Loaded existing message for ${chunkKey}`);
      });

      logger.info(`✅ Loaded ${this.discordMessages.size} existing messages`);
    } catch (error) {
      logger.error('❌ Failed to load existing messages:', error);
      logger.info('Will create new messages instead');
    }
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

  async loadTokensAndInstruments() {
    try {
      // Check for Railway volume first, fallback to local
      let tokenPath = '/app/data/token.json';
      if (!fs.existsSync(tokenPath)) {
        tokenPath = path.join(__dirname, '../../token.json');
      }
      
      if (!fs.existsSync(tokenPath)) {
        throw new Error('token.json not found');
      }

      const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      
      this.tokens = tokenData.map(token => {
        const numToken = typeof token === 'string' ? parseInt(token) : token;
        return numToken;
      });

      logger.info(`📥 Loaded ${this.tokens.length} tokens from token.json`);

      logger.info('📥 Loading NSE instruments...');
      const instruments = await zerodhaService.kite.getInstruments('NSE');

      instruments.forEach(inst => {
        const token = typeof inst.instrument_token === 'number' 
          ? inst.instrument_token 
          : parseInt(inst.instrument_token);
        
        if (this.tokens.includes(token)) {
          this.tokenToSymbolMap.set(token, {
            symbol: inst.tradingsymbol,
            name: inst.name || inst.tradingsymbol
          });
        }
      });

      logger.info(`✅ Mapped ${this.tokenToSymbolMap.size}/${this.tokens.length} tokens to symbols`);
    } catch (error) {
      logger.error('❌ Error loading tokens:', error);
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
        resolve();
      });

      this.ws.on('message', (message) => {
        this.handleMessage(message);
      });

      this.ws.on('close', () => {
        logger.warn('⚠️ WebSocket disconnected');
        this.isConnected = false;
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
      if (message.length > 0 && message[0] === 0x7b) {
        try {
          const text = message.toString('utf8');
          const parsed = JSON.parse(text);
          this.textMessageCount++;
          
          if (parsed.type === 'error') {
            logger.error('Subscription error:', parsed.data);
          }
          return;
        } catch (err) {
          // Not valid JSON, continue to binary parsing
        }
      }

      if (message.length === 1 && message[0] === 0x00) {
        this.heartbeatCount++;
        return;
      }

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
          this.processTicks(ticks);
        }
      } catch (err) {
        logger.error('⚠️ Binary message error:', err.message);
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

          packets.push(tick);
        }
      }
      return packets;
    } catch (err) {
      logger.error('❌ Parse error:', err.message);
      return packets;
    }
  }

  processTicks(ticks) {
    ticks.forEach(tick => {
      const symbolData = this.tokenToSymbolMap.get(tick.instrument_token);
      if (symbolData) {
        const previousPrice = this.stockData.get(tick.instrument_token);
        
        const newData = {
          symbol: symbolData.symbol,
          name: symbolData.name,
          last_price: tick.last_price,
          change: tick.change,
          volume: tick.volume_traded,
          ohlc: tick.ohlc,
          timestamp: new Date()
        };

        this.stockData.set(tick.instrument_token, newData);

        if (previousPrice) {
          this.checkForAlerts(tick.instrument_token, previousPrice, newData);
        }
      }
    });
  }

  async checkForAlerts(token, oldData, newData) {
    const timeDiff = newData.timestamp - oldData.timestamp;
    
    if (timeDiff > this.TIME_WINDOW) {
      return;
    }

    const priceChange = ((newData.last_price - oldData.last_price) / oldData.last_price) * 100;
    
    if (priceChange <= this.CRASH_THRESHOLD) {
      await this.sendAlert('CRASH', newData, priceChange, timeDiff);
    }
    
    if (priceChange >= this.SPIKE_THRESHOLD) {
      await this.sendAlert('SPIKE', newData, priceChange, timeDiff);
    }

    if (oldData.volume && newData.volume) {
      const volumeRatio = newData.volume / oldData.volume;
      if (volumeRatio >= this.VOLUME_SPIKE) {
        await this.sendAlert('VOLUME_SPIKE', newData, priceChange, timeDiff, volumeRatio);
      }
    }
  }

  async sendAlert(type, data, priceChange, timeDiff, volumeRatio = null) {
    try {
      const alertChannel = discordService.client.channels.cache.get(this.alertChannelId);
      if (!alertChannel) return;

      const timeMinutes = Math.floor(timeDiff / 60000);
      let message = '';

      if (type === 'CRASH') {
        message = `🚨 CRASH ALERT\n${data.name}\n₹${data.last_price.toFixed(2)}\n${priceChange.toFixed(2)}% in ${timeMinutes}m`;
      } else if (type === 'SPIKE') {
        message = `🚀 SPIKE ALERT\n${data.name}\n₹${data.last_price.toFixed(2)}\n+${priceChange.toFixed(2)}% in ${timeMinutes}m`;
      } else if (type === 'VOLUME_SPIKE') {
        message = `📊 VOLUME SPIKE\n${data.name}\n₹${data.last_price.toFixed(2)}\n${volumeRatio.toFixed(1)}x volume increase`;
      }

      await alertChannel.send(message);
      logger.info(`🔔 Alert sent: ${type} - ${data.symbol}`);
    } catch (error) {
      logger.error('Failed to send alert:', error);
    }
  }

  async subscribeToTokens() {
    try {
      if (this.tokens.length === 0) {
        logger.warn('⚠️ No tokens to subscribe');
        return;
      }

      if (!this.isConnected) {
        throw new Error('WebSocket not connected');
      }

      const subscribeMsg = { a: "subscribe", v: this.tokens };
      this.ws.send(JSON.stringify(subscribeMsg));
      logger.info(`📡 Subscribed to ${this.tokens.length} tokens`);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const modeMsg = { a: "mode", v: ["quote", this.tokens] };
      this.ws.send(JSON.stringify(modeMsg));
      logger.info(`⚙️ Set mode to quote`);

      logger.info(`✅ Subscribed to ${this.tokens.length} tokens in QUOTE mode`);
    } catch (error) {
      logger.error('❌ Error subscribing to tokens:', error);
      throw error;
    }
  }

  startDiscordUpdates() {
    this.updateInterval = setInterval(async () => {
      await this.updateDiscordMessages();
    }, 3000);
    logger.info('✅ Discord updates started (3s interval)');
  }

  async updateDiscordMessages() {
    try {
      if (!discordService.client || !discordService.client.isReady()) {
        return;
      }

      const trackerChannel = discordService.client.channels.cache.get(this.trackerChannelId);
      if (!trackerChannel) {
        logger.error(`❌ Tracker channel not found: ${this.trackerChannelId}`);
        return;
      }

      if (this.stockData.size === 0) {
        return;
      }

      // Sort by token order
      const sortedData = Array.from(this.stockData.entries()).sort((a, b) => {
        return this.tokens.indexOf(a[0]) - this.tokens.indexOf(b[0]);
      });

      // Split into chunks of 50
      const chunks = [];
      for (let i = 0; i < sortedData.length; i += this.STOCKS_PER_MESSAGE) {
        chunks.push(sortedData.slice(i, i + this.STOCKS_PER_MESSAGE));
      }

      const timestamp = new Date().toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false
      });

      // Process each chunk
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const chunkKey = `chunk_${chunkIndex}`;

        let content = '```\n';
        content += `📊 LIVE TRACKER ${chunkIndex + 1}/${chunks.length} | ${timestamp} IST\n`;
        content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        chunk.forEach(([token, data]) => {
          const globalIndex = sortedData.findIndex(([t]) => t === token) + 1;
          const change = data.change || 0;
          const changePercent = data.ohlc ? ((change / data.ohlc.close) * 100).toFixed(2) : '0.00';
          const changeStr = change >= 0 ? `+${changePercent}%` : `${changePercent}%`;
          const volumeStr = ((data.volume || 0) / 100000).toFixed(2);

          content += `${globalIndex}.${data.name} : ${data.last_price.toFixed(2)} (${changeStr}) {${volumeStr}L}\n`;
        });

        if (chunkIndex === chunks.length - 1) {
          content += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          content += `📈 Total: ${this.stockData.size} stocks | 🎫 ${this.tickCount} ticks\n`;
        }

        content += '```';

        // Check if we have a message for this chunk
        if (!this.discordMessages.has(chunkKey)) {
          // Create new message
          const sentMsg = await trackerChannel.send(content);
          this.discordMessages.set(chunkKey, sentMsg);
          logger.info(`✅ Created message for chunk ${chunkIndex + 1}`);
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          // Edit existing message
          const existingMsg = this.discordMessages.get(chunkKey);
          try {
            await existingMsg.edit(content);
          } catch (err) {
            logger.error(`Failed to edit chunk ${chunkIndex}:`, err.message);
            // If edit fails, recreate message
            this.discordMessages.delete(chunkKey);
          }
        }
      }
    } catch (error) {
      logger.error('❌ Failed to update Discord messages:', error);
    }
  }

  async stop() {
    logger.info('🛑 Stopping token tracker service...');
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.ws && this.isConnected) {
      this.ws.close();
    }
    this.isConnected = false;
    this.discordMessages.clear();
    this.messageMap.clear();
    this.stockData.clear();
  }

  getStatus() {
    return {
      connected: this.isConnected,
      subscribedTokens: this.tokens.length,
      stocksWithData: this.stockData.size,
      totalTicks: this.tickCount,
      heartbeats: this.heartbeatCount,
      textMessages: this.textMessageCount,
      lastTick: this.lastTickTime,
      trackerChannelId: this.trackerChannelId,
      alertChannelId: this.alertChannelId,
      messagesCreated: this.discordMessages.size
    };
  }
}

module.exports = new TokenTrackerService();