const cron = require('node-cron');
const axios = require('axios');
const AutoLogin = require('./auto-login');
const zerodha = require('./zerodha');
const logger = require('../../utils/logger');

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || '';

class Scheduler {
  constructor() {
    this.autoLogin = new AutoLogin();
  }

  async start() {
    // 8:00 AM IST Mon-Fri — auto-login
    cron.schedule('0 8 * * 1-5', async () => {
      logger.info('=== 8:00 AM scheduled login ===');
      await this._doLogin();
    }, { timezone: 'Asia/Kolkata' });

    logger.info('Scheduler started: login at 8:00 AM IST, Mon-Fri');
    await this._startupCheck();
  }

  async _startupCheck() {
    try {
      logger.info('Startup: checking token validity...');
      const valid = await zerodha.initialize();
      if (!valid) {
        logger.info('Token invalid, performing auto-login...');
        await this._doLogin();
      }
    } catch (err) {
      logger.error('Startup check failed:', err.message);
    }
  }

  async _doLogin() {
    try {
      const result = await this.autoLogin.login();
      if (result.success) {
        zerodha.setAccessToken(result.accessToken);
        await zerodha.initialize();
        await this._discord(`**Login succeeded** in ${result.duration}s`);
        return true;
      } else {
        await this._discord(`**Login Failed** — ${result.error}`, false);
        return false;
      }
    } catch (err) {
      await this._discord(`**Login Crashed** — ${err.message}`, false);
      return false;
    }
  }

  async _discord(msg, success = true) {
    if (!DISCORD_WEBHOOK) return;
    try {
      await axios.post(DISCORD_WEBHOOK, {
        embeds: [{
          title: success ? '✅ MarketLogger' : '❌ MarketLogger',
          description: msg, color: success ? 0x00ff00 : 0xff0000,
          timestamp: new Date().toISOString(), footer: { text: 'MarketLogger' }
        }]
      });
    } catch (e) { logger.error('Discord notify failed:', e.message); }
  }

  // Manual trigger
  async triggerLogin() { await this._doLogin(); }
}

module.exports = new Scheduler();
