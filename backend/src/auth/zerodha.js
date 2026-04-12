const KiteConnect = require('kiteconnect').KiteConnect;
const logger = require('../../utils/logger');

class ZerodhaAuth {
  constructor() {
    this.kite = new KiteConnect({ api_key: process.env.ZERODHA_API_KEY });
    this.isConnected = false;
  }

  async initialize() {
    try {
      this.kite.setAccessToken(process.env.ZERODHA_ACCESS_TOKEN);
      const profile = await this.kite.getProfile();
      this.isConnected = true;
      logger.info(`Connected to Zerodha: ${profile.user_name}`);
      return true;
    } catch (err) {
      this.isConnected = false;
      if (err.message && (err.message.includes('Invalid') || err.message.includes('expired'))) {
        logger.error('Zerodha access token expired');
        logger.warn('Manual Login URL: ' + this.kite.getLoginURL());
      } else {
        logger.error('Zerodha connect error:', err.message);
      }
      return false;
    }
  }

  setAccessToken(token) {
    this.kite.setAccessToken(token);
    process.env.ZERODHA_ACCESS_TOKEN = token;
  }
}

module.exports = new ZerodhaAuth();
