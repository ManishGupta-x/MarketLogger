require('dotenv').config();
const discordService = require('./services/discord.service');
const zerodhaService = require('./services/zerodha.service');
const tokenTrackerService = require('./services/token-tracker.service');
const logger = require('./utils/logger');

async function start() {
  try {
    logger.info('🚀 Starting Token Tracker Bot...');
    
    // Initialize Discord
    await discordService.initialize();
    logger.info('✅ Discord initialized');
    
    // Initialize Zerodha
    const connected = await zerodhaService.initialize();
    
    if (!connected) {
      logger.error('❌ Zerodha connection failed');
      await discordService.log(
        '❌ **Zerodha Connection Failed**\nCannot start tracker without valid connection',
        'error'
      );
      process.exit(1);
    }
    
    logger.info('✅ Zerodha connected');
    
    // Initialize Token Tracker Service
    await tokenTrackerService.initialize();
    logger.info('✅ Token Tracker initialized');
    
    const status = tokenTrackerService.getStatus();
    await discordService.log(
      '🚀 **Token Tracker Started Successfully**\n' +
      `📊 Tracking: ${status.subscribedTokens} stocks\n` +
      `📡 WebSocket: ${status.connected ? 'Connected' : 'Disconnected'}\n` +
      `🔔 Alerts: Enabled\n` +
      `⏰ Update Interval: 3 seconds`,
      'success'
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