require('dotenv').config();
const zerodhaService = require('./services/zerodha.service');
const scheduledAuth = require('./services/scheduled-auth.service');
const websocketService = require('./services/grid-websocket.service');
const adaptiveStrategy = require('./services/adaptive-strategy.service');
const paperTrading = require('./services/paper-trading.service');
const sseServer = require('./services/sse-server');
const logger = require('./utils/logger');

async function start() {
  try {
    logger.info('Starting Adaptive Trading Bot...');

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

    // One-time migration: Fix timestamps that were recorded in GMT instead of IST
    try {
      const dbService = require('./services/database.service');
      const db = dbService.db;

      const gmtTransactions = db.prepare(`
        SELECT id, created_at FROM transactions
        WHERE time(created_at) < '09:30:00'
      `).all();

      if (gmtTransactions.length > 0) {
        logger.info(`Found ${gmtTransactions.length} transactions before 9:30 AM, adjusting to IST (+5:30)...`);

        const updateStmt = db.prepare(`
          UPDATE transactions
          SET created_at = datetime(created_at, '+5 hours', '+30 minutes')
          WHERE id = ?
        `);

        const runFix = db.transaction(() => {
          for (const txn of gmtTransactions) {
            updateStmt.run(txn.id);
          }
        });

        runFix();
        logger.info(`Fixed ${gmtTransactions.length} transaction timestamps to IST`);
      }
    } catch (err) {
      logger.error('Timezone fix migration failed:', err);
    }

    // Initialize adaptive strategy with database reference
    const database = require('./services/database.service');
    adaptiveStrategy.setPaperTradingService(paperTrading);
    adaptiveStrategy.setDatabase(database);
    await adaptiveStrategy.initialize();
    logger.info('Adaptive strategy initialized');

    // Set service references for scheduled auth (for applying calendar strategies)
    scheduledAuth.setServices(adaptiveStrategy, paperTrading);

    // Start SSE server for website
    const SSE_PORT = process.env.SSE_PORT || 34000;
    await sseServer.start(SSE_PORT);
    sseServer.setTokenMap(adaptiveStrategy.tokenToSymbolMap);
    sseServer.setPaperTradingService(paperTrading);
    sseServer.setGridStrategyService(adaptiveStrategy);
    adaptiveStrategy.setSSEServer(sseServer);
    logger.info(`SSE server started on port ${SSE_PORT}`);

    // Initialize WebSocket with callbacks
    await websocketService.initialize((ticks) => {
      // Process ticks for adaptive trading
      adaptiveStrategy.processTicks(ticks);

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
    logger.info('WebSocket connected');

    // Start trading
    adaptiveStrategy.start();
    logger.info('Adaptive trading started');

    logger.info(`Monitoring ${websocketService.tokens?.length || 0} stocks`);
    logger.info(`Initial capital: ${paperTrading.initialCapital}`);
    logger.info(`Amount per trade: ${paperTrading.amountPerTrade}`);

    // Log adaptive mode status
    logger.info('Adaptive Trading Mode: ENABLED');
    logger.info('- Market regime detection: NIFTY 50 (60%) + NIFTY Bank (40%)');
    logger.info('- Signal-based entries: RSI, EMA, momentum');
    logger.info('- Intelligent exits: Trailing stops + Rapid decline detection');
    logger.info('- Stock screening: Top 10 stocks per regime');

    logger.info('Adaptive Trading Bot ready!');

  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await websocketService.stop();
  sseServer.stop();
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  await websocketService.stop();
  sseServer.stop();
  setTimeout(() => process.exit(0), 1000);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
});

start();
