const cron = require('node-cron');
const AutoLogin = require('../auth/auto-login');
const zerodhaService = require('./zerodha.service');
const logger = require('../utils/logger');

class ScheduledAuth {
  constructor() {
    this.autoLogin = new AutoLogin();
  }

  async start() {
    // Schedule daily login at 5:45 AM IST (before 6 AM expiry)
    cron.schedule('45 5 * * *', async () => {
      await this.performAutoLogin();
    }, {
      timezone: 'Asia/Kolkata'
    });

    logger.info('Scheduled auto-login enabled (5:45 AM IST daily)');

    // Check on startup and refresh if needed
    await this.checkAndRefreshOnStartup();
  }

  async checkAndRefreshOnStartup() {
    try {
      logger.info('Checking token validity on startup...');
      const isValid = await zerodhaService.initialize();

      if (!isValid) {
        logger.info('Token invalid on startup, performing auto-login...');
        await this.performAutoLogin();
      } else {
        logger.info('Token is valid, no refresh needed');
      }
    } catch (error) {
      logger.error('Startup token check failed:', error);
    }
  }

  async performAutoLogin() {
    logger.info('Auto-login triggered');

    try {
      const result = await this.autoLogin.login();

      if (result.success) {
        logger.info(`Auto-login successful (${result.duration}s)`);

        // Reinitialize Zerodha service
        await zerodhaService.initialize();
        logger.info('Zerodha service reconnected');
      } else {
        logger.error('Auto-login failed:', result.error);
      }
    } catch (error) {
      logger.error('Auto-login crashed:', error);
    }
  }
}

module.exports = new ScheduledAuth();
