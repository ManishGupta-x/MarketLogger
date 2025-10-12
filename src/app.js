require('dotenv').config();
const discordService = require('./services/discord.service');
const zerodhaService = require('./services/zerodha.service');
const tokenTrackerService = require('./services/token-tracker.service');
const scheduledAuth = require('./services/scheduled-auth.service');
const logger = require('./utils/logger');

async function start() {
  try {
    logger.info('🚀 Starting Token Tracker Bot...');
    
    // Initialize Discord
    await discordService.initialize();
    logger.info('✅ Discord initialized');
    
    // Start scheduled authentication (will check and auto-login if needed)
    await scheduledAuth.start();
    logger.info('✅ Auto-login scheduler started');
    
    // Check if Zerodha is now connected (after potential auto-login)
    const connected = zerodhaService.isConnected;
    
    // Initialize Token Tracker Service if connected
    if (connected) {
      await tokenTrackerService.initialize();
      logger.info('✅ Token Tracker initialized');
    } else {
      logger.warn('⚠️ Token Tracker not started - Zerodha connection failed');
      logger.warn('⚠️ Please check auto-login logs above');
    }
    
    const trackerStatus = connected 
      ? '✅ Token Tracker: Active' 
      : '⏸️ Token Tracker: Waiting for connection';
    
    await discordService.log(
      '🚀 **Token Tracker Bot Started**\n' +
      `📊 Tokens to track: ${connected ? tokenTrackerService.tokens?.length || 0 : 'Unknown'}\n` +
      `Auto-login: Enabled (5:45 AM IST daily)\n` +
      trackerStatus,
      connected ? 'success' : 'warning'
    );
    
  } catch (error) {
    logger.error('Failed to start application:', error);
    await discordService.log(
      `❌ **Bot Startup Failed**\n${error.message}`,
      'error'
    );
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  
  await tokenTrackerService.stop();
  
  await discordService.log('🛑 Token Tracker shutting down gracefully', 'warning');
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on('unhandledRejection', async (error) => {
  logger.error('Unhandled rejection:', error);
  await discordService.log(
    `❌ **Unhandled Error**\n${error.message}`,
    'error'
  );
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  
  await tokenTrackerService.stop();
  
  await discordService.log('🛑 Token Tracker stopped by user', 'warning');
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

start();