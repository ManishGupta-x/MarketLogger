const KiteConnect = require('kiteconnect').KiteConnect;
const fs = require('fs');
require('dotenv').config();

const ZERODHA_API_KEY = "5jv2nj6si7d2tvjt";
const ZERODHA_ACCESS_TOKEN = "FyOGbzCBVsWApNFrsEA9NEKT4l7ft9qa";
const ANALYSIS_YEARS = 3;

// Advanced volatility configuration
const VOLATILITY_CONFIG = {
  ATR_PERIOD: 14,           // Average True Range period
  BOLLINGER_PERIOD: 20,     // Bollinger Bands period
  BOLLINGER_STD_DEV: 2,     // Standard deviations for Bollinger
  RECENT_WEIGHT: 0.6,       // Weight for recent 6 months (60%)
  OLDER_WEIGHT: 0.4,        // Weight for older data (40%)
  MIN_TRADING_DAYS: 600     // Minimum days for analysis
};

const kite = new KiteConnect({ api_key: ZERODHA_API_KEY });
kite.setAccessToken(ZERODHA_ACCESS_TOKEN);

function getDateRange() {
  const to = new Date();
  const from = new Date();
  from.setFullYear(from.getFullYear() - ANALYSIS_YEARS);
  
  // Calculate midpoint (6 months ago) for time-weighted analysis
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  return {
    from: from.toISOString().split('T')[0], 
    to: to.toISOString().split('T')[0],
    sixMonthsAgo: sixMonthsAgo.toISOString().split('T')[0]
  };
}

