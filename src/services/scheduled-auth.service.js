const cron = require('node-cron');
const AutoLogin = require('../auth/auto-login');
const discordService = require('./discord.service');
const zerodhaService = require('./zerodha.service');
const logger = require('../utils/logger');

class ScheduledAuth {
  constructor() {
    this.autoLogin = new AutoLogin();
  }

  start() {
    // Schedule daily login at 5:45 AM IST (before 6 AM expiry)
    cron.schedule('45 0 * * *', async () => {
      await this.performAutoLogin();
    }, {
      timezone: 'Asia/Kolkata'
    });

    // Also check on startup
    this.checkAndRefreshOnStartup();

    logger.info('📅 Scheduled auto-login enabled (5:45 AM IST daily)');
  }

  async checkAndRefreshOnStartup() {
    try {
      const isValid = await zerodhaService.initialize();
      
      if (!isValid) {
        logger.info('🔄 Token invalid on startup, performing auto-login...');
        await this.performAutoLogin();
      }
    } catch (error) {
      logger.error('Startup token check failed:', error);
    }
  }

  async performAutoLogin() {
    logger.info('⏰ Auto-login triggered');
    
    try {
      await discordService.log(
        '⏰ **Automated Token Refresh Started**\nTime: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        'info'
      );

      const result = await this.autoLogin.login();

      if (result.success) {
        logger.info(`✅ Auto-login successful (${result.duration}s)`);
        
        await discordService.log(
          `✅ **Token Refreshed Successfully**\n` +
          `Duration: ${result.duration}s\n` +
          `Valid until: Tomorrow 6:00 AM IST`,
          'success'
        );

        await zerodhaService.initialize();
        logger.info('🔄 Zerodha service reconnected');

      } else {
        logger.error('❌ Auto-login failed:', result.error);
        
        await discordService.log(
          `❌ **Token Refresh Failed**\n` +
          `Error: ${result.error}\n` +
          `⚠️ Manual intervention required!`,
          'error'
        );
      }

    } catch (error) {
      logger.error('Auto-login crashed:', error);
      
      await discordService.log(
        `❌ **Auto-Login Crashed**\n${error.message}`,
        'error'
      );
    }
  }
}

module.exports = new ScheduledAuth();