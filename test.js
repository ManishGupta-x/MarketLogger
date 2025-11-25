const KiteConnect = require('kiteconnect').KiteConnect;
require('dotenv').config();

const ZERODHA_API_KEY = "5jv2nj6si7d2tvjt";
const ZERODHA_ACCESS_TOKEN = "FyOGbzCBVsWApNFrsEA9NEKT4l7ft9qa";
const EXCHANGE = 'NSE'; 


// Initialize Kite Connect
const kite = new KiteConnect({ api_key: ZERODHA_API_KEY });
kite.setAccessToken(ZERODHA_ACCESS_TOKEN);

// Calculate date range (last 1 year)
function getDateRange() {
  const to = new Date();
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0]
  };
}

// Calculate normalized daily fluctuation percentage
function calculateNormalizedFluctuation(high, low, close) {
  if (!high || !low || !close || close === 0) return 0;
  
  // Use close price as reference (could also use (high+low)/2)
  return ((high - low) / close) * 100;
}

// Fetch historical data for a single stock
async function getStockHistoricalData(instrumentToken, fromDate, toDate) {
  try {
    const historical = await kite.getHistoricalData(
      instrumentToken,
      'day',
      fromDate,
      toDate
    );
    
    return historical;
  } catch (error) {
    console.error(`Error fetching historical data for token ${instrumentToken}:`, error.message);
    return null;
  }
}

// Analyze stock fluctuations with normalized percentage
function analyzeFluctuations(historicalData) {
  if (!historicalData || historicalData.length === 0) {
    return null;
  }
  
  // Calculate average price across the year
  const avgPrice = historicalData.reduce((sum, day) => sum + day.close, 0) / historicalData.length;
  
  const dailyFluctuations = historicalData.map(day => {
    // Normalized by closing price of that day
    const normalizedFluctuation = calculateNormalizedFluctuation(day.high, day.low, day.close);
    
    // Also calculate as percentage of average price for comparison
    const avgPriceFluctuation = ((day.high - day.low) / avgPrice) * 100;
    
    return {
      date: day.date,
      high: day.high,
      low: day.low,
      close: day.close,
      open: day.open,
      normalizedFluctuation: normalizedFluctuation,
      avgPriceFluctuation: avgPriceFluctuation,
      absoluteRange: day.high - day.low
    };
  });
  
  // Calculate statistics
  const normalizedValues = dailyFluctuations.map(d => d.normalizedFluctuation);
  const avgPriceValues = dailyFluctuations.map(d => d.avgPriceFluctuation);
  
  const maxNormalizedFluctuation = Math.max(...normalizedValues);
  const minNormalizedFluctuation = Math.min(...normalizedValues);
  const avgNormalizedFluctuation = normalizedValues.reduce((a, b) => a + b, 0) / normalizedValues.length;
  
  const maxAvgPriceFluctuation = Math.max(...avgPriceValues);
  const avgAvgPriceFluctuation = avgPriceValues.reduce((a, b) => a + b, 0) / avgPriceValues.length;
  
  // Find max fluctuation day
  const maxFluctuationDay = dailyFluctuations.find(d => d.normalizedFluctuation === maxNormalizedFluctuation);
  
  // Calculate overall price range
  const allHighs = historicalData.map(d => d.high);
  const allLows = historicalData.map(d => d.low);
  const yearHigh = Math.max(...allHighs);
  const yearLow = Math.min(...allLows);
  const yearlyRangePercent = ((yearHigh - yearLow) / avgPrice) * 100;
  
  // Current price
  const currentPrice = historicalData[historicalData.length - 1].close;
  
  return {
    dailyFluctuations,
    maxNormalizedFluctuation,
    minNormalizedFluctuation,
    avgNormalizedFluctuation,
    maxAvgPriceFluctuation,
    avgAvgPriceFluctuation,
    maxFluctuationDay,
    yearHigh,
    yearLow,
    yearlyRangePercent,
    avgPrice,
    currentPrice,
    totalDays: historicalData.length
  };
}