// Load pre-filtered stocks
function loadFilteredStocks(filename = 'stocks_older_than_3years.csv') {
  if (!fs.existsSync(filename)) {
    console.error(`❌ File not found: ${filename}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filename, 'utf8');
  const lines = content.split('\n').slice(1);
  
  return lines
    .filter(line => line.trim())
    .map(line => {
      const parts = line.split(',');
      return {
        symbol: parts[1],
        name: parts[2].replace(/"/g, ''),
        token: parseInt(parts[3]),
        exchange: parts[4]
      };
    });
}

// Calculate True Range (accounts for gaps)
function calculateTrueRange(current, previous) {
  if (!previous) {
    return current.high - current.low;
  }
  
  const tr1 = current.high - current.low;
  const tr2 = Math.abs(current.high - previous.close);
  const tr3 = Math.abs(current.low - previous.close);
  
  return Math.max(tr1, tr2, tr3);
}

// Calculate Average True Range (ATR)
function calculateATR(historicalData, period = 14) {
  const trueRanges = [];
  
  for (let i = 1; i < historicalData.length; i++) {
    const tr = calculateTrueRange(historicalData[i], historicalData[i - 1]);
    trueRanges.push(tr);
  }
  
  // Calculate ATR using exponential moving average
  const atrs = [];
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  atrs.push(atr);
  
  const multiplier = 1 / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (trueRanges[i] - atr) * multiplier + atr;
    atrs.push(atr);
  }
  
  return {
    current: atrs[atrs.length - 1],
    average: atrs.reduce((a, b) => a + b, 0) / atrs.length,
    max: Math.max(...atrs),
    normalized: (atrs[atrs.length - 1] / historicalData[historicalData.length - 1].close) * 100
  };
}

// Calculate Standard Deviation of Returns
function calculateReturnVolatility(historicalData) {
  const returns = [];
  
  for (let i = 1; i < historicalData.length; i++) {
    const dailyReturn = (historicalData[i].close - historicalData[i - 1].close) / historicalData[i - 1].close;
    returns.push(dailyReturn);
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  // Annualized volatility (252 trading days)
  const annualizedVol = stdDev * Math.sqrt(252) * 100;
  
  return {
    dailyStdDev: stdDev * 100,
    annualizedVol,
    returns
  };
}

// Calculate Bollinger Band Width
function calculateBollingerBandWidth(historicalData, period = 20, stdDevMultiplier = 2) {
  const bandWidths = [];
  
  for (let i = period - 1; i < historicalData.length; i++) {
    const slice = historicalData.slice(i - period + 1, i + 1);
    const closePrices = slice.map(d => d.close);
    
    const sma = closePrices.reduce((a, b) => a + b, 0) / period;
    const variance = closePrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    const upperBand = sma + (stdDev * stdDevMultiplier);
    const lowerBand = sma - (stdDev * stdDevMultiplier);
    const bandWidth = ((upperBand - lowerBand) / sma) * 100;
    
    bandWidths.push(bandWidth);
  }
  
  return {
    current: bandWidths[bandWidths.length - 1],
    average: bandWidths.reduce((a, b) => a + b, 0) / bandWidths.length,
    max: Math.max(...bandWidths)
  };
}

// Calculate gap volatility (overnight moves)
function calculateGapVolatility(historicalData) {
  const gaps = [];
  
  for (let i = 1; i < historicalData.length; i++) {
    const gap = ((historicalData[i].open - historicalData[i - 1].close) / historicalData[i - 1].close) * 100;
    gaps.push(Math.abs(gap));
  }
  
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const maxGap = Math.max(...gaps);
  const gapsOver2Percent = gaps.filter(g => g > 2).length;
  
  return {
    avgGap,
    maxGap,
    gapsOver2Percent,
    gapFrequency: (gapsOver2Percent / gaps.length) * 100
  };
}

// Time-weighted volatility (recent 6 months weighted more)
function calculateTimeWeightedVolatility(historicalData, sixMonthsAgo) {
  const sixMonthsAgoDate = new Date(sixMonthsAgo);
  
  const recentData = historicalData.filter(d => new Date(d.date) >= sixMonthsAgoDate);
  const olderData = historicalData.filter(d => new Date(d.date) < sixMonthsAgoDate);
  
  // Calculate volatility for both periods
  const recentVol = calculateReturnVolatility(recentData);
  const olderVol = olderData.length > 30 ? calculateReturnVolatility(olderData) : { annualizedVol: 0 };
  
  const weightedVol = (recentVol.annualizedVol * VOLATILITY_CONFIG.RECENT_WEIGHT) + 
                      (olderVol.annualizedVol * VOLATILITY_CONFIG.OLDER_WEIGHT);
  
  return {
    weightedVol,
    recentVol: recentVol.annualizedVol,
    olderVol: olderVol.annualizedVol,
    volatilityTrend: recentVol.annualizedVol > olderVol.annualizedVol ? 'Increasing' : 'Decreasing'
  };
}

// Detect volatility regime changes
function detectVolatilityRegimes(historicalData) {
  const windowSize = 60; // 60-day rolling volatility
  const regimes = [];
  
  for (let i = windowSize; i < historicalData.length; i += windowSize) {
    const window = historicalData.slice(i - windowSize, i);
    const vol = calculateReturnVolatility(window);
    regimes.push(vol.annualizedVol);
  }
  
  // Find periods of high volatility (>1.5x average)
  const avgRegimeVol = regimes.reduce((a, b) => a + b, 0) / regimes.length;
  const highVolRegimes = regimes.filter(v => v > avgRegimeVol * 1.5).length;
  
  return {
    avgRegimeVol,
    highVolRegimes,
    highVolRegimePercent: (highVolRegimes / regimes.length) * 100,
    currentRegime: regimes[regimes.length - 1] > avgRegimeVol * 1.5 ? 'High' : 'Normal'
  };
}

// Calculate comprehensive volatility metrics
function analyzeAdvancedVolatility(historicalData) {
  if (!historicalData || historicalData.length < VOLATILITY_CONFIG.MIN_TRADING_DAYS) {
    return null;
  }
  
  const dateRange = getDateRange();
  
  // 1. Average True Range (accounts for gaps)
  const atr = calculateATR(historicalData, VOLATILITY_CONFIG.ATR_PERIOD);
  
  // 2. Return-based volatility (traditional approach)
  const returnVol = calculateReturnVolatility(historicalData);
  
  // 3. Bollinger Band Width (squeeze/expansion indicator)
  const bbWidth = calculateBollingerBandWidth(
    historicalData, 
    VOLATILITY_CONFIG.BOLLINGER_PERIOD, 
    VOLATILITY_CONFIG.BOLLINGER_STD_DEV
  );
  
  // 4. Gap volatility (overnight risk)
  const gapVol = calculateGapVolatility(historicalData);
  
  // 5. Time-weighted volatility (recent emphasis)
  const timeWeightedVol = calculateTimeWeightedVolatility(historicalData, dateRange.sixMonthsAgo);
  
  // 6. Volatility regime detection
  const regimes = detectVolatilityRegimes(historicalData);
  
  // Calculate price statistics
  const currentPrice = historicalData[historicalData.length - 1].close;
  const openingPrice = historicalData[0].open;
  const totalReturn = ((currentPrice - openingPrice) / openingPrice) * 100;
  
  const allHighs = historicalData.map(d => d.high);
  const allLows = historicalData.map(d => d.low);
  const periodHigh = Math.max(...allHighs);
  const periodLow = Math.min(...allLows);
  const maxDrawdown = ((periodLow - periodHigh) / periodHigh) * 100;
  
  // Calculate Sharpe-like ratio (return / volatility)
  const riskAdjustedReturn = returnVol.annualizedVol > 0 ? 
    totalReturn / returnVol.annualizedVol : 0;
  
  // Composite Volatility Score (normalized 0-100)
  const compositeScore = (
    (atr.normalized * 0.25) +
    (returnVol.annualizedVol * 0.25) +
    (bbWidth.current * 0.15) +
    (gapVol.avgGap * 10 * 0.15) +
    (timeWeightedVol.weightedVol * 0.20)
  );
  
  return {
    // Price metrics
    currentPrice,
    openingPrice,
    periodHigh,
    periodLow,
    totalReturn,
    maxDrawdown,
    
    // ATR metrics
    atrValue: atr.current,
    atrNormalized: atr.normalized,
    atrMax: atr.max,
    
    // Return volatility
    dailyVolatility: returnVol.dailyStdDev,
    annualizedVolatility: returnVol.annualizedVol,
    
    // Bollinger metrics
    bollingerWidth: bbWidth.current,
    bollingerAvg: bbWidth.average,
    bollingerMax: bbWidth.max,
    
    // Gap analysis
    avgGap: gapVol.avgGap,
    maxGap: gapVol.maxGap,
    gapFrequency: gapVol.gapFrequency,
    
    // Time-weighted
    weightedVolatility: timeWeightedVol.weightedVol,
    recentVolatility: timeWeightedVol.recentVol,
    olderVolatility: timeWeightedVol.olderVol,
    volatilityTrend: timeWeightedVol.volatilityTrend,
    
    // Regime analysis
    currentRegime: regimes.currentRegime,
    highVolRegimePercent: regimes.highVolRegimePercent,
    
    // Composite metrics
    compositeVolatilityScore: compositeScore,
    riskAdjustedReturn,
    
    totalDays: historicalData.length
  };
}

// Fetch historical data with retry
async function getStockHistoricalData(instrumentToken, symbol, fromDate, toDate, retryCount = 0) {
  try {
    const historical = await kite.getHistoricalData(instrumentToken, 'day', fromDate, toDate);
    return historical;
  } catch (error) {
    if (error.message.includes('Too many requests') && retryCount < 3) {
      console.log(`   ⏸️  Rate limit for ${symbol}, waiting... (Retry ${retryCount + 1}/3)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return getStockHistoricalData(instrumentToken, symbol, fromDate, toDate, retryCount + 1);
    }
    console.log(`   ❌ ${symbol}: ${error.message.substring(0, 50)}`);
    return null;
  }
}

