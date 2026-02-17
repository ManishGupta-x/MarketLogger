require('dotenv').config();
const zerodhaService = require('./services/zerodha.service');
const scheduledAuth = require('./services/scheduled-auth.service');
const gridWebSocketService = require('./services/grid-websocket.service');
const gridStrategy = require('./services/grid-strategy.service');
const paperTrading = require('./services/paper-trading.service');
const sseServer = require('./services/sse-server');
const logger = require('./utils/logger');

async function start() {
  try {
    logger.info('Starting Grid Trading Bot...');

    // Start scheduled authentication (will check and auto-login if needed)
    await scheduledAuth.start();
    logger.info('Auto-login scheduler started');

    // Check if Zerodha is connected
    const connected = zerodhaService.isConnected;

    if (!connected) {
      logger.error('Zerodha not connected. Please check credentials.');
      process.exit(1);
    }

    // Initialize paper trading service
    await paperTrading.initialize();
    logger.info('Paper trading initialized');

    // Initialize grid strategy
    await gridStrategy.initialize();
    gridStrategy.setPaperTradingService(paperTrading);
    logger.info('Grid strategy initialized');

    // Start SSE server for website
    const SSE_PORT = process.env.SSE_PORT || 34000;
    await sseServer.start(SSE_PORT);
    sseServer.setTokenMap(gridStrategy.tokenToSymbolMap);
    logger.info(`SSE server started on port ${SSE_PORT}`);

    // Initialize WebSocket with callbacks
    await gridWebSocketService.initialize((ticks) => {
      // Process ticks for grid trading
      gridStrategy.processTicks(ticks);

      // Broadcast ticks to website via SSE
      sseServer.broadcastTicks(ticks);

      // Update portfolio data for SSE
      const portfolio = paperTrading.getPortfolio();
      const holdings = paperTrading.getHoldings();
      sseServer.updatePortfolio({
        ...portfolio,
        holdings
      });
    });
    logger.info('Grid WebSocket connected');

    // Start trading
    gridStrategy.start();
    logger.info('Grid trading started');

    logger.info(`Monitoring ${gridWebSocketService.tokens?.length || 0} stocks`);
    logger.info(`Grid percentage: ${gridStrategy.gridPercentage}%`);
    logger.info(`Initial capital: ${paperTrading.initialCapital}`);
    logger.info(`Amount per trade: ${paperTrading.amountPerTrade}`);
    logger.info('Grid Trading Bot ready!');

  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await gridWebSocketService.stop();
  sseServer.stop();
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  await gridWebSocketService.stop();
  sseServer.stop();
  setTimeout(() => process.exit(0), 1000);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
});

start();
