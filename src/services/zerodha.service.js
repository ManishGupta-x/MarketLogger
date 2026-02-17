const KiteConnect = require('kiteconnect').KiteConnect;
const logger = require('../utils/logger');

class ZerodhaService {
  constructor() {
    this.kite = new KiteConnect({
      api_key: process.env.ZERODHA_API_KEY
    });
    this.isConnected = false;
  }

  async initialize() {
    try {
      this.kite.setAccessToken(process.env.ZERODHA_ACCESS_TOKEN);

      // Test connection
      const profile = await this.kite.getProfile();
      this.isConnected = true;
      logger.info(`Connected to Zerodha: ${profile.user_name}`);

      return true;
    } catch (error) {
      this.isConnected = false;

      if (error.message.includes('Invalid') || error.message.includes('expired')) {
        logger.error('Access token expired or invalid');
        const loginURL = this.kite.getLoginURL();
        logger.warn('Token expired! Auto-login will attempt to refresh...');
        console.log('\nManual Login URL (backup):\n', loginURL, '\n');
      } else {
        logger.error('Zerodha connection error:', error);
      }

      return false;
    }
  }

  async getPositions() {
    if (!this.isConnected) return null;
    return await this.kite.getPositions();
  }

  async getOrders() {
    if (!this.isConnected) return null;
    return await this.kite.getOrders();
  }

  async placeOrder(params) {
    if (!this.isConnected) return null;
    return await this.kite.placeOrder('regular', params);
  }
}

module.exports = new ZerodhaService();
