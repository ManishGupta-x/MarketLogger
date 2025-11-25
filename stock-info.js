const KiteConnect = require('kiteconnect').KiteConnect;
const readline = require('readline');
require('dotenv').config();

const ZERODHA_API_KEY = "5jv2nj6si7d2tvjt";
const ZERODHA_ACCESS_TOKEN = "0fg1RHOZ2OMnU0iAowM2x9gmQdoHly2o";

// Initialize Kite Connect
const kite = new KiteConnect({ api_key: ZERODHA_API_KEY });
kite.setAccessToken(ZERODHA_ACCESS_TOKEN);

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Cache for instruments (loaded once)
let instrumentsCache = null;

// Format date helper
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Load all instruments
async function loadInstruments() {
  if (instrumentsCache) return instrumentsCache;
  
  console.log('📥 Loading instruments database...');
  const exchanges = ['NSE', 'BSE'];
  let allInstruments = [];
  
  for (const exchange of exchanges) {
    try {
      const instruments = await kite.getInstruments(exchange);
      allInstruments = allInstruments.concat(instruments.map(inst => ({
        ...inst,
        exchange: exchange
      })));
    } catch (error) {
      console.error(`⚠️  Could not load ${exchange} instruments:`, error.message);
    }
  }
  
  instrumentsCache = allInstruments;
  console.log(`✅ Loaded ${allInstruments.length} instruments\n`);
  return allInstruments;
}

// Search for stock
function searchStock(query, instruments) {
  const searchTerm = query.toUpperCase().trim();
  
  // Find exact matches first
  const exactMatches = instruments.filter(inst => 
    inst.tradingsymbol && inst.tradingsymbol.toUpperCase() === searchTerm
  );
  
  if (exactMatches.length > 0) {
    return exactMatches;
  }
  
  // Find partial matches
  const partialMatches = instruments.filter(inst => {
    if (!inst.tradingsymbol) return false;
    const symbol = inst.tradingsymbol.toUpperCase();
    const name = inst.name ? inst.name.toUpperCase() : '';
    return symbol.includes(searchTerm) || name.includes(searchTerm);
  });
  
  return partialMatches.slice(0, 10); // Limit to 10 results
}

// Get historical data for highs and lows
async function getHistoricalData(instrument) {
  try {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear() - 1); // 1 year back
    
    const historicalData = await kite.getHistoricalData(
      instrument.instrument_token,
      'day',
      fromDate.toISOString().split('T')[0],
      toDate.toISOString().split('T')[0]
    );
    
    return historicalData;
  } catch (error) {
    console.log('   ⚠️  Historical data not available');
    return null;
  }
}

// Calculate highs and lows for different periods
function calculateRanges(historicalData) {
  if (!historicalData || historicalData.length === 0) {
    return null;
  }
  
  const now = new Date();
  const ranges = {
    week: { high: 0, low: Infinity, highDate: null, lowDate: null },
    month: { high: 0, low: Infinity, highDate: null, lowDate: null },
    threeMonth: { high: 0, low: Infinity, highDate: null, lowDate: null },
    sixMonth: { high: 0, low: Infinity, highDate: null, lowDate: null },
    year: { high: 0, low: Infinity, highDate: null, lowDate: null },
    allTime: { high: 0, low: Infinity, highDate: null, lowDate: null }
  };
  
  historicalData.forEach(candle => {
    const candleDate = new Date(candle.date);
    const daysDiff = Math.floor((now - candleDate) / (1000 * 60 * 60 * 24));
    
    // All time
    if (candle.high > ranges.allTime.high) {
      ranges.allTime.high = candle.high;
      ranges.allTime.highDate = candle.date;
    }
    if (candle.low < ranges.allTime.low) {
      ranges.allTime.low = candle.low;
      ranges.allTime.lowDate = candle.date;
    }
    
    // Year
    if (daysDiff <= 365) {
      if (candle.high > ranges.year.high) {
        ranges.year.high = candle.high;
        ranges.year.highDate = candle.date;
      }
      if (candle.low < ranges.year.low) {
        ranges.year.low = candle.low;
        ranges.year.lowDate = candle.date;
      }
    }
    
    // 6 months
    if (daysDiff <= 180) {
      if (candle.high > ranges.sixMonth.high) {
        ranges.sixMonth.high = candle.high;
        ranges.sixMonth.highDate = candle.date;
      }
      if (candle.low < ranges.sixMonth.low) {
        ranges.sixMonth.low = candle.low;
        ranges.sixMonth.lowDate = candle.date;
      }
    }
    
    // 3 months
    if (daysDiff <= 90) {
      if (candle.high > ranges.threeMonth.high) {
        ranges.threeMonth.high = candle.high;
        ranges.threeMonth.highDate = candle.date;
      }
      if (candle.low < ranges.threeMonth.low) {
        ranges.threeMonth.low = candle.low;
        ranges.threeMonth.lowDate = candle.date;
      }
    }
    
    // Month
    if (daysDiff <= 30) {
      if (candle.high > ranges.month.high) {
        ranges.month.high = candle.high;
        ranges.month.highDate = candle.date;
      }
      if (candle.low < ranges.month.low) {
        ranges.month.low = candle.low;
        ranges.month.lowDate = candle.date;
      }
    }
    
    // Week
    if (daysDiff <= 7) {
      if (candle.high > ranges.week.high) {
        ranges.week.high = candle.high;
        ranges.week.highDate = candle.date;
      }
      if (candle.low < ranges.week.low) {
        ranges.week.low = candle.low;
        ranges.week.lowDate = candle.date;
      }
    }
  });
  
  return ranges;
}

