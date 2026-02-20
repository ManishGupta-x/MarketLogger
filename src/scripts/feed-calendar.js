require('dotenv').config();
const database = require('../services/database.service');

function parseArgs(args) {
  const params = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        params[key] = value;
      } else {
        // Flag without value (e.g., --list, --holiday)
        params[arg.slice(2)] = true;
      }
    }
  });
  return params;
}

function printUsage() {
  console.log(`
Usage: node feed-calendar.js --date=<YYYY-MM-DD> --grid=<value> --target=<value> --sl=<value> --per-trade=<value> --capital=<value> [options]

Required Parameters:
  --date        Target date (e.g., 2026-02-25)
  --grid        Grid percentage for buying (e.g., 0.25)
  --target      Target percentage for selling (e.g., 0.5)
  --sl          Stop loss percentage (e.g., 1)
  --per-trade   Amount per trade in rupees (e.g., 5000)
  --capital     Total capital for the day (e.g., 100000)

Optional Parameters:
  --notes       Optional notes (e.g., "Expiry day")
  --holiday     Mark as market holiday (ignores other params except date and notes)
  --delete      Delete calendar entry for the date
  --list        List upcoming 14 days of calendar entries
  --range       Feed same strategy for date range (e.g., --range=2026-02-25:2026-02-28)

Examples:
  # Feed single day
  npm run calendar:feed -- --date=2026-02-25 --grid=0.25 --target=0.5 --sl=1 --per-trade=5000 --capital=100000

  # Feed date range (Mon-Fri, skips weekends)
  npm run calendar:feed -- --range=2026-02-24:2026-02-28 --grid=0.25 --target=0.5 --sl=1 --per-trade=5000 --capital=100000

  # Mark holiday
  npm run calendar:feed -- --date=2026-03-14 --holiday --notes="Holi"

  # List upcoming
  npm run calendar:list

  # Delete entry
  npm run calendar:feed -- --date=2026-02-25 --delete
`);
}

function isWeekend(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
}

function getDatesBetween(startDate, endDate) {
  const dates = [];
  // Parse dates in a timezone-safe way
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

  const current = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    if (!isWeekend(dateStr)) {
      dates.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

async function feedCalendar() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const params = parseArgs(args);

  console.log('Initializing database...');
  database.initialize();

  // Handle --list
  if (params.list) {
    const upcoming = database.getUpcomingCalendarStrategies(14);
    console.log('\n=== Upcoming Calendar Entries ===');
    if (upcoming.length === 0) {
      console.log('No upcoming entries found.');
    } else {
      upcoming.forEach(entry => {
        const holidayTag = entry.is_holiday ? ' [HOLIDAY]' : '';
        console.log(`${entry.date}${holidayTag}: Grid=${entry.grid_percentage}%, Target=${entry.target_percentage}%, SL=${entry.stop_loss_percentage}%, Trade=Rs.${entry.per_trade_amount}, Capital=Rs.${entry.capital}${entry.notes ? ` (${entry.notes})` : ''}`);
      });
    }
    database.close();
    return;
  }

  // Handle --delete
  if (params.delete) {
    if (!params.date) {
      console.error('Error: --date is required for delete operation');
      process.exit(1);
    }
    const result = database.deleteCalendarStrategy(params.date);
    console.log(result.changes > 0 ? `Deleted calendar entry for ${params.date}` : `No entry found for ${params.date}`);
    database.close();
    return;
  }

  // Handle --holiday
  if (params.holiday) {
    if (!params.date) {
      console.error('Error: --date is required for holiday marking');
      process.exit(1);
    }
    database.markAsHoliday(params.date, params.notes);
    console.log(`Marked ${params.date} as market holiday${params.notes ? `: ${params.notes}` : ''}`);
    database.close();
    return;
  }

  // Determine dates to process
  let dates = [];
  if (params.range) {
    const [start, end] = params.range.split(':');
    if (!start || !end) {
      console.error('Error: Invalid range format. Use --range=YYYY-MM-DD:YYYY-MM-DD');
      process.exit(1);
    }
    dates = getDatesBetween(start, end);
    console.log(`Processing ${dates.length} weekdays from ${start} to ${end}`);
  } else if (params.date) {
    dates = [params.date];
  } else {
    console.error('Error: Either --date or --range is required');
    printUsage();
    process.exit(1);
  }

  // Validate required params for strategy feed
  const required = ['grid', 'target', 'sl', 'per-trade', 'capital'];
  const missing = required.filter(r => !params[r]);

  if (missing.length > 0) {
    console.error(`Error: Missing required parameters: ${missing.join(', ')}`);
    printUsage();
    process.exit(1);
  }

  // Parse values
  const strategyParams = {
    gridPercentage: parseFloat(params['grid']),
    targetPercentage: parseFloat(params['target']),
    stopLossPercentage: parseFloat(params['sl']),
    perTradeAmount: parseFloat(params['per-trade']),
    capital: parseFloat(params['capital']),
    isHoliday: false,
    notes: params.notes || null
  };

  // Validate numeric values
  const values = Object.entries(strategyParams).filter(([k, v]) => typeof v === 'number');
  for (const [key, value] of values) {
    if (isNaN(value) || value < 0) {
      console.error(`Error: ${key} must be a valid non-negative number`);
      process.exit(1);
    }
  }

  // Feed each date
  console.log('\n=== Feeding Calendar Strategies ===');
  for (const date of dates) {
    database.upsertCalendarStrategy(date, strategyParams);
    console.log(`[OK] ${date}: Grid=${strategyParams.gridPercentage}%, Target=${strategyParams.targetPercentage}%, Capital=Rs.${strategyParams.capital}`);
  }

  console.log(`\nSuccessfully fed ${dates.length} calendar entries.`);
  database.close();
}

feedCalendar().catch(err => {
  console.error('Failed to feed calendar:', err);
  process.exit(1);
});
