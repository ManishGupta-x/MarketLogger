require('dotenv').config();
const database = require('../services/database.service');

function parseArgs(args) {
  const params = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      params[key] = value;
    }
  });
  return params;
}

function printUsage() {
  console.log(`
Usage: node set-strategy.js --grid=<value> --sl=<value> --per-trade=<value> --capital=<value> [--force]

Parameters:
  --grid        Grid percentage (e.g., 0.25 for 0.25%)
  --sl          Stop loss percentage (e.g., 1 for 1%)
  --per-trade   Amount per trade in rupees (e.g., 5000)
  --capital     Total capital for the day (e.g., 100000)
  --force       Overwrite existing strategy for today

Example:
  node set-strategy.js --grid=0.25 --sl=1 --per-trade=5000 --capital=100000
`);
}

async function setStrategy() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const params = parseArgs(args);

  // Validate required params
  const required = ['grid', 'sl', 'per-trade', 'capital'];
  const missing = required.filter(r => !params[r]);

  if (missing.length > 0) {
    console.error(`Error: Missing required parameters: ${missing.join(', ')}`);
    printUsage();
    process.exit(1);
  }

  // Parse and validate values
  const gridPercentage = parseFloat(params['grid']);
  const stopLossPercentage = parseFloat(params['sl']);
  const perTradeAmount = parseFloat(params['per-trade']);
  const capital = parseFloat(params['capital']);

  if (isNaN(gridPercentage) || isNaN(stopLossPercentage) || isNaN(perTradeAmount) || isNaN(capital)) {
    console.error('Error: All parameters must be valid numbers');
    process.exit(1);
  }

  if (gridPercentage <= 0 || stopLossPercentage <= 0 || perTradeAmount <= 0 || capital <= 0) {
    console.error('Error: All parameters must be positive numbers');
    process.exit(1);
  }

  console.log('Initializing database...');
  database.initialize();

  const today = new Date().toISOString().split('T')[0];

  // Check if strategy already exists
  const existing = database.getDailyStrategy(today);
  if (existing && !params.force) {
    console.error(`Error: Strategy for ${today} already exists!`);
    console.log('Existing strategy:', JSON.stringify(existing, null, 2));
    console.log('\nUse --force to overwrite');
    database.close();
    process.exit(1);
  }

  const strategyParams = {
    gridPercentage,
    stopLossPercentage,
    perTradeAmount,
    capital
  };

  if (existing) {
    console.log('Overwriting existing strategy...');
    database.updateDailyStrategy(today, {
      grid_percentage: gridPercentage,
      stop_loss_percentage: stopLossPercentage,
      per_trade_amount: perTradeAmount,
      capital: capital,
      status: 'active'
    });
  } else {
    console.log('Creating new strategy entry...');
    database.createDailyStrategy(strategyParams);
  }

  const finalRecord = database.getDailyStrategy(today);
  console.log('\n=== Strategy Set Successfully ===');
  console.log(`Date: ${today}`);
  console.log(`Grid: ${gridPercentage}%`);
  console.log(`Stop Loss: ${stopLossPercentage}%`);
  console.log(`Per Trade: Rs.${perTradeAmount.toLocaleString()}`);
  console.log(`Capital: Rs.${capital.toLocaleString()}`);
  console.log(`Status: ${finalRecord.status}`);

  database.close();
}

setStrategy().catch(err => {
  console.error('Failed to set strategy:', err);
  process.exit(1);
});
