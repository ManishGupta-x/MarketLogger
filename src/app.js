require('dotenv').config();
const discordService = require('./services/discord.service');
const zerodhaService = require('./services/zerodha.service');
const scheduledAuth = require('./services/scheduled-auth.service');
const paperTradingService = require('./services/paper-trading.service');
const gridStrategyService = require('./services/grid-strategy.service');
const gridWebSocketService = require('./services/grid-websocket.service');
const logger = require('./utils/logger');

async function start() {
  try {
    logger.info('🚀 Starting Grid Trading Bot...');

    // Initialize Discord
    await discordService.initialize();
    logger.info('✅ Discord initialized');

    // Start scheduled authentication (will check and auto-login if needed)
    await scheduledAuth.start();
    logger.info('✅ Auto-login scheduler started');

    // Check if Zerodha is now connected (after potential auto-login)
    const connected = zerodhaService.isConnected;

    // Initialize Grid Trading if connected
    if (connected) {
      // Initialize Paper Trading Service
      try {
        await paperTradingService.initialize();
        logger.info('✅ Paper Trading Service initialized');

        // Initialize Grid Strategy (loads its own instrument mapping)
        await gridStrategyService.initialize();
        logger.info('✅ Grid Strategy Service initialized');

        // Initialize WebSocket with callback to grid strategy
        await gridWebSocketService.initialize((ticks) => {
          gridStrategyService.processTicks(ticks);
        });
        logger.info('✅ Grid WebSocket connected');

        // Auto-start trading if configured
        const autoStart = process.env.AUTO_START_TRADING === 'true';
        if (autoStart && paperTradingService.isInitialized && gridStrategyService.isInitialized) {
          logger.info('🚀 Auto-starting paper trading...');
          await paperTradingService.enableTrading();
          await gridStrategyService.start();
          logger.info('✅ Paper trading auto-started');
        }
      } catch (error) {
        logger.error('❌ Failed to initialize paper trading:', error);
      }
    } else {
      logger.warn('⚠️ Grid Trading Bot - Zerodha connection failed');
      logger.warn('⚠️ Please check auto-login logs above');
    }

    const botStatus = connected
      ? '✅ Grid Bot: Ready'
      : '⏸️ Grid Bot: Waiting for connection';

    const tradingStatus = paperTradingService.isEnabled && gridStrategyService.isActive
      ? '✅ Trading: ACTIVE'
      : '⏸️ Trading: Use !start-trading';

    // Format capital amount for display
    const formatCapital = (amount) => {
      if (amount >= 100000) {
        return `₹${(amount / 100000).toFixed(1)}L`;
      } else if (amount >= 1000) {
        return `₹${(amount / 1000).toFixed(1)}K`;
      } else {
        return `₹${amount}`;
      }
    };

    const portfolioStatus = paperTradingService.isInitialized
      ? `${formatCapital(paperTradingService.initialCapital)} Ready`
      : 'Not initialized';

    const gridPercentage = gridStrategyService.gridPercentage || 5.0;

    await discordService.log(
      '🚀 **Grid Trading Bot Started**\n' +
      `📊 Monitoring: ${connected ? gridWebSocketService.tokens?.length || 0 : 'Unknown'} stocks\n` +
      `💼 Virtual Portfolio: ${portfolioStatus}\n` +
      `📈 ${gridPercentage}% Grid Strategy: ${gridStrategyService.isInitialized ? 'Initialized' : 'Not ready'}\n` +
      `🔐 Auto-login: Enabled (5:45 AM IST daily)\n` +
      `${botStatus}\n` +
      `${tradingStatus}\n\n` +
      `Type \`!help\` for commands`,
      connected ? 'success' : 'warning'
    );

  } catch (error) {
    logger.error('Failed to start application:', error);
    await discordService.log(
      `❌ **Grid Trading Bot Startup Failed**\n${error.message}`,
      'error'
    );
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');

  await gridWebSocketService.stop();

  await discordService.log('🛑 Grid Trading Bot shutting down gracefully', 'warning');

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

  await gridWebSocketService.stop();

  await discordService.log('🛑 Grid Trading Bot stopped by user', 'warning');

  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

start();