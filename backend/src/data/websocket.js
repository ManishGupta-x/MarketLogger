const WebSocket = require('ws');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const config = require('../../config');

/**
 * Zerodha KiteConnect binary WebSocket.
 * Calls onTick(ticks[]) for every market update.
 */
class ZerodhaWebSocket {
  constructor() {
    this.ws = null;
    this.tokens = [];
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.onTick = null;
  }

  async start(onTick) {
    this.onTick = onTick;
    await this._loadTokens();
    await this._connect();
    await this._waitForConnection();
    await this._subscribe();
    logger.info('WebSocket service started');
  }

  async _loadTokens() {
    const tokenPath = path.join(__dirname, '../../data/token.json');
    if (!fs.existsSync(tokenPath)) throw new Error('token.json not found at ' + tokenPath);

    const raw = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    this.tokens = raw.map(t => typeof t === 'string' ? parseInt(t) : t);

    // Ensure index tokens are included for regime detection
    const { nifty50Token, niftyBankToken } = config.regime;
    if (!this.tokens.includes(nifty50Token)) this.tokens.push(nifty50Token);
    if (!this.tokens.includes(niftyBankToken)) this.tokens.push(niftyBankToken);

    logger.info(`Loaded ${this.tokens.length} tokens`);
  }

  async _connect() {
    return new Promise((resolve, reject) => {
      const apiKey = process.env.ZERODHA_API_KEY;
      const accessToken = process.env.ZERODHA_ACCESS_TOKEN;
      if (!apiKey || !accessToken) {
        reject(new Error('Missing ZERODHA_API_KEY or ZERODHA_ACCESS_TOKEN'));
        return;
      }

      this.ws = new WebSocket(`wss://ws.kite.trade?api_key=${apiKey}&access_token=${accessToken}`);

      const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        logger.info('WebSocket connected');
        resolve();
      });

      this.ws.on('close', code => {
        logger.warn(`WebSocket closed (code ${code})`);
        this.isConnected = false;
        this._scheduleReconnect();
      });

      this.ws.on('error', err => {
        logger.error('WebSocket error:', err.message);
        this.isConnected = false;
      });

      this.ws.on('message', data => this._handleMessage(data));
    });
  }

  async _waitForConnection() {
    return new Promise(resolve => {
      if (this.isConnected) return resolve();
      const id = setInterval(() => { if (this.isConnected) { clearInterval(id); resolve(); } }, 100);
      setTimeout(() => { clearInterval(id); resolve(); }, 5000);
    });
  }

  async _subscribe() {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(JSON.stringify({ a: 'subscribe', v: this.tokens }));
    setTimeout(() => {
      if (this.isConnected && this.ws) {
        this.ws.send(JSON.stringify({ a: 'mode', v: ['quote', this.tokens] }));
        logger.info(`Subscribed to ${this.tokens.length} tokens in quote mode`);
      }
    }, 1000);
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached');
      return;
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    logger.info(`Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    setTimeout(async () => {
      try {
        await this._connect();
        await this._subscribe();
        logger.info('Reconnected');
      } catch (err) {
        logger.error('Reconnection failed:', err.message);
      }
    }, delay);
  }

  _handleMessage(message) {
    if (typeof message === 'string') return;
    if (!Buffer.isBuffer(message)) return;
    if (message.length === 1 && message[0] === 0x00) return; // heartbeat

    try {
      let data = message;
      if (message.length >= 2 && message[0] === 0x78 &&
          (message[1] === 0x9c || message[1] === 0x01 || message[1] === 0xda)) {
        data = zlib.inflateSync(message);
      }
      const ticks = this._parseTicks(data);
      if (ticks.length > 0 && this.onTick) this.onTick(ticks);
    } catch (err) {
      logger.error('Message parse error:', err.message);
    }
  }

  _parseTicks(buffer) {
    const packets = [];
    let offset = 0;
    try {
      if (buffer.length < 2) return packets;
      const count = buffer.readUInt16BE(offset); offset += 2;
      for (let i = 0; i < count; i++) {
        if (offset + 2 > buffer.length) break;
        const len = buffer.readUInt16BE(offset); offset += 2;
        if (offset + len > buffer.length) break;
        const pkt = buffer.slice(offset, offset + len); offset += len;
        if (pkt.length < 8) continue;

        const tick = {
          instrument_token: pkt.readUInt32BE(0),
          last_price: pkt.readUInt32BE(4) / 100.0
        };

        if (pkt.length >= 44) {
          tick.last_traded_quantity  = pkt.readUInt32BE(8);
          tick.average_traded_price  = pkt.readUInt32BE(12) / 100.0;
          tick.volume_traded         = pkt.readUInt32BE(16);
          tick.total_buy_quantity    = pkt.readUInt32BE(20);
          tick.total_sell_quantity   = pkt.readUInt32BE(24);
          tick.ohlc = {
            open:  pkt.readUInt32BE(28) / 100.0,
            high:  pkt.readUInt32BE(32) / 100.0,
            low:   pkt.readUInt32BE(36) / 100.0,
            close: pkt.readUInt32BE(40) / 100.0
          };
          tick.change = tick.last_price - tick.ohlc.close;
        }

        packets.push(tick);
      }
    } catch (err) {
      logger.error('Tick parsing error:', err.message);
    }
    return packets;
  }

  getStatus() {
    return { connected: this.isConnected, tokens: this.tokens.length, reconnectAttempts: this.reconnectAttempts };
  }

  stop() {
    if (this.ws) { this.ws.close(); this.isConnected = false; logger.info('WebSocket stopped'); }
  }

  // Allow re-subscribing after token refresh
  async reconnectWithNewToken() {
    if (this.ws) { this.ws.close(); }
    this.reconnectAttempts = 0;
    await this._connect();
    await this._waitForConnection();
    await this._subscribe();
    logger.info('WebSocket reconnected with new token');
  }
}

module.exports = new ZerodhaWebSocket();
