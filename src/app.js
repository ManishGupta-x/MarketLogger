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

    // Check for migration data
    const fs = require('fs');
    const path = require('path');
    const migrationFile = path.join(__dirname, '../yesterday_data.json');
    if (fs.existsSync(migrationFile)) {
      try {
        logger.info('Found yesterday_data.json, running migration...');
        const migrationData = JSON.parse(fs.readFileSync(migrationFile, 'utf8'));
        const dbService = require('./services/database.service');

        const db = dbService.db;
        const runMigration = db.transaction(() => {
          // Sync Daily Strategy
          if (migrationData.dailyStrategy) {
            const stmt = db.prepare(`
              INSERT OR REPLACE INTO daily_strategies (
                date, grid_percentage, target_percentage, stop_loss_percentage, 
                per_trade_amount, capital, total_trades, buy_count, sell_count, 
                winning_trades, losing_trades, realized_pnl, total_brokerage, 
                buy_value, sell_value, win_rate, max_single_win, max_single_loss, 
                pnl_percent, ending_cash_balance, ending_holdings_count, 
                ending_holdings_value, status, notes, created_at, completed_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
              migrationData.dailyStrategy.date, migrationData.dailyStrategy.grid_percentage, migrationData.dailyStrategy.target_percentage,
              migrationData.dailyStrategy.stop_loss_percentage, migrationData.dailyStrategy.per_trade_amount, migrationData.dailyStrategy.capital,
              migrationData.dailyStrategy.total_trades, migrationData.dailyStrategy.buy_count, migrationData.dailyStrategy.sell_count,
              migrationData.dailyStrategy.winning_trades, migrationData.dailyStrategy.losing_trades, migrationData.dailyStrategy.realized_pnl,
              migrationData.dailyStrategy.total_brokerage, migrationData.dailyStrategy.buy_value, migrationData.dailyStrategy.sell_value,
              migrationData.dailyStrategy.win_rate, migrationData.dailyStrategy.max_single_win, migrationData.dailyStrategy.max_single_loss,
              migrationData.dailyStrategy.pnl_percent, migrationData.dailyStrategy.ending_cash_balance, migrationData.dailyStrategy.ending_holdings_count,
              migrationData.dailyStrategy.ending_holdings_value, migrationData.dailyStrategy.status, migrationData.dailyStrategy.notes,
              migrationData.dailyStrategy.created_at, migrationData.dailyStrategy.completed_at
            );
          }

          // Sync Daily PnL
          if (migrationData.dailyPnl) {
            const stmt = db.prepare(`
              INSERT OR REPLACE INTO daily_pnl (date, realized_pnl, trades_count, buy_value, sell_value)
              VALUES (?, ?, ?, ?, ?)
            `);
            stmt.run(
              migrationData.dailyPnl.date, migrationData.dailyPnl.realized_pnl, migrationData.dailyPnl.trades_count,
              migrationData.dailyPnl.buy_value, migrationData.dailyPnl.sell_value
            );
          }

          // Sync Transactions
          const txnStmt = db.prepare(`
            INSERT OR IGNORE INTO transactions (
              type, token, symbol, qty, price, value, brokerage, pnl, pnl_percent, balance_after, grid_level, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const txn of migrationData.transactions) {
            txnStmt.run(
              txn.type, txn.token, txn.symbol, txn.qty, txn.price, txn.value,
              txn.brokerage, txn.pnl, txn.pnl_percent, txn.balance_after,
              txn.grid_level, txn.created_at
            );
          }

          // Sync Portfolio State - ONLY if no trades have happened today yet
          // This prevents overwriting your live cash balance if you're already trading
          const todayTxns = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE date(created_at) = date('now', 'localtime')").get();
          if (migrationData.portfolioState && todayTxns.count === 0) {
            const stmt = db.prepare(`
              UPDATE portfolio_state SET cash_balance = ?, initial_capital = ?, realized_pnl = ? WHERE id = 1
            `);
            stmt.run(migrationData.portfolioState.cash_balance, migrationData.portfolioState.initial_capital, migrationData.portfolioState.realized_pnl);
            logger.info('Portfolio state synced (initial state).');
          } else {
            logger.info('Skipping portfolio state sync to protect live running entries.');
          }
        });

        runMigration();
        logger.info(`Successfully migrated ${migrationData.transactions.length} transactions!`);

        // Try to delete file after migration to prevent re-runs
        try {
          fs.unlinkSync(migrationFile);
          logger.info('Migration file deleted.');
        } catch (e) {
          logger.warn('Could not delete migration file (this is normal if running in a read-only container)');
        }
      } catch (err) {
        logger.error('Migration failed:', err);
      }
    }

    // Initialize grid strategy
    gridStrategy.setPaperTradingService(paperTrading);
    await gridStrategy.initialize();
    logger.info('Grid strategy initialized');

    // Start SSE server for website
    const SSE_PORT = process.env.SSE_PORT || 34000;
    await sseServer.start(SSE_PORT);
    sseServer.setTokenMap(gridStrategy.tokenToSymbolMap);
    sseServer.setPaperTradingService(paperTrading);
    gridStrategy.setSSEServer(sseServer);
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