// Main analysis function
async function analyzeStocks(filteredStocks) {
  console.log(`\n📊 Analyzing ${filteredStocks.length} stocks with advanced metrics...`);
  console.log(`📅 Period: ${getDateRange().from} to ${getDateRange().to}\n`);
  
  const dateRange = getDateRange();
  const results = [];
  const failedStocks = [];
  
  for (let i = 0; i < filteredStocks.length; i++) {
    const stock = filteredStocks[i];
    const progress = ((i / filteredStocks.length) * 100).toFixed(1);
    
    console.log(`[${i + 1}/${filteredStocks.length}] (${progress}%) ${stock.symbol}...`);
    
    try {
      const historicalData = await getStockHistoricalData(
        stock.token,
        stock.symbol,
        dateRange.from,
        dateRange.to
      );
      
      if (historicalData && historicalData.length >= VOLATILITY_CONFIG.MIN_TRADING_DAYS) {
        const analysis = analyzeAdvancedVolatility(historicalData);
        
        if (analysis) {
          results.push({
            symbol: stock.symbol,
            name: stock.name,
            token: stock.token,
            ...analysis
          });
          console.log(`   ✅ Composite Score: ${analysis.compositeVolatilityScore.toFixed(2)} | Annualized Vol: ${analysis.annualizedVolatility.toFixed(2)}%`);
        } else {
          failedStocks.push({ symbol: stock.symbol, reason: 'Analysis failed' });
        }
      } else {
        failedStocks.push({ 
          symbol: stock.symbol, 
          reason: `Insufficient data (${historicalData ? historicalData.length : 0} days)` 
        });
      }
    } catch (error) {
      failedStocks.push({ symbol: stock.symbol, reason: error.message });
    }
    
    // Rate limiting
    if (i < filteredStocks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    if ((i + 1) % 5 === 0) {
      console.log(`\n⏸️  Cooling down... Success: ${results.length} | Failed: ${failedStocks.length}\n`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`\n✅ Complete! Analyzed: ${results.length} | Failed: ${failedStocks.length}\n`);
  
  // Sort by composite volatility score
  results.sort((a, b) => b.compositeVolatilityScore - a.compositeVolatilityScore);
  
  return { results, failedStocks };
}

// Export comprehensive CSV
function exportEnhancedCSV(results, filename = 'advanced_volatility_report.csv') {
  const headers = [
    'Rank',
    'Symbol',
    'Name',
    'Composite Volatility Score',
    'Current Price',
    '3Y Return %',
    'Max Drawdown %',
    'Annualized Volatility %',
    'ATR Normalized %',
    'Recent Vol (6M) %',
    'Older Vol %',
    'Volatility Trend',
    'Current Regime',
    'High Vol Regime %',
    'Bollinger Width %',
    'Avg Gap %',
    'Max Gap %',
    'Gap Frequency %',
    'Risk-Adjusted Return',
    'Daily Volatility %',
    'Total Days',
    'Token'
  ];
  
  const rows = results.map((s, i) => [
    i + 1,
    s.symbol,
    `"${s.name}"`,
    s.compositeVolatilityScore.toFixed(2),
    s.currentPrice.toFixed(2),
    s.totalReturn.toFixed(2),
    s.maxDrawdown.toFixed(2),
    s.annualizedVolatility.toFixed(2),
    s.atrNormalized.toFixed(2),
    s.recentVolatility.toFixed(2),
    s.olderVolatility.toFixed(2),
    s.volatilityTrend,
    s.currentRegime,
    s.highVolRegimePercent.toFixed(2),
    s.bollingerWidth.toFixed(2),
    s.avgGap.toFixed(2),
    s.maxGap.toFixed(2),
    s.gapFrequency.toFixed(2),
    s.riskAdjustedReturn.toFixed(3),
    s.dailyVolatility.toFixed(2),
    s.totalDays,
    s.token
  ].join(','));
  
  const csv = [headers.join(','), ...rows].join('\n');
  fs.writeFileSync(filename, csv);
  console.log(`✅ Exported ${results.length} stocks to ${filename}`);
}

// Display top volatile stocks
function displayTopVolatile(results, count = 20) {
  console.log('\n' + '='.repeat(140));
  console.log(`🔥 TOP ${count} MOST VOLATILE STOCKS (By Composite Score)`);
  console.log('='.repeat(140));
  console.log('Rank | Symbol       | Comp Score | Ann Vol % | Recent Vol % | ATR % | Trend      | Regime | Return %');
  console.log('-'.repeat(140));
  
  results.slice(0, count).forEach((s, i) => {
    const rank = (i + 1).toString().padStart(4);
    const symbol = s.symbol.padEnd(12);
    const compScore = s.compositeVolatilityScore.toFixed(2).padStart(10);
    const annVol = s.annualizedVolatility.toFixed(2).padStart(9);
    const recentVol = s.recentVolatility.toFixed(2).padStart(12);
    const atr = s.atrNormalized.toFixed(2).padStart(5);
    const trend = s.volatilityTrend.padEnd(10);
    const regime = s.currentRegime.padEnd(6);
    const returns = s.totalReturn.toFixed(2).padStart(8);
    
    console.log(`${rank} | ${symbol} | ${compScore} | ${annVol} | ${recentVol} | ${atr} | ${trend} | ${regime} | ${returns}`);
  });
  
  console.log('='.repeat(140) + '\n');
}

// Main execution
async function main() {
  console.log('🚀 Advanced Volatility Analyzer Starting...\n');
  
  const startTime = Date.now();
  
  try {
    const filteredStocks = loadFilteredStocks();
    const { results, failedStocks } = await analyzeStocks(filteredStocks);
    
    if (results.length === 0) {
      console.log('❌ No stocks analyzed successfully');
      process.exit(1);
    }
    
    displayTopVolatile(results, 20);
    exportEnhancedCSV(results);
    
    if (failedStocks.length > 0) {
      const failedCSV = failedStocks.map(s => `${s.symbol},"${s.reason}"`).join('\n');
      fs.writeFileSync('failed_stocks.csv', `Symbol,Reason\n${failedCSV}`);
    }
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    console.log(`✅ Completed in ${duration} minutes\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { analyzeAdvancedVolatility };