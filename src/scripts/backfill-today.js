require('dotenv').config();
const database = require('../services/database.service');

async function backfillToday() {
  console.log('Initializing database...');
  database.initialize();

  const today = new Date().toISOString().split('T')[0];
  console.log(`Processing strategy for date: ${today}`);

  // Get portfolio state for strategy params
  const portfolioState = database.getPortfolioState();

  // Strategy params from env or defaults
  const strategyParams = {
    gridPercentage: parseFloat(process.env.GRID_PERCENTAGE) || 0.25,
    targetPercentage: parseFloat(process.env.TARGET_PERCENTAGE) || parseFloat(process.env.GRID_PERCENTAGE) || 0.25,
    stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE) || 1,
    perTradeAmount: parseFloat(process.env.AMOUNT_PER_TRADE) || 5000,
    capital: portfolioState?.initial_capital || parseFloat(process.env.INITIAL_CAPITAL) || 100000
  };

  console.log('Strategy params:', strategyParams);

  // Check if strategy already exists
  const existing = database.getDailyStrategy(today);
  if (!existing) {
    console.log('Creating new strategy entry...');
    database.createDailyStrategy(strategyParams);
  } else {
    console.log('Strategy entry already exists, updating...');
  }

  // Get today's transactions
  const transactions = database.getTodayTransactions();
  const dailyPnl = database.getTodayPnl();
  const holdings = database.getAllHoldings();

  console.log(`Found ${transactions.length} transactions today`);

  const sellTrades = transactions.filter(t => t.type === 'SELL');
  const buyTrades = transactions.filter(t => t.type === 'BUY');

  // Calculate metrics
  const metrics = {
    total_trades: transactions.length,
    buy_count: buyTrades.length,
    sell_count: sellTrades.length,
    winning_trades: sellTrades.filter(t => t.pnl > 0).length,
    losing_trades: sellTrades.filter(t => t.pnl < 0).length,
    realized_pnl: dailyPnl.realized_pnl || 0,
    buy_value: dailyPnl.buy_value || 0,
    sell_value: dailyPnl.sell_value || 0,
    total_brokerage: sellTrades.reduce((sum, t) => sum + (t.brokerage || 0), 0),
    max_single_win: sellTrades.length > 0 ? Math.max(0, ...sellTrades.map(t => t.pnl || 0)) : 0,
    max_single_loss: sellTrades.length > 0 ? Math.min(0, ...sellTrades.map(t => t.pnl || 0)) : 0,
    ending_cash_balance: portfolioState?.cash_balance || 0,
    ending_holdings_count: holdings.length,
    ending_holdings_value: holdings.reduce((sum, h) => sum + h.invested_value, 0),
    status: 'completed',
    completed_at: new Date().toISOString()
  };

  // Calculate derived metrics
  metrics.win_rate = metrics.sell_count > 0
    ? parseFloat((metrics.winning_trades / metrics.sell_count * 100).toFixed(2))
    : 0;
  metrics.pnl_percent = strategyParams.capital > 0
    ? parseFloat((metrics.realized_pnl / strategyParams.capital * 100).toFixed(4))
    : 0;

  console.log('Calculated metrics:', metrics);

  // Update strategy record
  database.updateDailyStrategy(today, metrics);

  // Fetch and display the final record
  const finalRecord = database.getDailyStrategy(today);
  console.log('\n=== Today\'s Strategy Entry ===');
  console.log(JSON.stringify(finalRecord, null, 2));

  database.close();
  console.log('\nBackfill complete!');
}

backfillToday().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
