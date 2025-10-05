const KiteConnect = require('kiteconnect').KiteConnect;
const logger = require('../utils/logger');
const discordService = require('./discord.service');

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
      logger.info(`✅ Connected to Zerodha: ${profile.user_name}`);
      
      return true;
    } catch (error) {
      this.isConnected = false;
      
      if (error.message.includes('Invalid') || error.message.includes('expired')) {
        logger.error('❌ Access token expired or invalid');
        await this.handleTokenExpired();
      } else {
        logger.error('Zerodha connection error:', error);
      }
      
      return false;
    }
  }

  async handleTokenExpired() {
    const loginURL = this.kite.getLoginURL();
    
    logger.warn('⚠️ Token expired! Auto-login will attempt to refresh...');
    console.log('\n🔗 Manual Login URL (backup):\n', loginURL, '\n');
    
    await discordService.log(
      `⚠️ **ZERODHA TOKEN EXPIRED**\n\nAuto-login will attempt to refresh the token automatically.`,
      'warning'
    );
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