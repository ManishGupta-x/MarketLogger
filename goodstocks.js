const DISCORD_TOKEN = "MTQyNDM1NzQxNDQ1MDIzNzQ0Mw.Gv5juC.Do2cnwKdWmyoAGkVFkplksyN6CMMZL2fYOKxWA"
const DISCORD_CHANNEL_ID = '1425771179175706685';
const ZERODHA_API_KEY = "5jv2nj6si7d2tvjt";
const ZERODHA_ACCESS_TOKEN = "hDwCCgK3QzdHgGbddg7WG9AzK2Ltje2m";
const EXCHANGE = 'NSE';

const { Client, GatewayIntentBits } = require('discord.js');
const { KiteConnect } = require('kiteconnect');
const fs = require('fs');
const path = require('path');

class Logger {
  static info(msg) {
    console.log(`[INFO] ${new Date().toISOString()} - ${msg}`);
  }
  
  static error(msg, err) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, err || '');
  }
  
  static warn(msg) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`);
  }
}

class DiscordService {
  constructor() {
    this.client = null;
    this.channel = null;
    this.isReady = false;
  }

  async initialize() {
    if (!DISCORD_TOKEN || !DISCORD_CHANNEL_ID) {
      Logger.warn('Discord credentials not provided, skipping Discord integration');
      return false;
    }

    return new Promise((resolve) => {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent
        ]
      });

      this.client.once('ready', () => {
        this.channel = this.client.channels.cache.get(DISCORD_CHANNEL_ID);
        this.isReady = true;
        Logger.info(`Discord bot logged in as ${this.client.user.tag}`);
        resolve(true);
      });

      this.client.on('error', (error) => {
        Logger.error('Discord error:', error);
      });

      this.client.login(DISCORD_TOKEN).catch(err => {
        Logger.error('Discord login failed:', err);
        resolve(false);
      });
    });
  }

  async sendMessage(message) {
    if (!this.isReady || !this.channel) {
      Logger.warn('Discord not ready, skipping message');
      return false;
    }

    try {
      await this.channel.send(message);
      return true;
    } catch (error) {
      Logger.error('Failed to send Discord message:', error);
      return false;
    }
  }

  disconnect() {
    if (this.client) {
      this.client.destroy();
    }
  }
}

class ZerodhaService {
  constructor() {
    this.kite = null;
    this.isConnected = false;
  }

  async initialize() {
    try {
      this.kite = new KiteConnect({
        api_key: ZERODHA_API_KEY
      });
      
      this.kite.setAccessToken(ZERODHA_ACCESS_TOKEN);
      
      const profile = await this.kite.getProfile();
      this.isConnected = true;
      Logger.info(`✅ Connected to Zerodha: ${profile.user_name}`);
      
      return true;
    } catch (error) {
      this.isConnected = false;
      Logger.error('❌ Zerodha connection error:', error);
      return false;
    }
  }

  async getInstruments(exchange = EXCHANGE) {
    if (!this.isConnected) {
      throw new Error('Zerodha not connected');
    }
    return await this.kite.getInstruments(exchange);
  }

  async getQuote(symbols) {
    if (!this.isConnected) {
      throw new Error('Zerodha not connected');
    }
    return await this.kite.getQuote(symbols);
  }
}

class GoodStocksFilter {
  constructor() {
    this.zerodha = new ZerodhaService();
    this.discord = new DiscordService();
    this.instruments = [];
    this.stockQuotes = new Map();
    this.filteredStocks = [];
  }

  async initialize() {
    try {
      Logger.info('🔧 Initializing Good Stocks Filter...');
      
      await this.discord.initialize();
      
      const connected = await this.zerodha.initialize();
      if (!connected) {
        throw new Error('Failed to connect to Zerodha');
      }

      Logger.info(`📥 Loading ${EXCHANGE} instruments...`);
      this.instruments = await this.zerodha.getInstruments(EXCHANGE);
      Logger.info(`✅ Loaded ${this.instruments.length} ${EXCHANGE} instruments`);

      await this.discord.sendMessage(
        `🚀 **Good Stocks Filter Started**\n` +
        `Exchange: ${EXCHANGE}\n` +
        `Total Instruments: ${this.instruments.length}`
      );

      return true;
    } catch (error) {
      Logger.error('❌ Initialization failed:', error);
      return false;
    }
  }

  filterByBasicCriteria() {
    Logger.info('🔍 Filtering stocks by basic criteria...');
    
    const equityStocks = this.instruments.filter(inst => {
      return (
        inst.segment === EXCHANGE &&
        inst.instrument_type === 'EQ' &&
        !inst.tradingsymbol.includes('-') &&
        !inst.tradingsymbol.startsWith('NIFTY') &&
        !inst.tradingsymbol.startsWith('INDIA') &&
        inst.lot_size === 1 &&
        inst.tick_size === 0.05
      );
    });

    Logger.info(`✅ Filtered to ${equityStocks.length} equity stocks`);
    return equityStocks;
  }

  async fetchMarketData(stocks, batchSize = 200) {
    Logger.info('📊 Fetching market data with historical volume...');
    
    const symbols = stocks.map(s => `${EXCHANGE}:${s.tradingsymbol}`);
    const totalBatches = Math.ceil(symbols.length / batchSize);
    let processedCount = 0;

    Logger.info('📥 Step 1: Fetching current price quotes...');
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      
      try {
        Logger.info(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} stocks)...`);
        
        const quotes = await this.zerodha.getQuote(batch);
        
        for (const [symbol, quote] of Object.entries(quotes)) {
          if (quote && quote.last_price) {
            this.stockQuotes.set(symbol, quote);
            processedCount++;
          }
        }

        if (i + batchSize < symbols.length) {
          await this.delay(1000);
        }

      } catch (error) {
        Logger.error(`❌ Error fetching batch ${batchNum}:`, error.message);
      }
    }

    Logger.info(`✅ Fetched quotes for ${processedCount} stocks`);

    Logger.info('📈 Step 2: Fetching historical volume data (last 5 trading days)...');
    
    const { fromDate, toDate } = this.getLastWeekDates();
    Logger.info(`📅 Date range: ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);
    
    let historicalCount = 0;
    const historicalBatchSize = 50;
    
    for (let i = 0; i < stocks.length; i += historicalBatchSize) {
      const batch = stocks.slice(i, i + historicalBatchSize);
      const batchNum = Math.floor(i / historicalBatchSize) + 1;
      const totalHistBatches = Math.ceil(stocks.length / historicalBatchSize);
      
      Logger.info(`📊 Historical batch ${batchNum}/${totalHistBatches}...`);
      
      for (const stock of batch) {
        try {
          const symbol = `${EXCHANGE}:${stock.tradingsymbol}`;
          const quote = this.stockQuotes.get(symbol);
          
          if (!quote) continue;
          
          const historicalData = await this.zerodha.kite.getHistoricalData(
            stock.instrument_token,
            'day',
            fromDate,
            toDate
          );
          
          if (historicalData && historicalData.length > 0) {
            const avgVolume = historicalData.reduce((sum, candle) => sum + (candle.volume || 0), 0) / historicalData.length;
            
            const avgTurnover = historicalData.reduce((sum, candle) => {
              const turnover = (candle.volume || 0) * (candle.close || 0);
              return sum + turnover;
            }, 0) / historicalData.length;
            
            const maxVolume = Math.max(...historicalData.map(c => c.volume || 0));
            
            quote.historical_avg_volume = avgVolume;
            quote.historical_max_volume = maxVolume;
            quote.historical_avg_turnover = avgTurnover;
            quote.volume = quote.volume || avgVolume;
            
            this.stockQuotes.set(symbol, quote);
            historicalCount++;
          }
          
          await this.delay(100);
          
        } catch (error) {
          if (!error.message.includes('rate limit')) {
            Logger.warn(`⚠️ Skipping ${stock.tradingsymbol}: ${error.message}`);
          }
        }
      }
      
      await this.delay(2000);
    }

    Logger.info(`✅ Successfully enriched ${historicalCount} stocks with historical data`);
    
    await this.discord.sendMessage(
      `📊 **Market Data Fetched**\n` +
      `Current Quotes: ${processedCount} stocks\n` +
      `Historical Data: ${historicalCount} stocks\n` +
      `Date Range: Last 5 trading days`
    );
    
    return processedCount;
  }

  getLastWeekDates() {
    const toDate = new Date();
    const fromDate = new Date();
    
    fromDate.setDate(toDate.getDate() - 7);
    
    toDate.setHours(0, 0, 0, 0);
    fromDate.setHours(0, 0, 0, 0);
    
    return { fromDate, toDate };
  }

  analyzeStocks() {
    Logger.info('🧮 Analyzing stocks with fundamentals...');
    
    const analyzed = [];

    for (const [symbol, quote] of this.stockQuotes.entries()) {
      try {
        const analysis = this.calculateMetrics(symbol, quote);
        if (analysis.score > 0) {
          analyzed.push(analysis);
        }
      } catch (error) {
        Logger.error(`Error analyzing ${symbol}:`, error.message);
      }
    }

    Logger.info(`✅ Analyzed ${analyzed.length} stocks`);
    return analyzed;
  }

  calculateMetrics(symbol, quote) {
    const tradingsymbol = symbol.replace(`${EXCHANGE}:`, '');
    
    const volume = quote.volume || quote.historical_avg_volume || 0;
    const avgPrice = quote.average_price || quote.last_price || 0;
    const turnover = quote.historical_avg_turnover || (volume * avgPrice);
    
    const open = quote.ohlc?.open || 0;
    const high = quote.ohlc?.high || 0;
    const low = quote.ohlc?.low || 0;
    const close = quote.ohlc?.close || 0;
    const lastPrice = quote.last_price || 0;
    
    const priceChange = lastPrice - close;
    const priceChangePercent = close > 0 ? (priceChange / close) * 100 : 0;
    
    const dayRange = high - low;
    const volatility = close > 0 ? (dayRange / close) * 100 : 0;
    
    const buyQty = quote.depth?.buy?.reduce((sum, bid) => sum + bid.quantity, 0) || 0;
    const sellQty = quote.depth?.sell?.reduce((sum, ask) => sum + ask.quantity, 0) || 0;
    const totalDepth = buyQty + sellQty;
    
    const oi = quote.oi || 0;
    
    if (volume === 0 && turnover === 0) {
      return {
        symbol: tradingsymbol,
        fullSymbol: symbol,
        lastPrice: lastPrice,
        volume: 0,
        turnover: 0,
        turnoverCr: '0.00',
        priceChange: '0.00',
        priceChangePercent: '0.00',
        volatility: '0.00',
        ohlc: { open: 0, high: 0, low: 0, close: 0 },
        depth: 0,
        buyQty: 0,
        sellQty: 0,
        oi: 0,
        score: 0,
        dataSource: 'none'
      };
    }
    
    let score = 0;
    
    if (volume > 1000000) score += 40;
    else if (volume > 500000) score += 30;
    else if (volume > 100000) score += 20;
    else if (volume > 50000) score += 10;
    
    const turnoverCr = turnover / 10000000;
    if (turnoverCr > 100) score += 30;
    else if (turnoverCr > 50) score += 25;
    else if (turnoverCr > 20) score += 20;
    else if (turnoverCr > 10) score += 15;
    else if (turnoverCr > 5) score += 10;
    
    if (lastPrice >= 100 && lastPrice <= 5000) score += 15;
    else if (lastPrice >= 50 && lastPrice <= 10000) score += 10;
    else if (lastPrice >= 20) score += 5;
    
    if (volatility >= 1 && volatility <= 5) score += 10;
    else if (volatility > 5 && volatility <= 10) score += 5;
    
    if (totalDepth > 50000) score += 5;
    else if (totalDepth > 10000) score += 3;
    
    let dataSource = 'live';
    if (quote.historical_avg_volume && (quote.volume === 0 || !quote.volume)) {
      dataSource = 'historical';
    }
    
    return {
      symbol: tradingsymbol,
      fullSymbol: symbol,
      lastPrice: lastPrice,
      volume: Math.round(volume),
      historicalAvgVolume: quote.historical_avg_volume ? Math.round(quote.historical_avg_volume) : undefined,
      historicalMaxVolume: quote.historical_max_volume ? Math.round(quote.historical_max_volume) : undefined,
      turnover: turnover,
      turnoverCr: turnoverCr.toFixed(2),
      priceChange: priceChange.toFixed(2),
      priceChangePercent: priceChangePercent.toFixed(2),
      volatility: volatility.toFixed(2),
      ohlc: {
        open: open,
        high: high,
        low: low,
        close: close
      },
      depth: totalDepth,
      buyQty: buyQty,
      sellQty: sellQty,
      oi: oi,
      score: score,
      dataSource: dataSource
    };
  }

  async run(topN = 1000) {
    console.log('\n🚀 GOOD STOCKS FILTER - TOP STOCKS\n');
    console.log('━'.repeat(60));
    console.log(`Exchange: ${EXCHANGE}`);
    console.log(`Top N: ${topN}`);
    console.log('━'.repeat(60));
    
    const initialized = await this.initialize();
    if (!initialized) {
      console.error('❌ Failed to initialize');
      await this.discord.sendMessage('❌ **Filter Failed** - Initialization error');
      return;
    }

    const equityStocks = this.filterByBasicCriteria();
    
    await this.fetchMarketData(equityStocks);
    
    const analyzed = this.analyzeStocks();
    
    const sorted = analyzed.sort((a, b) => b.score - a.score);
    this.filteredStocks = sorted.slice(0, topN);
    
    this.displayResults();
    await this.saveResults();
    
    await this.sendDiscordSummary();
    
    console.log('\n✅ Filter completed successfully!\n');
    
    this.discord.disconnect();
  }

  displayResults() {
    console.log('\n📊 TOP STOCKS BY SCORE\n');
    console.log('━'.repeat(100));
    console.log(
      'Rank'.padEnd(6) +
      'Symbol'.padEnd(20) +
      'Price'.padEnd(12) +
      'Volume'.padEnd(15) +
      'Turnover(Cr)'.padEnd(15) +
      'Change%'.padEnd(10) +
      'Score'.padEnd(8)
    );
    console.log('━'.repeat(100));
    
    this.filteredStocks.slice(0, 50).forEach((stock, idx) => {
      console.log(
        `${(idx + 1)}`.padEnd(6) +
        stock.symbol.padEnd(20) +
        `₹${stock.lastPrice.toFixed(2)}`.padEnd(12) +
        this.formatNumber(stock.volume).padEnd(15) +
        stock.turnoverCr.padEnd(15) +
        `${stock.priceChangePercent}%`.padEnd(10) +
        `${stock.score}`.padEnd(8)
      );
    });
    
    console.log('━'.repeat(100));
    console.log(`\nShowing top 50 of ${this.filteredStocks.length} filtered stocks`);
  }

  async saveResults() {
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const outputDir = path.join(process.cwd(), 'output');
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const jsonPath = path.join(outputDir, `good-stocks-${EXCHANGE}-${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(this.filteredStocks, null, 2));
      Logger.info(`💾 Saved full results to: ${jsonPath}`);
      
      const symbolsPath = path.join(outputDir, `good-stocks-symbols-${EXCHANGE}-${timestamp}.txt`);
      const symbols = this.filteredStocks.map(s => s.fullSymbol).join('\n');
      fs.writeFileSync(symbolsPath, symbols);
      Logger.info(`💾 Saved symbols list to: ${symbolsPath}`);
      
      await this.delay(500);
      
      const csvPath = path.join(outputDir, `good-stocks-${EXCHANGE}-${timestamp}.csv`);
      const csvHeader = 'Rank,Symbol,Price,Volume,Turnover(Cr),Change%,Volatility%,Score\n';
      const csvRows = this.filteredStocks.map((s, idx) => 
        `${idx + 1},${s.symbol},${s.lastPrice},${s.volume},${s.turnoverCr},${s.priceChangePercent},${s.volatility},${s.score}`
      ).join('\n');
      fs.writeFileSync(csvPath, csvHeader + csvRows);
      Logger.info(`💾 Saved CSV to: ${csvPath}`);
      
      await this.delay(500);
      
      const reportPath = path.join(outputDir, `good-stocks-report-${EXCHANGE}-${timestamp}.txt`);
      const report = this.generateReport();
      fs.writeFileSync(reportPath, report);
      Logger.info(`💾 Saved report to: ${reportPath}`);
      
      await this.delay(500);
      
      const tokensArray = this.filteredStocks.map(s => {
        const inst = this.instruments.find(i => `${EXCHANGE}:${i.tradingsymbol}` === s.fullSymbol);
        return inst ? inst.instrument_token : null;
      }).filter(t => t !== null);
      
      const tokensPath = path.join(outputDir, `good-stocks-tokens-${EXCHANGE}-${timestamp}.json`);
      fs.writeFileSync(tokensPath, JSON.stringify(tokensArray, null, 2));
      Logger.info(`💾 Saved tokens array to: ${tokensPath}`);
      
      const tokensJsPath = path.join(outputDir, `good-stocks-tokens-${EXCHANGE}-${timestamp}.js`);
      const tokensJs = `const GOOD_STOCK_TOKENS = ${JSON.stringify(tokensArray, null, 2)};\n\nmodule.exports = GOOD_STOCK_TOKENS;`;
      fs.writeFileSync(tokensJsPath, tokensJs);
      Logger.info(`💾 Saved tokens JS module to: ${tokensJsPath}`);
      
      console.log('\n🎯 FINAL TOKENS ARRAY:');
      console.log('━'.repeat(60));
      console.log(`Total Tokens: ${tokensArray.length}`);
      console.log('━'.repeat(60));
      console.log(JSON.stringify(tokensArray));
      console.log('━'.repeat(60));
      
    } catch (error) {
      Logger.error('❌ Error saving results:', error);
    }
  }

  generateReport() {
    const avgScore = this.filteredStocks.reduce((sum, s) => sum + s.score, 0) / this.filteredStocks.length;
    const avgVolume = this.filteredStocks.reduce((sum, s) => sum + s.volume, 0) / this.filteredStocks.length;
    const avgTurnover = this.filteredStocks.reduce((sum, s) => sum + parseFloat(s.turnoverCr), 0) / this.filteredStocks.length;
    
    const highVolume = this.filteredStocks.filter(s => s.volume > 1000000).length;
    const highTurnover = this.filteredStocks.filter(s => parseFloat(s.turnoverCr) > 100).length;
    
    return `
GOOD STOCKS FILTER - REPORT
${'='.repeat(60)}
Exchange: ${EXCHANGE}
Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

SUMMARY
${'-'.repeat(60)}
Total Stocks Filtered: ${this.filteredStocks.length}
Average Score: ${avgScore.toFixed(2)}
Average Volume: ${this.formatNumber(avgVolume)}
Average Turnover: ₹${avgTurnover.toFixed(2)} Cr

DISTRIBUTION
${'-'.repeat(60)}
High Volume (>10L): ${highVolume} stocks
High Turnover (>100Cr): ${highTurnover} stocks

TOP 20 STOCKS
${'-'.repeat(60)}
${'Rank'.padEnd(6)}${'Symbol'.padEnd(20)}${'Score'.padEnd(8)}${'Volume'.padEnd(15)}${'Turnover(Cr)'}
${'-'.repeat(60)}
${this.filteredStocks.slice(0, 20).map((s, idx) => 
  `${(idx + 1)}`.padEnd(6) + s.symbol.padEnd(20) + `${s.score}`.padEnd(8) + this.formatNumber(s.volume).padEnd(15) + s.turnoverCr
).join('\n')}

${'='.repeat(60)}
`;
  }

  async sendDiscordSummary() {
    if (!this.discord.isReady) return;

    const avgScore = this.filteredStocks.reduce((sum, s) => sum + s.score, 0) / this.filteredStocks.length;
    const avgVolume = this.filteredStocks.reduce((sum, s) => sum + s.volume, 0) / this.filteredStocks.length;
    const avgTurnover = this.filteredStocks.reduce((sum, s) => sum + parseFloat(s.turnoverCr), 0) / this.filteredStocks.length;
    
    const highVolume = this.filteredStocks.filter(s => s.volume > 1000000).length;
    const highTurnover = this.filteredStocks.filter(s => parseFloat(s.turnoverCr) > 100).length;
    const gainers = this.filteredStocks.filter(s => parseFloat(s.priceChangePercent) > 0).length;
    const losers = this.filteredStocks.filter(s => parseFloat(s.priceChangePercent) < 0).length;

    let header = `✅ **FILTER COMPLETE - ${EXCHANGE}**\n`;
    header += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    header += `📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n`;
    header += `📊 Total Filtered: **${this.filteredStocks.length}** stocks\n\n`;
    
    await this.discord.sendMessage(header);

    await this.sendFilteringLogic();

    let stats = `📈 **STATISTICS**\n`;
    stats += '```\n';
    stats += `Average Score:    ${avgScore.toFixed(2)}\n`;
    stats += `Average Volume:   ${this.formatNumber(avgVolume)}\n`;
    stats += `Average Turnover: ₹${avgTurnover.toFixed(2)} Cr\n`;
    stats += `\n`;
    stats += `High Volume (>10L):      ${highVolume} stocks\n`;
    stats += `High Turnover (>100Cr):  ${highTurnover} stocks\n`;
    stats += `Gainers (positive):      ${gainers} stocks\n`;
    stats += `Losers (negative):       ${losers} stocks\n`;
    stats += '```\n\n';
    
    await this.discord.sendMessage(stats);

    await this.sendTopStocksDetailed(20);

    await this.sendCategoryBreakdown();

    await this.sendTopPerformers();

    let footer = `\n💾 **OUTPUT FILES**\n`;
    footer += '```\n';
    footer += `📁 Directory: output/\n`;
    footer += `📄 JSON:      good-stocks-${EXCHANGE}-${new Date().toISOString().split('T')[0]}.json\n`;
    footer += `📄 CSV:       good-stocks-${EXCHANGE}-${new Date().toISOString().split('T')[0]}.csv\n`;
    footer += `📄 TXT:       good-stocks-symbols-${EXCHANGE}-${new Date().toISOString().split('T')[0]}.txt\n`;
    footer += `📄 Report:    good-stocks-report-${EXCHANGE}-${new Date().toISOString().split('T')[0]}.txt\n`;
    footer += `📄 Tokens:    good-stocks-tokens-${EXCHANGE}-${new Date().toISOString().split('T')[0]}.json\n`;
    footer += `📄 Tokens JS: good-stocks-tokens-${EXCHANGE}-${new Date().toISOString().split('T')[0]}.js\n`;
    footer += '```';
    
    await this.discord.sendMessage(footer);
    
    const tokensArray = this.filteredStocks.map(s => {
      const inst = this.instruments.find(i => `${EXCHANGE}:${i.tradingsymbol}` === s.fullSymbol);
      return inst ? inst.instrument_token : null;
    }).filter(t => t !== null);
    
    let tokensMsg = `\n🎯 **INSTRUMENT TOKENS ARRAY**\n`;
    tokensMsg += `Total Tokens: ${tokensArray.length}\n`;
    tokensMsg += '```javascript\n';
    tokensMsg += `const tokens = ${JSON.stringify(tokensArray.slice(0, 20))};\n`;
    if (tokensArray.length > 20) {
      tokensMsg += `... and ${tokensArray.length - 20} more\n`;
    }
    tokensMsg += '```\n';
    tokensMsg += `Full array saved in tokens files`;
    
    await this.discord.sendMessage(tokensMsg);
  }

  async sendFilteringLogic() {
    let logic = `🧠 **FILTERING LOGIC & SCORING SYSTEM**\n\n`;
    
    logic += `**📋 STEP 1: BASIC FILTERING**\n`;
    logic += '```\n';
    logic += '✓ Only Equity stocks (EQ segment)\n';
    logic += '✓ No special characters or indices\n';
    logic += '✓ Standard lot size = 1\n';
    logic += '✓ Standard tick size = 0.05\n';
    logic += '✓ Excludes: NIFTY, INDIA indices\n';
    logic += '```\n\n';
    
    await this.discord.sendMessage(logic);

    let scoring = `**🎯 STEP 2: SCORING SYSTEM (0-100 Points)**\n\n`;
    
    scoring += `**📊 Volume Score (0-40 points)**\n`;
    scoring += '```\n';
    scoring += '40 pts → >10 Lakh shares     (Highly liquid)\n';
    scoring += '30 pts → 5L-10L shares       (Very liquid)\n';
    scoring += '20 pts → 1L-5L shares        (Good liquid)\n';
    scoring += '10 pts → 50K-1L shares       (Moderate)\n';
    scoring += ' 0 pts → <50K shares         (Low liquid)\n\n';
    scoring += 'WHY? High volume = Easy to buy/sell\n';
    scoring += '      More participants = Better price discovery\n';
    scoring += '```\n\n';
    
    await this.discord.sendMessage(scoring);

    let turnover = `**💰 Turnover Score (0-30 points)**\n`;
    turnover += '```\n';
    turnover += '30 pts → >₹100 Cr/day       (Blue chip level)\n';
    turnover += '25 pts → ₹50-100 Cr/day     (Large cap)\n';
    turnover += '20 pts → ₹20-50 Cr/day      (Mid cap)\n';
    turnover += '15 pts → ₹10-20 Cr/day      (Small cap)\n';
    turnover += '10 pts → ₹5-10 Cr/day       (Micro cap)\n';
    turnover += ' 0 pts → <₹5 Cr/day         (Very small)\n\n';
    turnover += 'WHY? Turnover = Volume × Price\n';
    turnover += '      High turnover = Real money flow\n';
    turnover += '      Institutional interest indicator\n';
    turnover += '```\n\n';
    
    await this.discord.sendMessage(turnover);

    let price = `**₹ Price Range Score (0-15 points)**\n`;
    price += '```\n';
    price += '15 pts → ₹100-5,000         (Sweet spot)\n';
    price += '10 pts → ₹50-10,000         (Good range)\n';
    price += ' 5 pts → ₹20+               (Acceptable)\n';
    price += ' 0 pts → <₹20 or >₹10,000   (Too extreme)\n\n';
    price += 'WHY? ₹100-5000 range is ideal for:\n';
    price += '      - Retail traders (affordable lots)\n';
    price += '      - Good % movement potential\n';
    price += '      - Not penny stocks, not too expensive\n';
    price += '```\n\n';
    
    await this.discord.sendMessage(price);

    let volatility = `**⚡ Volatility Score (0-10 points)**\n`;
    volatility += '```\n';
    volatility += '10 pts → 1-5% daily range   (Perfect for trading)\n';
    volatility += ' 5 pts → 5-10% daily range  (Moderate risk)\n';
    volatility += ' 0 pts → <1% or >10%        (Too stable/risky)\n\n';
    volatility += 'WHY? Volatility = (High - Low) / Close\n';
    volatility += '      1-5% = Good profit opportunity\n';
    volatility += '      Not too stable (boring)\n';
    volatility += '      Not too volatile (risky)\n';
    volatility += '```\n\n';
    
    await this.discord.sendMessage(volatility);

    let depth = `**📈 Market Depth Score (0-5 points)**\n`;
    depth += '```\n';
    depth += '5 pts → >50,000 shares      (Deep market)\n';
    depth += '3 pts → 10,000-50,000       (Good depth)\n';
    depth += '0 pts → <10,000             (Thin market)\n\n';
    depth += 'WHY? Depth = Total Buy + Sell orders\n';
    depth += '      High depth = Better fills\n';
    depth += '      Less slippage on entry/exit\n';
    depth += '```\n\n';
    
    await this.discord.sendMessage(depth);

    let summary = `**🎓 SCORING PHILOSOPHY**\n`;
    summary += '```\n';
    summary += '╔════════════════════════════════════════╗\n';
    summary += '║  PERFECT STOCK CHARACTERISTICS:       ║\n';
    summary += '╠════════════════════════════════════════╣\n';
    summary += '║  ✓ High liquidity (easy trading)      ║\n';
    summary += '║  ✓ Good money flow (real interest)    ║\n';
    summary += '║  ✓ Tradeable price (accessible)       ║\n';
    summary += '║  ✓ Healthy volatility (profit scope)  ║\n';
    summary += '║  ✓ Deep market (tight spreads)        ║\n';
    summary += '╚════════════════════════════════════════╝\n\n';
    summary += 'SCORE INTERPRETATION:\n';
    summary += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    summary += '80-100 pts → Excellent (Blue chip quality)\n';
    summary += '60-79 pts  → Very Good (Strong fundamentals)\n';
    summary += '40-59 pts  → Good (Worth considering)\n';
    summary += '20-39 pts  → Fair (Selective trading)\n';
    summary += '0-19 pts   → Low (High risk)\n';
    summary += '```\n\n';
    
    await this.discord.sendMessage(summary);

    let realWorld = `**🌍 REAL-WORLD EXAMPLES**\n`;
    realWorld += '```\n';
    realWorld += 'HIGH SCORE (80+):\n';
    realWorld += '  • RELIANCE, TCS, INFY, HDFCBANK\n';
    realWorld += '  • Massive volume, huge turnover\n';
    realWorld += '  • Institutional favorites\n';
    realWorld += '  • Consistent price discovery\n\n';
    realWorld += 'MEDIUM SCORE (40-79):\n';
    realWorld += '  • Mid-cap stocks with growth\n';
    realWorld += '  • Decent liquidity\n';
    realWorld += '  • Good for swing trading\n\n';
    realWorld += 'LOW SCORE (<40):\n';
    realWorld += '  • Illiquid stocks\n';
    realWorld += '  • Wide bid-ask spreads\n';
    realWorld += '  • Difficult entry/exit\n';
    realWorld += '```\n\n';
    
    await this.discord.sendMessage(realWorld);

    let finalNote = `**⚠️ IMPORTANT NOTES**\n`;
    finalNote += '```\n';
    finalNote += '1. This is TECHNICAL filtering, not fundamental\n';
    finalNote += '   analysis. Always do your own research!\n\n';
    finalNote += '2. High score = Good trading stock\n';
    finalNote += '   ≠ Good investment (check financials)\n\n';
    finalNote += '3. Past liquidity ≠ Future liquidity\n';
    finalNote += '   Market conditions change\n\n';
    finalNote += '4. Best used for:\n';
    finalNote += '   • Intraday trading\n';
    finalNote += '   • Swing trading\n';
    finalNote += '   • Short-term opportunities\n\n';
    finalNote += '5. NOT suitable for:\n';
    finalNote += '   • Long-term investing (needs fundamental analysis)\n';
    finalNote += '   • Blind trading (always verify current conditions)\n';
    finalNote += '```\n';
    finalNote += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    await this.discord.sendMessage(finalNote);
  }

  async sendTopStocksDetailed(count = 20) {
    const topStocks = this.filteredStocks.slice(0, count);
    
    let message = `🏆 **TOP ${count} STOCKS - DETAILED VIEW**\n`;
    message += `📅 Data: Last 5 trading days average\n\n`;
    
    for (let i = 0; i < topStocks.length; i += 5) {
      const chunk = topStocks.slice(i, i + 5);
      let chunkMsg = '';
      
      chunk.forEach((stock, idx) => {
        const rank = i + idx + 1;
        const emoji = parseFloat(stock.priceChangePercent) >= 0 ? '🟢' : '🔴';
        const arrow = parseFloat(stock.priceChangePercent) >= 0 ? '▲' : '▼';
        const dataIcon = stock.dataSource === 'historical' ? '📊' : '🔴';
        
        chunkMsg += `**${rank}. ${stock.symbol}** ${emoji} ${dataIcon}\n`;
        chunkMsg += '```\n';
        chunkMsg += `Score:        ${stock.score}/100\n`;
        chunkMsg += `Price:        ₹${stock.lastPrice.toFixed(2)}\n`;
        chunkMsg += `Change:       ${arrow} ${stock.priceChangePercent}%\n`;
        chunkMsg += `Volume:       ${this.formatNumber(stock.volume)}`;
        if (stock.historicalAvgVolume) {
          chunkMsg += ` (avg)\n`;
        } else {
          chunkMsg += `\n`;
        }
        chunkMsg += `Turnover:     ₹${stock.turnoverCr} Cr\n`;
        chunkMsg += `Volatility:   ${stock.volatility}%\n`;
        chunkMsg += `OHLC: O:${stock.ohlc.open} H:${stock.ohlc.high} L:${stock.ohlc.low} C:${stock.ohlc.close}\n`;
        chunkMsg += `Buy Qty:      ${this.formatNumber(stock.buyQty)}\n`;
        chunkMsg += `Sell Qty:     ${this.formatNumber(stock.sellQty)}\n`;
        chunkMsg += '```\n';
      });
      
      await this.discord.sendMessage(chunkMsg);
      await this.delay(500);
    }
    
    let legend = `\n📊 = Historical data (5-day avg)\n🔴 = Live market data\n`;
    await this.discord.sendMessage(legend);
  }

  async sendCategoryBreakdown() {
    let message = `📊 **CATEGORY BREAKDOWN**\n\n`;
    
    const scoreRanges = [
      { min: 80, max: 100, label: 'Excellent (80-100)' },
      { min: 60, max: 79, label: 'Very Good (60-79)' },
      { min: 40, max: 59, label: 'Good (40-59)' },
      { min: 20, max: 39, label: 'Fair (20-39)' },
      { min: 0, max: 19, label: 'Low (0-19)' }
    ];
    
    message += '**By Score:**\n```\n';
    scoreRanges.forEach(range => {
      const count = this.filteredStocks.filter(s => 
        s.score >= range.min && s.score <= range.max
      ).length;
      const bar = '█'.repeat(Math.floor(count / 10));
      message += `${range.label.padEnd(25)} ${count.toString().padStart(4)} ${bar}\n`;
    });
    message += '```\n\n';
    
    message += '**By Volume:**\n```\n';
    const volumeRanges = [
      { min: 5000000, label: '>50L shares' },
      { min: 1000000, max: 4999999, label: '10L-50L shares' },
      { min: 500000, max: 999999, label: '5L-10L shares' },
      { min: 100000, max: 499999, label: '1L-5L shares' },
      { max: 99999, label: '<1L shares' }
    ];
    
    volumeRanges.forEach(range => {
      const count = this.filteredStocks.filter(s => {
        if (range.min && range.max) return s.volume >= range.min && s.volume <= range.max;
        if (range.min) return s.volume >= range.min;
        if (range.max) return s.volume <= range.max;
        return false;
      }).length;
      const bar = '█'.repeat(Math.floor(count / 10));
      message += `${range.label.padEnd(25)} ${count.toString().padStart(4)} ${bar}\n`;
    });
    message += '```\n\n';
    
    message += '**By Price Range:**\n```\n';
    const priceRanges = [
      { min: 5000, label: '>₹5000' },
      { min: 1000, max: 4999, label: '₹1000-₹5000' },
      { min: 500, max: 999, label: '₹500-₹1000' },
      { min: 100, max: 499, label: '₹100-₹500' },
      { max: 99, label: '<₹100' }
    ];
    
    priceRanges.forEach(range => {
      const count = this.filteredStocks.filter(s => {
        if (range.min && range.max) return s.lastPrice >= range.min && s.lastPrice <= range.max;
        if (range.min) return s.lastPrice >= range.min;
        if (range.max) return s.lastPrice <= range.max;
        return false;
      }).length;
      const bar = '█'.repeat(Math.floor(count / 10));
      message += `${range.label.padEnd(25)} ${count.toString().padStart(4)} ${bar}\n`;
    });
    message += '```';
    
    await this.discord.sendMessage(message);
  }

  async sendTopPerformers() {
    const topGainers = [...this.filteredStocks]
      .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
      .slice(0, 10);
    
    let gainersMsg = `🚀 **TOP 10 GAINERS**\n\`\`\`\n`;
    gainersMsg += 'Rank Symbol           Price      Change%   Volume\n';
    gainersMsg += '─'.repeat(55) + '\n';
    topGainers.forEach((stock, idx) => {
      gainersMsg += `${(idx + 1).toString().padEnd(5)}${stock.symbol.padEnd(17)}₹${stock.lastPrice.toFixed(2).padEnd(10)}+${stock.priceChangePercent.padEnd(9)}${this.formatNumber(stock.volume)}\n`;
    });
    gainersMsg += '```';
    
    await this.discord.sendMessage(gainersMsg);
    
    const topLosers = [...this.filteredStocks]
      .sort((a, b) => parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent))
      .slice(0, 10);
    
    let losersMsg = `📉 **TOP 10 LOSERS**\n\`\`\`\n`;
    losersMsg += 'Rank Symbol           Price      Change%   Volume\n';
    losersMsg += '─'.repeat(55) + '\n';
    topLosers.forEach((stock, idx) => {
      losersMsg += `${(idx + 1).toString().padEnd(5)}${stock.symbol.padEnd(17)}₹${stock.lastPrice.toFixed(2).padEnd(10)}${stock.priceChangePercent.padEnd(10)}${this.formatNumber(stock.volume)}\n`;
    });
    losersMsg += '```';
    
    await this.discord.sendMessage(losersMsg);
    
    const highestVolume = [...this.filteredStocks]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);
    
    let volumeMsg = `📊 **HIGHEST VOLUME**\n\`\`\`\n`;
    volumeMsg += 'Rank Symbol           Volume      Turnover(Cr)  Score\n';
    volumeMsg += '─'.repeat(55) + '\n';
    highestVolume.forEach((stock, idx) => {
      volumeMsg += `${(idx + 1).toString().padEnd(5)}${stock.symbol.padEnd(17)}${this.formatNumber(stock.volume).padEnd(12)}${stock.turnoverCr.padEnd(14)}${stock.score}\n`;
    });
    volumeMsg += '```';
    
    await this.discord.sendMessage(volumeMsg);
    
    const mostVolatile = [...this.filteredStocks]
      .sort((a, b) => parseFloat(b.volatility) - parseFloat(a.volatility))
      .slice(0, 10);
    
    let volatileMsg = `⚡ **MOST VOLATILE**\n\`\`\`\n`;
    volatileMsg += 'Rank Symbol           Volatility%  Price      Score\n';
    volatileMsg += '─'.repeat(55) + '\n';
    mostVolatile.forEach((stock, idx) => {
      volatileMsg += `${(idx + 1).toString().padEnd(5)}${stock.symbol.padEnd(17)}${stock.volatility.padEnd(13)}₹${stock.lastPrice.toFixed(2).padEnd(10)}${stock.score}\n`;
    });
    volatileMsg += '```';
    
    await this.discord.sendMessage(volatileMsg);
  }

  formatNumber(num) {
    if (num >= 10000000) return `${(num / 10000000).toFixed(2)}Cr`;
    if (num >= 100000) return `${(num / 100000).toFixed(2)}L`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toString();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

async function main() {
  if (!ZERODHA_API_KEY || !ZERODHA_ACCESS_TOKEN) {
    console.error('❌ ERROR: ZERODHA_API_KEY and ZERODHA_ACCESS_TOKEN are required!');
    console.error('Please edit the script and add your credentials at the top.');
    process.exit(1);
  }

  const filter = new GoodStocksFilter();
  
  const topN = parseInt(process.argv[2]) || 1000;
  
  await filter.run(topN);
  
  process.exit(0);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = GoodStocksFilter;