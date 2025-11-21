require('dotenv').config();
const discordService = require('./services/discord.service');
const zerodhaService = require('./services/zerodha.service');
const scheduledAuth = require('./services/scheduled-auth.service');
const channelManager = require('./services/channel-manager.service');
const gridWebSocketService = require('./services/grid-websocket.service');
const db = require('./services/database.service');
const logger = require('./utils/logger');

async function start() {
  try {
    logger.info('🚀 Starting Grid Trading Bot...');

    // Initialize database first (before any channel initialization)
    await db.initialize();
    logger.info('✅ Database initialized');

    // Start scheduled authentication (will check and auto-login if needed)
    await scheduledAuth.start();
    logger.info('✅ Auto-login scheduler started');

    // Check if Zerodha is now connected (after potential auto-login)
    const connected = zerodhaService.isConnected;

    // Initialize Channel Manager if connected
    if (connected) {
      try {
        // Initialize Channel Manager (this will initialize all trading channels)
        await channelManager.initialize();
        logger.info('✅ Channel Manager initialized');

        // Initialize Discord with channel manager (for multi-channel command routing)
        await discordService.initialize(channelManager);
        logger.info('✅ Discord initialized with multi-channel support');

        // Log database sync status to Discord (now that Discord is initialized)
        await db.logSyncStatusToDiscord();

        // Initialize WebSocket with callback to channel manager
        await gridWebSocketService.initialize((ticks) => {
          channelManager.processTicks(ticks);
        });
        logger.info('✅ Grid WebSocket connected');

        // Auto-start trading if configured
        await channelManager.autoStartTrading();

      } catch (error) {
        logger.error('❌ Failed to initialize trading:', error);
      }
    } else {
      // Initialize Discord without channel manager
      await discordService.initialize();
      logger.info('✅ Discord initialized (limited mode - waiting for connection)');

      // Log database sync status to Discord
      await db.logSyncStatusToDiscord();

      logger.warn('⚠️ Grid Trading Bot - Zerodha connection failed');
      logger.warn('⚠️ Please check auto-login logs above');
    }

    const botStatus = connected
      ? '✅ Grid Bot: Ready'
      : '⏸️ Grid Bot: Waiting for connection';

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

    // Build channel status message
    let channelStatus = '';
    if (connected && channelManager.isInitialized) {
      const channels = channelManager.getAllChannels();
      channelStatus = '\n\n**Trading Channels:**\n';
      channels.forEach(channel => {
        const capital = formatCapital(channel.paperTradingService.initialCapital);
        const tradingStatus = channel.paperTradingService.isEnabled ? '🟢' : '⏸️';
        channelStatus += `${tradingStatus} **${channel.name}**: ${capital} | Grid: ${channel.paperTradingService.gridPercentage}%\n`;
      });
    }

    await discordService.log(
      '🚀 **Grid Trading Bot Started**\n' +
      `📊 Monitoring: ${connected ? gridWebSocketService.tokens?.length || 0 : 'Unknown'} stocks\n` +
      `🔐 Auto-login: Enabled (5:45 AM IST daily)\n` +
      `${botStatus}${channelStatus}\n\n` +
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