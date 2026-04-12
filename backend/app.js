require('dotenv').config();
const logger      = require('./utils/logger');
const db          = require('./src/database');
const zerodha     = require('./src/auth/zerodha');
const scheduler   = require('./src/auth/scheduler');
const wsClient    = require('./src/data/websocket');
const tickProc    = require('./src/data/tick-processor');
const paperTrading = require('./src/portfolio/paper-trading');
const risk        = require('./src/portfolio/risk');
const orchestrator = require('./src/strategy/orchestrator');
const sse         = require('./src/api/sse');
const { start: startServer } = require('./src/api/server');

/**
 * MarketLogger Backend — startup sequence
 */
async function main() {
  logger.info('=== MarketLogger starting ===');

  // 1. Database
  db.initialize();

  // 2. Zerodha auth
  const connected = await zerodha.initialize();
  if (!connected) {
    logger.warn('Zerodha not connected. WebSocket will fail unless token is refreshed.');
  }

  // 3. Paper trading
  paperTrading.initialize();

  // 4. Wire dependencies
  orchestrator.setPaperTrading(paperTrading);
  orchestrator.setRisk(risk);
  orchestrator.setDatabase(db);

  // SSE broadcast function
  orchestrator.setBroadcast((type, data) => {
    sse.broadcast(type, data);
    // Also push portfolio updates after every order
    if (type === 'order') {
      try { sse.broadcastPortfolio(paperTrading.getPortfolio()); } catch(e) {}
    }
  });

  // 5. Tick processor → orchestrator + SSE
  tickProc.addListener(ticks => {
    orchestrator.onTicks(ticks);
    // Broadcast latest ticks to SSE clients
    for (const tick of ticks) sse.broadcast('tick', tick);
  });

  // 6. Strategy orchestrator initialize (loads instruments, starts regime loop)
  if (connected) {
    try {
      await orchestrator.initialize();
    } catch (err) {
      logger.error('Orchestrator init failed:', err.message);
      logger.warn('Strategy disabled — continuing without it');
    }
  }

  // 7. Scheduler (daily login + strategy)
  scheduler.setServices(paperTrading);
  await scheduler.start();

  // 8. WebSocket (after auth)
  if (connected) {
    try {
      await wsClient.start(ticks => tickProc.process(ticks));
    } catch (err) {
      logger.error('WebSocket start failed:', err.message);
    }
  }

  // 9. Start HTTP server
  startServer();

  logger.info('=== MarketLogger started ===');
}

main().catch(err => {
  logger.error('Fatal startup error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT',  () => { logger.info('SIGINT received, shutting down...'); wsClient.stop(); db.close(); process.exit(0); });
process.on('SIGTERM', () => { logger.info('SIGTERM received, shutting down...'); wsClient.stop(); db.close(); process.exit(0); });