// Get full stock info
async function getStockInfo(instrument) {
  try {
    const symbol = `${instrument.exchange}:${instrument.tradingsymbol}`;
    
    // Get quote data
    const quote = await kite.getQuote([symbol]);
    const data = quote[symbol];
    
    if (!data) {
      throw new Error('No data available');
    }
    
    // Get OHLC data
    const ohlc = data.ohlc || {};
    
    // Get historical data for ranges
    console.log('📊 Fetching historical data...');
    const historicalData = await getHistoricalData(instrument);
    const ranges = calculateRanges(historicalData);
    
    // Display full information
    console.log('\n' + '='.repeat(70));
    console.log(`📊 STOCK INFORMATION`);
    console.log('='.repeat(70));
    
    console.log(`\n🏢 BASIC INFO:`);
    console.log(`   Symbol:           ${instrument.tradingsymbol}`);
    console.log(`   Company Name:     ${instrument.name || 'N/A'}`);
    console.log(`   Exchange:         ${instrument.exchange}`);
    console.log(`   Instrument Type:  ${instrument.instrument_type || 'N/A'}`);
    console.log(`   Segment:          ${instrument.segment || 'N/A'}`);
    console.log(`   ISIN:             ${instrument.isin || 'N/A'}`);
    
    console.log(`\n💰 CURRENT PRICE:`);
    console.log(`   Last Price:       ₹${data.last_price?.toFixed(2) || 'N/A'}`);
    console.log(`   Change:           ₹${((data.last_price || 0) - (ohlc.close || 0)).toFixed(2)}`);
    console.log(`   Change %:         ${(((data.last_price || 0) - (ohlc.close || 0)) / (ohlc.close || 1) * 100).toFixed(2)}%`);
    
    console.log(`\n📈 DAY'S RANGE:`);
    console.log(`   Open:             ₹${ohlc.open?.toFixed(2) || 'N/A'}`);
    console.log(`   High:             ₹${ohlc.high?.toFixed(2) || 'N/A'}`);
    console.log(`   Low:              ₹${ohlc.low?.toFixed(2) || 'N/A'}`);
    console.log(`   Previous Close:   ₹${ohlc.close?.toFixed(2) || 'N/A'}`);
    
    console.log(`\n📊 TRADING DATA:`);
    console.log(`   Volume:           ${data.volume?.toLocaleString('en-IN') || 'N/A'}`);
    console.log(`   Average Price:    ₹${data.average_price?.toFixed(2) || 'N/A'}`);
    console.log(`   Total Buy Qty:    ${data.buy_quantity?.toLocaleString('en-IN') || 'N/A'}`);
    console.log(`   Total Sell Qty:   ${data.sell_quantity?.toLocaleString('en-IN') || 'N/A'}`);
    
    console.log(`\n💹 PRICE LIMITS:`);
    console.log(`   Upper Circuit:    ₹${data.upper_circuit_limit?.toFixed(2) || 'N/A'}`);
    console.log(`   Lower Circuit:    ₹${data.lower_circuit_limit?.toFixed(2) || 'N/A'}`);
    
    // Display 52-week high/low from quote data
    if (data.ohlc) {
      console.log(`\n📅 52-WEEK RANGE:`);
      console.log(`   52-Week High:     ₹${data.ohlc.high?.toFixed(2) || 'N/A'}`);
      console.log(`   52-Week Low:      ₹${data.ohlc.low?.toFixed(2) || 'N/A'}`);
    }
    
    // Display historical ranges
    if (ranges) {
      console.log(`\n📈 HISTORICAL HIGHS & LOWS:`);
      console.log(`\n   1 WEEK:`);
      console.log(`   High: ₹${ranges.week.high.toFixed(2)} (${formatDate(ranges.week.highDate)})`);
      console.log(`   Low:  ₹${ranges.week.low.toFixed(2)} (${formatDate(ranges.week.lowDate)})`);
      
      console.log(`\n   1 MONTH:`);
      console.log(`   High: ₹${ranges.month.high.toFixed(2)} (${formatDate(ranges.month.highDate)})`);
      console.log(`   Low:  ₹${ranges.month.low.toFixed(2)} (${formatDate(ranges.month.lowDate)})`);
      
      console.log(`\n   3 MONTHS:`);
      console.log(`   High: ₹${ranges.threeMonth.high.toFixed(2)} (${formatDate(ranges.threeMonth.highDate)})`);
      console.log(`   Low:  ₹${ranges.threeMonth.low.toFixed(2)} (${formatDate(ranges.threeMonth.lowDate)})`);
      
      console.log(`\n   6 MONTHS:`);
      console.log(`   High: ₹${ranges.sixMonth.high.toFixed(2)} (${formatDate(ranges.sixMonth.highDate)})`);
      console.log(`   Low:  ₹${ranges.sixMonth.low.toFixed(2)} (${formatDate(ranges.sixMonth.lowDate)})`);
      
      console.log(`\n   1 YEAR:`);
      console.log(`   High: ₹${ranges.year.high.toFixed(2)} (${formatDate(ranges.year.highDate)})`);
      console.log(`   Low:  ₹${ranges.year.low.toFixed(2)} (${formatDate(ranges.year.lowDate)})`);
      
      console.log(`\n   ALL TIME (Available Data):`);
      console.log(`   High: ₹${ranges.allTime.high.toFixed(2)} (${formatDate(ranges.allTime.highDate)})`);
      console.log(`   Low:  ₹${ranges.allTime.low.toFixed(2)} (${formatDate(ranges.allTime.lowDate)})`);
    };
    
    if (data.depth && data.depth.buy && data.depth.buy.length > 0) {
      console.log(`\n📉 MARKET DEPTH (Top 5):`);
      console.log(`\n   BUY ORDERS:`);
      console.log(`   ${'Price'.padEnd(12)} ${'Qty'.padEnd(12)} Orders`);
      data.depth.buy.slice(0, 5).forEach(order => {
        console.log(`   ₹${order.price.toFixed(2).padEnd(10)} ${order.quantity.toString().padEnd(12)} ${order.orders}`);
      });
      
      console.log(`\n   SELL ORDERS:`);
      console.log(`   ${'Price'.padEnd(12)} ${'Qty'.padEnd(12)} Orders`);
      data.depth.sell.slice(0, 5).forEach(order => {
        console.log(`   ₹${order.price.toFixed(2).padEnd(10)} ${order.quantity.toString().padEnd(12)} ${order.orders}`);
      });
    }
    
    console.log(`\n⏰ LAST UPDATED:`);
    console.log(`   Timestamp:        ${data.last_trade_time || 'N/A'}`);
    
    console.log('\n' + '='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('❌ Error fetching stock info:', error.message);
  }
}

// Main prompt loop
async function promptUser(instruments) {
  rl.question('🔍 Enter stock symbol or name (or "exit" to quit): ', async (input) => {
    const query = input.trim();
    
    if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
      console.log('👋 Goodbye!');
      rl.close();
      process.exit(0);
      return;
    }
    
    if (!query) {
      console.log('⚠️  Please enter a stock name or symbol\n');
      promptUser(instruments);
      return;
    }
    
    // Search for stock
    const matches = searchStock(query, instruments);
    
    if (matches.length === 0) {
      console.log(`❌ No stocks found matching "${query}"\n`);
      promptUser(instruments);
      return;
    }
    
    if (matches.length === 1) {
      // Single match - show info directly
      await getStockInfo(matches[0]);
      promptUser(instruments);
      return;
    }
    
    // Multiple matches - let user choose
    console.log(`\n📋 Found ${matches.length} matches:\n`);
    matches.forEach((stock, index) => {
      console.log(`   ${index + 1}. ${stock.tradingsymbol.padEnd(20)} - ${stock.name || 'N/A'} (${stock.exchange})`);
    });
    
    rl.question('\n👉 Select number (or press Enter to search again): ', async (choice) => {
      const index = parseInt(choice) - 1;
      
      if (index >= 0 && index < matches.length) {
        await getStockInfo(matches[index]);
      } else if (choice.trim() !== '') {
        console.log('⚠️  Invalid selection\n');
      }
      
      promptUser(instruments);
    });
  });
}

// Main function
async function main() {
  console.clear();
  console.log('='.repeat(70));
  console.log('📈 STOCK INFO CLI TOOL');
  console.log('='.repeat(70));
  console.log('Get real-time information about any stock');
  console.log('Type "exit" or "quit" to close the application');
  console.log('='.repeat(70) + '\n');
  
  try {
    const instruments = await loadInstruments();
    promptUser(instruments);
    
  } catch (error) {
    console.error('❌ Failed to initialize:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { getStockInfo, searchStock };