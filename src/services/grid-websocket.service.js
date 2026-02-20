const WebSocket = require('ws');
const zlib = require('zlib');
const zerodhaService = require('./zerodha.service');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const adaptiveConfig = require('../config/adaptive-config');

class GridWebSocketService {
  constructor() {
    this.ws = null;
    this.tokens = [];
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.tickCallback = null;
  }

  async initialize(tickCallback) {
    logger.info('🔧 Initializing Grid WebSocket Service...');

    this.tickCallback = tickCallback;

    try {
      await this.loadTokens();
      await this.connectWebSocket();
      await this.waitForConnection();
      await this.subscribeToTokens();

      logger.info('✅ Grid WebSocket Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize grid websocket:', error);
      throw error;
    }
  }

  async loadTokens() {
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

      // Add NIFTY 50 and NIFTY Bank tokens for regime detection
      const nifty50Token = adaptiveConfig.regime.nifty50Token;
      const niftyBankToken = adaptiveConfig.regime.niftyBankToken;

      if (!this.tokens.includes(nifty50Token)) {
        this.tokens.push(nifty50Token);
        logger.info(`📊 Added NIFTY 50 token (${nifty50Token}) for regime detection`);
      }

      if (!this.tokens.includes(niftyBankToken)) {
        this.tokens.push(niftyBankToken);
        logger.info(`📊 Added NIFTY Bank token (${niftyBankToken}) for regime detection`);
      }

      logger.info(`📥 Loaded ${this.tokens.length} tokens (including index tokens for regime detection)`);
    } catch (error) {
      logger.error('❌ Error loading tokens:', error);
      throw error;
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

      this.ws.on('close', (code) => {
        logger.warn(`⚠️ WebSocket closed with code ${code}`);
        this.isConnected = false;
        this.handleReconnect();
      });

      this.ws.on('error', (error) => {
        logger.error('❌ WebSocket error:', error.message);
        this.isConnected = false;
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });
    });
  }

  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('❌ Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    logger.info(`🔄 Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.connectWebSocket();
        await this.subscribeToTokens();
        logger.info('✅ Reconnected successfully');
      } catch (error) {
        logger.error('❌ Reconnection failed:', error.message);
      }
    }, delay);
  }

  async subscribeToTokens() {
    if (!this.isConnected || !this.ws) {
      logger.warn('⚠️ Cannot subscribe - not connected');
      return;
    }

    // Subscribe to tokens
    const subscribeMessage = {
      a: 'subscribe',
      v: this.tokens
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    logger.info(`📡 Subscribed to ${this.tokens.length} tokens`);

    // Wait a bit, then set mode to quote
    setTimeout(() => {
      if (this.isConnected && this.ws) {
        const modeMessage = {
          a: 'mode',
          v: ['quote', this.tokens]
        };
        this.ws.send(JSON.stringify(modeMessage));
        logger.info(`⚙️ Set mode to quote`);
      }
    }, 1000);
  }

  handleMessage(message) {
    if (typeof message === 'string') {
      // JSON message (connection confirmation, etc.)
      return;
    }

    if (Buffer.isBuffer(message)) {
      // Heartbeat
      if (message.length === 1 && message[0] === 0x00) {
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
        if (ticks.length > 0 && this.tickCallback) {
          this.tickCallback(ticks);
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
            last_price: packet.readUInt32BE(4) / 100.0
          };

          // Add additional data if available (quote mode)
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
    } catch (err) {
      logger.error('Tick parsing error:', err.message);
    }

    return packets;
  }

  getStatus() {
    return {
      connected: this.isConnected,
      tokens: this.tokens.length,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  async stop() {
    if (this.ws) {
      this.ws.close();
      this.isConnected = false;
      logger.info('🛑 Grid WebSocket stopped');
    }
  }
}

module.exports = new GridWebSocketService();
