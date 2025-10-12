const cron = require('node-cron');
const AutoLogin = require('../auth/auto-login');
const discordService = require('./discord.service');
const zerodhaService = require('./zerodha.service');
const logger = require('../utils/logger');

class ScheduledAuth {
  constructor() {
    this.autoLogin = new AutoLogin();
    this.tokenTrackerService = null;
  }

  getTokenTrackerService() {
    if (!this.tokenTrackerService) {
      try {
        this.tokenTrackerService = require('./token-tracker.service');
      } catch (error) {
        logger.warn('Token Tracker service not available');
      }
    }
    return this.tokenTrackerService;
  }

  async start() {
    // Schedule daily login at 5:45 AM IST (before 6 AM expiry)
    cron.schedule('45 0 * * *', async () => {
      await this.performAutoLogin();
    }, {
      timezone: 'Asia/Kolkata'
    });

    logger.info('📅 Scheduled auto-login enabled (5:45 AM IST daily)');
    
    // Check on startup and refresh if needed
    await this.checkAndRefreshOnStartup();
  }

  async checkAndRefreshOnStartup() {
    try {
      logger.info('🔍 Checking token validity on startup...');
      const isValid = await zerodhaService.initialize();
      
      if (!isValid) {
        logger.info('🔄 Token invalid on startup, performing auto-login...');
        await this.performAutoLogin();
        
        // After successful login, try to start the tracker
        const tracker = this.getTokenTrackerService();
        if (tracker && !tracker.isConnected) {
          logger.info('🚀 Starting Token Tracker after auto-login...');
          try {
            await tracker.initialize();
            logger.info('✅ Token Tracker started successfully');
          } catch (error) {
            logger.error('❌ Failed to start Token Tracker:', error);
          }
        }
      } else {
        logger.info('✅ Token is valid, no refresh needed');
      }
    } catch (error) {
      logger.error('❌ Startup token check failed:', error);
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

        // Reinitialize Zerodha service
        await zerodhaService.initialize();
        logger.info('🔄 Zerodha service reconnected');

        // Restart token tracker service with new token
        const tracker = this.getTokenTrackerService();
        if (tracker) {
          logger.info('🔄 Restarting Token Tracker service with new token...');
          
          try {
            await tracker.stop();
            await new Promise(resolve => setTimeout(resolve, 2000));
            await tracker.initialize();
            
            await discordService.log(
              `📊 **Token Tracker Restarted**\n` +
              `WebSocket reconnected with new token\n` +
              `Tracking ${tracker.tokens?.length || 0} stocks`,
              'success'
            );
            
            logger.info('✅ Token Tracker service restarted successfully');
          } catch (trackerError) {
            logger.error('❌ Token Tracker restart failed:', trackerError);
            
            await discordService.log(
              `⚠️ **Token Tracker Restart Failed**\n` +
              `Error: ${trackerError.message}\n` +
              `You may need to restart the bot`,
              'warning'
            );
          }
        } else {
          logger.warn('⚠️ Token Tracker service not available for restart');
        }

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
      logger.error('❌ Auto-login crashed:', error);
      
      await discordService.log(
        `❌ **Auto-Login Crashed**\n${error.message}`,
        'error'
      );
    }
  }
}

module.exports = new ScheduledAuth();