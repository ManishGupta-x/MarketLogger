require('dotenv').config();
const discordService = require('./services/discord.service');
const zerodhaService = require('./services/zerodha.service');
const tickerService = require('./services/ticker.service');
const tradingService = require('./services/trading.service');
const scheduledAuth = require('./services/scheduled-auth.service');
const stockCommands = require('./commands/stock.commands');
const marketData = require('./services/market-data.service');
const logger = require('./utils/logger');

async function start() {
  try {
    logger.info('🚀 Starting Zerodha Trading Bot...');

    await discordService.initialize();
    logger.info('✅ Discord initialized');

    const connected = await zerodhaService.initialize();
    
    if (!connected) {
      logger.warn('⚠️ Initial connection failed, will retry with auto-login');
    }

    scheduledAuth.start();
    logger.info('✅ Auto-login scheduler started');

    stockCommands.loadSubscriptions();
    logger.info('✅ Stock subscriptions loaded');

    if (connected && marketData.subscribedStocks.length > 0) {
      await tickerService.initialize();
      logger.info('✅ WebSocket ticker started');
    } else if (!connected) {
      logger.warn('⚠️ Ticker not started - waiting for Zerodha connection');
    } else {
      logger.info('ℹ️ No subscribed stocks - ticker will start after first subscription');
    }

    await tradingService.start();
    logger.info('✅ Trading service started');

    const tickerStatus = connected && marketData.subscribedStocks.length > 0 
      ? '✅ WebSocket ticker: Active' 
      : '⏸️ WebSocket ticker: Waiting';

    await discordService.log(
      '🚀 **Trading Bot Started Successfully**\n' +
      `Mode: ${process.env.TRADING_MODE || 'paper'}\n` +
      `Auto-login: Enabled (5:45 AM IST daily)\n` +
      `Commands: Active (type !help)\n` +
      `Subscribed stocks: ${marketData.subscribedStocks.length}\n` +
      tickerStatus,
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
  
  marketData.stopWatching();
  await tickerService.stop();
  await tradingService.stop();
  
  await discordService.log('🛑 Bot shutting down gracefully', 'warning');
  
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
  
  marketData.stopWatching();
  await tickerService.stop();
  await tradingService.stop();
  
  await discordService.log('🛑 Bot stopped by user', 'warning');
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

start();