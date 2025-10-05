require('dotenv').config();
const discordService = require('./services/discord.service');
const zerodhaService = require('./services/zerodha.service');
const tradingService = require('./services/trading.service');
const scheduledAuth = require('./services/scheduled-auth.service');
const stockCommands = require('./commands/stock.commands');
const marketData = require('./services/market-data.service');
const logger = require('./utils/logger');

async function start() {
  try {
    logger.info('🚀 Starting Zerodha Trading Bot...');

    // Initialize Discord
    await discordService.initialize();
    logger.info('✅ Discord initialized');

    // Initialize Zerodha (will auto-login if needed)
    const connected = await zerodhaService.initialize();
    
    if (!connected) {
      logger.warn('⚠️ Initial connection failed, will retry with auto-login');
    }

    // Start scheduled auto-login (runs daily at 5:45 AM IST)
    scheduledAuth.start();
    logger.info('✅ Auto-login scheduler started');

    // Load stock subscriptions from file
    stockCommands.loadSubscriptions();
    logger.info('✅ Stock subscriptions loaded');

    // Start watching subscribed stocks (updates every 5 minutes)
    if (marketData.subscribedStocks.length > 0) {
      marketData.startWatching(300); // 5 minutes
      logger.info(`✅ Market data service started (${marketData.subscribedStocks.length} stocks)`);
    }

    // Start trading service
    await tradingService.start();
    logger.info('✅ Trading service started');

    await discordService.log(
      '🚀 **Trading Bot Started Successfully**\n' +
      `Mode: ${process.env.TRADING_MODE || 'paper'}\n` +
      `Auto-login: Enabled (5:45 AM IST daily)\n` +
      `Commands: Active (type !help)\n` +
      `Subscribed stocks: ${marketData.subscribedStocks.length}`,
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  
  // Stop market data watching
  marketData.stopWatching();
  
  await discordService.log('🛑 Bot shutting down gracefully', 'warning');
  
  // Wait a bit for Discord message to send
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

// Handle Ctrl+C
process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  
  // Stop market data watching
  marketData.stopWatching();
  
  await discordService.log('🛑 Bot stopped by user', 'warning');
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

start();