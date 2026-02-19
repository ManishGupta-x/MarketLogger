require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/portfolio.db');
const db = new Database(dbPath);

const today = new Date().toISOString().split('T')[0];
console.log('Cleanup for date:', today);
console.log('='.repeat(50));

// Show today's transactions
const transactions = db.prepare('SELECT * FROM transactions WHERE date(created_at) = ?').all(today);
console.log('\nToday\'s transactions to delete:', transactions.length);
transactions.forEach(t => {
  console.log(`  ${t.type} ${t.symbol} | Qty: ${t.qty} | Price: ${t.price} | Value: ${t.value}`);
});

if (transactions.length === 0) {
  console.log('\nNo transactions to delete. Exiting.');
  db.close();
  process.exit(0);
}

// Calculate total buy value to restore
const totalBuyValue = transactions
  .filter(t => t.type === 'BUY')
  .reduce((sum, t) => sum + t.value, 0);
console.log(`\nTotal BUY value to restore: Rs.${totalBuyValue.toFixed(2)}`);

// Get symbols from today's buys to remove from holdings
const symbolsToRemove = [...new Set(transactions.filter(t => t.type === 'BUY').map(t => t.symbol))];
console.log('\nHoldings to remove:', symbolsToRemove.join(', '));

// Get current portfolio state
const state = db.prepare('SELECT * FROM portfolio_state WHERE id = 1').get();
console.log(`\nCurrent cash balance: Rs.${state?.cash_balance}`);
const newBalance = state.cash_balance + totalBuyValue;
console.log(`New cash balance after restore: Rs.${newBalance.toFixed(2)}`);

// Perform cleanup
console.log('\n' + '='.repeat(50));
console.log('Performing cleanup...\n');

// 1. Delete today's transactions
const deleteTransactions = db.prepare('DELETE FROM transactions WHERE date(created_at) = ?');
const txResult = deleteTransactions.run(today);
console.log(`Deleted ${txResult.changes} transactions`);

// 2. Delete holdings for symbols bought today
symbolsToRemove.forEach(symbol => {
  const deleteHolding = db.prepare('DELETE FROM holdings WHERE symbol = ?');
  const result = deleteHolding.run(symbol);
  if (result.changes > 0) {
    console.log(`Deleted holding: ${symbol}`);
  }
});

// 3. Restore cash balance
const updateBalance = db.prepare('UPDATE portfolio_state SET cash_balance = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = 1');
updateBalance.run(newBalance);
console.log(`Restored cash balance to Rs.${newBalance.toFixed(2)}`);

// 4. Delete today's daily_pnl
const deleteDailyPnl = db.prepare('DELETE FROM daily_pnl WHERE date = ?');
const pnlResult = deleteDailyPnl.run(today);
console.log(`Deleted daily_pnl entries: ${pnlResult.changes}`);

// 5. Delete today's strategy entry
const deleteStrategy = db.prepare('DELETE FROM daily_strategies WHERE date = ?');
const stratResult = deleteStrategy.run(today);
console.log(`Deleted strategy entries: ${stratResult.changes}`);

// Verify final state
console.log('\n' + '='.repeat(50));
console.log('Final state:\n');

const finalState = db.prepare('SELECT * FROM portfolio_state WHERE id = 1').get();
console.log(`Cash balance: Rs.${finalState.cash_balance}`);

const finalHoldings = db.prepare('SELECT COUNT(*) as count FROM holdings').get();
console.log(`Holdings count: ${finalHoldings.count}`);

const finalTransactions = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE date(created_at) = ?').get(today);
console.log(`Today's transactions: ${finalTransactions.count}`);

db.close();
console.log('\nCleanup complete!');