// Main function
async function analyzeAllStocks() {
  try {
    console.log(`🔍 Fetching all instruments from ${EXCHANGE}...`);
    
    const instruments = await kite.getInstruments(EXCHANGE);
    
    // Filter only equity stocks
    const stocks = instruments.filter(inst => {
      if (!inst.tradingsymbol) return false;
      
      const symbol = inst.tradingsymbol.toUpperCase();
      const name = inst.name ? inst.name.toUpperCase() : '';
      
      const isBond = symbol.includes('BOND') || 
                     symbol.includes('GB') || 
                     symbol.includes('SDL') || 
                     symbol.includes('T-BILL') ||
                     name.includes('BOND') ||
                     name.includes('GOVERNMENT') ||
                     name.includes('TREASURY');
      
      const isEquity = inst.instrument_type === 'EQ' || inst.segment === 'NSE';
      
      return isEquity && !isBond;
    });
    
    console.log(`📊 Found ${stocks.length} stocks in ${EXCHANGE}`);
    
    const dateRange = getDateRange();
    console.log(`📅 Analyzing data from ${dateRange.from} to ${dateRange.to}\n`);
    
    const results = [];
    let processedCount = 0;
    let failedCount = 0;
    
    // Process stocks one by one (with rate limiting)
    for (const stock of stocks) {
      processedCount++;
      
      if (processedCount % 10 === 0) {
        console.log(`⏳ Processing ${processedCount}/${stocks.length} stocks... (Failed: ${failedCount})`);
      }
      
      const historicalData = await getStockHistoricalData(
        stock.instrument_token,
        dateRange.from,
        dateRange.to
      );
      
      if (historicalData && historicalData.length > 0) {
        const analysis = analyzeFluctuations(historicalData);
        
        if (analysis) {
          results.push({
            symbol: stock.tradingsymbol,
            name: stock.name || stock.tradingsymbol,
            token: stock.instrument_token,
            ...analysis
          });
        } else {
          failedCount++;
        }
      } else {
        failedCount++;
      }
      
      // Rate limiting: 3 requests per second (Zerodha limit)
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    
    console.log(`\n✅ Successfully analyzed ${results.length} stocks (Failed: ${failedCount})\n`);
    
    // Sort by average normalized fluctuation (better indicator of overall volatility)
    results.sort((a, b) => b.avgNormalizedFluctuation - a.avgNormalizedFluctuation);
    
    return results;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Display all stocks with normalized fluctuations
function displayAllStocksReport(results) {
  const timestamp = new Date().toLocaleString('en-IN', { 
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'short'
  });
  
  console.log('\n' + '='.repeat(120));
  console.log(`📊 COMPLETE NSE STOCK FLUCTUATION REPORT (NORMALIZED %)`);
  console.log(`🕐 ${timestamp}`);
  console.log(`📈 Total Stocks: ${results.length}`);
  console.log('='.repeat(120));
  console.log('Rank | Symbol              | Avg Price | Current | Max Day Δ% | Avg Day Δ% | Year Range% | Volatility');
  console.log('-'.repeat(120));
  
  results.forEach((stock, index) => {
    const rank = (index + 1).toString().padStart(4);
    const symbol = stock.symbol.padEnd(19);
    const avgPrice = `₹${stock.avgPrice.toFixed(2)}`.padStart(10);
    const currentPrice = `₹${stock.currentPrice.toFixed(2)}`.padStart(10);
    const maxFluc = stock.maxNormalizedFluctuation.toFixed(2).padStart(9);
    const avgFluc = stock.avgNormalizedFluctuation.toFixed(2).padStart(9);
    const yearlyRange = stock.yearlyRangePercent.toFixed(2).padStart(10);
    
    // Volatility rating
    let volatility = '🟢 Low';
    if (stock.avgNormalizedFluctuation > 5) volatility = '🟡 High';
    if (stock.avgNormalizedFluctuation > 10) volatility = '🔴 Extreme';
    
    console.log(`${rank} | ${symbol} | ${avgPrice} | ${currentPrice} | ${maxFluc}% | ${avgFluc}% | ${yearlyRange}% | ${volatility}`);
  });
  
  console.log('='.repeat(120) + '\n');
}

// Display top volatile stocks
function displayTopVolatileStocks(results, topN = 100) {
  console.log('\n' + '='.repeat(120));
  console.log(`🔥 TOP ${topN} MOST VOLATILE STOCKS (By Average Daily Fluctuation %)`);
  console.log('='.repeat(120));
  console.log('Rank | Symbol              | Avg Price | Max Day Δ% | Avg Day Δ% | Year Range% | Days Analyzed');
  console.log('-'.repeat(120));
  
  const topStocks = results.slice(0, topN);
  
  topStocks.forEach((stock, index) => {
    const rank = (index + 1).toString().padStart(4);
    const symbol = stock.symbol.padEnd(19);
    const avgPrice = `₹${stock.avgPrice.toFixed(2)}`.padStart(10);
    const maxFluc = stock.maxNormalizedFluctuation.toFixed(2).padStart(9);
    const avgFluc = stock.avgNormalizedFluctuation.toFixed(2).padStart(9);
    const yearlyRange = stock.yearlyRangePercent.toFixed(2).padStart(10);
    const days = stock.totalDays.toString().padStart(13);
    
    console.log(`${rank} | ${symbol} | ${avgPrice} | ${maxFluc}% | ${avgFluc}% | ${yearlyRange}% | ${days}`);
  });
  
  console.log('='.repeat(120) + '\n');
}

// Export comprehensive CSV with all stocks
function exportComprehensiveCSV(results, filename = 'all_stocks_fluctuation_report.csv') {
  const fs = require('fs');
  
  const csv = [
    'Rank,Symbol,Name,Average Price,Current Price,Max Daily Fluctuation %,Min Daily Fluctuation %,Avg Daily Fluctuation %,Year High,Year Low,Yearly Range %,Total Days,Token',
    ...results.map((stock, index) => 
      `${index + 1},${stock.symbol},"${stock.name}",${stock.avgPrice.toFixed(2)},${stock.currentPrice.toFixed(2)},${stock.maxNormalizedFluctuation.toFixed(2)},${stock.minNormalizedFluctuation.toFixed(2)},${stock.avgNormalizedFluctuation.toFixed(2)},${stock.yearHigh.toFixed(2)},${stock.yearLow.toFixed(2)},${stock.yearlyRangePercent.toFixed(2)},${stock.totalDays},${stock.token}`
    )
  ].join('\n');
  
  fs.writeFileSync(filename, csv);
  console.log(`✅ Exported complete report with ${results.length} stocks to ${filename}`);
}

// Export daily fluctuations for all stocks (large file)
function exportAllDailyFluctuations(results, filename = 'all_daily_fluctuations.csv') {
  const fs = require('fs');
  
  const rows = ['Symbol,Date,Open,High,Low,Close,Normalized Fluctuation %,Absolute Range'];
  
  results.forEach(stock => {
    stock.dailyFluctuations.forEach(day => {
      rows.push(`${stock.symbol},${day.date},${day.open},${day.high},${day.low},${day.close},${day.normalizedFluctuation.toFixed(2)},${day.absoluteRange.toFixed(2)}`);
    });
  });
  
  fs.writeFileSync(filename, rows.join('\n'));
  console.log(`✅ Exported all daily fluctuations to ${filename} (${rows.length - 1} records)`);
}

// Display summary statistics
function displaySummary(results) {
  const allMaxFluctuations = results.map(r => r.maxNormalizedFluctuation);
  const allAvgFluctuations = results.map(r => r.avgNormalizedFluctuation);
  
  const overallMaxFluctuation = Math.max(...allMaxFluctuations);
  const overallAvgFluctuation = allAvgFluctuations.reduce((a, b) => a + b, 0) / allAvgFluctuations.length;
  
  const mostVolatile = results[0];
  const leastVolatile = results[results.length - 1];
  
  // Categorize stocks by volatility
  const extreme = results.filter(r => r.avgNormalizedFluctuation > 10).length;
  const high = results.filter(r => r.avgNormalizedFluctuation > 5 && r.avgNormalizedFluctuation <= 10).length;
  const moderate = results.filter(r => r.avgNormalizedFluctuation > 2 && r.avgNormalizedFluctuation <= 5).length;
  const low = results.filter(r => r.avgNormalizedFluctuation <= 2).length;
  
  console.log('\n📈 SUMMARY STATISTICS (Normalized Fluctuation %)');
  console.log('='.repeat(80));
  console.log(`Total Stocks Analyzed: ${results.length}`);
  console.log(`Overall Maximum Daily Fluctuation: ${overallMaxFluctuation.toFixed(2)}%`);
  console.log(`Overall Average Daily Fluctuation: ${overallAvgFluctuation.toFixed(2)}%`);
  
  console.log(`\n📊 Volatility Distribution:`);
  console.log(`  🔴 Extreme (>10%): ${extreme} stocks`);
  console.log(`  🟡 High (5-10%): ${high} stocks`);
  console.log(`  🟠 Moderate (2-5%): ${moderate} stocks`);
  console.log(`  🟢 Low (<2%): ${low} stocks`);
  
  console.log(`\n🔥 Most Volatile Stock: ${mostVolatile.symbol} (${mostVolatile.name})`);
  console.log(`  - Average Price: ₹${mostVolatile.avgPrice.toFixed(2)}`);
  console.log(`  - Max Daily Fluctuation: ${mostVolatile.maxNormalizedFluctuation.toFixed(2)}%`);
  console.log(`  - Avg Daily Fluctuation: ${mostVolatile.avgNormalizedFluctuation.toFixed(2)}%`);
  console.log(`  - Yearly Range: ${mostVolatile.yearlyRangePercent.toFixed(2)}%`);
  
  console.log(`\n🛡️  Least Volatile Stock: ${leastVolatile.symbol} (${leastVolatile.name})`);
  console.log(`  - Average Price: ₹${leastVolatile.avgPrice.toFixed(2)}`);
  console.log(`  - Max Daily Fluctuation: ${leastVolatile.maxNormalizedFluctuation.toFixed(2)}%`);
  console.log(`  - Avg Daily Fluctuation: ${leastVolatile.avgNormalizedFluctuation.toFixed(2)}%`);
  console.log(`  - Yearly Range: ${leastVolatile.yearlyRangePercent.toFixed(2)}%`);
  
  console.log('='.repeat(80) + '\n');
}

// Main execution
async function main() {
  console.log('🚀 Starting NSE Stock Fluctuation Analyzer (Normalized %)...\n');
  console.log('⚠️  This will take significant time due to API rate limits');
  console.log('⏱️  Estimated time: 15-20 minutes for ~2000 stocks\n');
  
  const startTime = Date.now();
  
  try {
    const results = await analyzeAllStocks();
    
    // Display summary
    displaySummary(results);
    
    // Display top 100 volatile stocks
    displayTopVolatileStocks(results, 100);
    
    // Display complete report (optional - can be very long)
    console.log('💾 Generating complete report in CSV format...\n');
    
    // Export to CSV files
    exportComprehensiveCSV(results);
    exportAllDailyFluctuations(results);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);
    
    console.log(`\n✅ Analysis completed in ${duration} minutes!`);
    console.log(`📂 Files generated:`);
    console.log(`   1. all_stocks_fluctuation_report.csv - Summary of all ${results.length} stocks`);
    console.log(`   2. all_daily_fluctuations.csv - Daily data for all stocks`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { 
  analyzeAllStocks, 
  displayAllStocksReport,
  displayTopVolatileStocks,
  exportComprehensiveCSV,
  exportAllDailyFluctuations 
};