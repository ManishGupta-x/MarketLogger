require('dotenv').config();
const database = require('../services/database.service');

async function closeStrategy() {
  console.log('Initializing database...');
  database.initialize();

  const today = new Date().toISOString().split('T')[0];
  console.log(`Closing strategy for date: ${today}`);

  // Check if strategy exists
  const existing = database.getDailyStrategy(today);
  if (!existing) {
    console.error(`Error: No strategy found for ${today}`);
    console.log('Run set-strategy.js first to create a strategy entry');
    database.close();
    process.exit(1);
  }

  if (existing.status === 'completed') {
    console.log('Strategy already completed:', JSON.stringify(existing, null, 2));
    database.close();
    process.exit(0);
  }

  // Get today's transactions
  const transactions = database.getTodayTransactions();
  const dailyPnl = database.getTodayPnl();
  const holdings = database.getAllHoldings();
  const portfolioState = database.getPortfolioState();

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
  metrics.pnl_percent = existing.capital > 0
    ? parseFloat((metrics.realized_pnl / existing.capital * 100).toFixed(4))
    : 0;

  // Update strategy record
  database.updateDailyStrategy(today, metrics);

  // Fetch and display the final record
  const finalRecord = database.getDailyStrategy(today);

  console.log('\n=== Strategy Closed ===');
  console.log(`Date: ${finalRecord.date}`);
  console.log(`\nStrategy Parameters:`);
  console.log(`  Grid: ${finalRecord.grid_percentage}%`);
  console.log(`  Stop Loss: ${finalRecord.stop_loss_percentage}%`);
  console.log(`  Per Trade: Rs.${finalRecord.per_trade_amount.toLocaleString()}`);
  console.log(`  Capital: Rs.${finalRecord.capital.toLocaleString()}`);
  console.log(`\nPerformance:`);
  console.log(`  Total Trades: ${finalRecord.total_trades} (${finalRecord.buy_count} buys, ${finalRecord.sell_count} sells)`);
  console.log(`  Wins/Losses: ${finalRecord.winning_trades}/${finalRecord.losing_trades}`);
  console.log(`  Win Rate: ${finalRecord.win_rate}%`);
  console.log(`  Realized P&L: Rs.${finalRecord.realized_pnl.toLocaleString()} (${finalRecord.pnl_percent}%)`);
  console.log(`  Max Win: Rs.${finalRecord.max_single_win.toLocaleString()}`);
  console.log(`  Max Loss: Rs.${finalRecord.max_single_loss.toLocaleString()}`);
  console.log(`  Total Brokerage: Rs.${finalRecord.total_brokerage.toLocaleString()}`);
  console.log(`\nPortfolio State:`);
  console.log(`  Cash Balance: Rs.${finalRecord.ending_cash_balance.toLocaleString()}`);
  console.log(`  Holdings: ${finalRecord.ending_holdings_count} stocks worth Rs.${finalRecord.ending_holdings_value.toLocaleString()}`);

  database.close();
  console.log('\nStrategy closed successfully!');
}

closeStrategy().catch(err => {
  console.error('Failed to close strategy:', err);
  process.exit(1);
});
