const { Client, GatewayIntentBits } = require('discord.js');
const KiteConnect = require('kiteconnect').KiteConnect;
require('dotenv').config();

// Configuration
const DISCORD_TOKEN = "MTQyNDM1NzQxNDQ1MDIzNzQ0Mw.Gv5juC.Do2cnwKdWmyoAGkVFkplksyN6CMMZL2fYOKxWA"
const DISCORD_CHANNEL_ID = '1425771179175706685';
const ZERODHA_API_KEY = "5jv2nj6si7d2tvjt";
const ZERODHA_ACCESS_TOKEN = "0fg1RHOZ2OMnU0iAowM2x9gmQdoHly2o";
const EXCHANGE = 'NSE'; // 30 Lakh (30L) minimum volume3


// Initialize services
const kite = new KiteConnect({ api_key: ZERODHA_API_KEY });
kite.setAccessToken(ZERODHA_ACCESS_TOKEN);

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Main function - Get stocks with >5% drop
async function getStocksWithDrop() {
  try {
    console.log(`🔍 Fetching all instruments from ${EXCHANGE}...`);
    
    // Get all instruments for the exchange
    const instruments = await kite.getInstruments(EXCHANGE);
    
    // Filter only equity stocks (excluding derivatives, futures, options)
    const stocks = instruments.filter(inst => 
      inst.instrument_type === 'EQ' || inst.segment === 'NSE'
    );
    
    console.log(`📊 Found ${stocks.length} stocks in ${EXCHANGE}`);
    
    // Get symbols in batches (need full quote data for OHLC)
    const batchSize = 500;
    const batches = [];
    
    for (let i = 0; i < stocks.length; i += batchSize) {
      batches.push(stocks.slice(i, i + batchSize));
    }
    
    console.log(`🔄 Processing ${batches.length} batches...`);
    
    const droppedStocks = [];
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const symbols = batch.map(s => `${EXCHANGE}:${s.tradingsymbol}`);
      
      console.log(`⏳ Fetching batch ${i + 1}/${batches.length}...`);
      
      try {
        // Use getQuote to get OHLC data
        const quotes = await kite.getQuote(symbols);
        
        for (const [symbol, data] of Object.entries(quotes)) {
          if (data && data.last_price && data.ohlc && data.ohlc.close) {
            const tradingSymbol = symbol.replace(`${EXCHANGE}:`, '');
            const instrument = batch.find(s => s.tradingsymbol === tradingSymbol);
            
            // Calculate percentage change from previous close
            const change = data.last_price - data.ohlc.close;
            const changePercent = (change / data.ohlc.close) * 100;
            
            // Filter stocks with more than 5% drop AND minimum 30L volume
            if (changePercent >= 5 && data.volume >= MIN_VOLUME) {
              droppedStocks.push({
                symbol: tradingSymbol,
                name: instrument?.name || tradingSymbol,
                price: data.last_price,
                prevClose: data.ohlc.close,
                change: change,
                changePercent: changePercent,
                volume: data.volume,
                high: data.ohlc.high,
                low: data.ohlc.low,
                token: instrument?.instrument_token
              });
            }
          }
        }
        
        // Rate limiting: wait 0.5 seconds between batches
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`❌ Error fetching batch ${i + 1}:`, error.message);
      }
    }
    
    console.log(`✅ Found ${droppedStocks.length} stocks with >5% drop and volume ≥30L`);
    
    // Sort by change percent (most dropped first)
    droppedStocks.sort((a, b) => a.changePercent - b.changePercent);
    
    return droppedStocks;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Send dropped stocks to Discord
async function sendToDiscord(droppedStocks) {
  try {
    await new Promise((resolve) => {
      discord.once('ready', () => {
        console.log(`✅ Discord bot logged in as ${discord.user.tag}`);
        resolve();
      });
      discord.login(DISCORD_TOKEN);
    });
    
    const channel = await discord.channels.fetch(DISCORD_CHANNEL_ID);
    
    if (!channel) {
      throw new Error('Channel not found!');
    }
    
    console.log(`📤 Sending to channel: ${channel.name}`);
    
    const timestamp = new Date().toLocaleString('en-IN', { 
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'short'
    });
    
    // Header message
    await channel.send(
      `🔴 **STOCKS WITH >5% DROP (Min 30L Volume) - ${EXCHANGE}**\n` +
      `🕐 ${timestamp}\n` +
      `📉 Total Stocks Dropped: ${droppedStocks.length}\n` +
      `📊 Volume Filter: ≥30 Lakh shares\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    );
    
    if (droppedStocks.length === 0) {
      await channel.send('✅ **No stocks found with >5% drop and volume ≥30L!**');
      return;
    }
    
    // Send top 10 biggest losers in detailed format
    if (droppedStocks.length > 0) {
      let topLosers = '🔥 **TOP 10 BIGGEST LOSERS**\n\n';
      
      for (let i = 0; i < Math.min(10, droppedStocks.length); i++) {
        const stock = droppedStocks[i];
        topLosers += `${i + 1}. **${stock.symbol}**\n`;
        topLosers += `   💰 Price: ₹${stock.price.toFixed(2)} (Prev: ₹${stock.prevClose.toFixed(2)})\n`;
        topLosers += `   📉 Change: ${stock.changePercent.toFixed(2)}% (₹${stock.change.toFixed(2)})\n`;
        topLosers += `   📊 Volume: ${(stock.volume / 100000).toFixed(2)}L\n`;
        topLosers += `   📈 High/Low: ₹${stock.high.toFixed(2)} / ₹${stock.low.toFixed(2)}\n\n`;
      }
      
      await channel.send(topLosers);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Send complete list in compact format
    await channel.send('📋 **COMPLETE LIST OF DROPPED STOCKS:**\n');
    
    let message = '';
    let count = 0;
    
    for (const stock of droppedStocks) {
      const line = `${stock.symbol}: ₹${stock.price.toFixed(2)} (${stock.changePercent.toFixed(2)}%) Vol: ${(stock.volume / 100000).toFixed(2)}L\n`;
      
      // If adding this line exceeds limit, send current message
      if (message.length + line.length > 1800) {
        await channel.send('```\n' + message + '```');
        message = '';
        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
      }
      
      message += line;
      count++;
      
      // Progress update every 100 stocks
      if (count % 100 === 0) {
        console.log(`📤 Sent ${count}/${droppedStocks.length} stocks...`);
      }
    }
    
    // Send remaining
    if (message.length > 0) {
      await channel.send('```\n' + message + '```');
    }
    
    // Summary statistics
    const avgDrop = droppedStocks.reduce((sum, s) => sum + s.changePercent, 0) / droppedStocks.length;
    const maxDrop = droppedStocks[0]; // Already sorted by worst drop
    
    await channel.send(
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 **STATISTICS**\n` +
      `Total Dropped Stocks: ${droppedStocks.length}\n` +
      `Average Drop: ${avgDrop.toFixed(2)}%\n` +
      `Worst Drop: ${maxDrop.symbol} (${maxDrop.changePercent.toFixed(2)}%)\n` +
      `✅ **Complete!**`
    );
    
    console.log('✅ All dropped stocks sent to Discord!');
    
  } catch (error) {
    console.error('❌ Discord error:', error.message);
    throw error;
  } finally {
    discord.destroy();
  }
}

// Export as CSV option
function exportToCSV(droppedStocks, filename = 'stocks_dropped_5percent.csv') {
  const fs = require('fs');
  
  const csv = [
    'Symbol,Name,Current Price,Previous Close,Change,Change %,Volume,High,Low,Token',
    ...droppedStocks.map(p => 
      `${p.symbol},"${p.name}",${p.price},${p.prevClose},${p.change},${p.changePercent},${p.volume},${p.high},${p.low},${p.token}`
    )
  ].join('\n');
  
  fs.writeFileSync(filename, csv);
  console.log(`✅ Exported to ${filename}`);
}

// Run the script
async function main() {
  console.log('🚀 Starting stock drop scanner (>5% drop, min 30L volume)...\n');
  
  try {
    const droppedStocks = await getStocksWithDrop();
    
    if (droppedStocks.length === 0) {
      console.log('✅ No stocks found with >5% drop and volume ≥30L!');
      await discord.login(DISCORD_TOKEN);
      const channel = await discord.channels.fetch(DISCORD_CHANNEL_ID);
      await channel.send('✅ **Market Update:** No stocks with >5% drop (min 30L volume) found!');
      discord.destroy();
      process.exit(0);
      return;
    }
    
    // Optional: Export to CSV
    exportToCSV(droppedStocks);
    
    // Send to Discord
    await sendToDiscord(droppedStocks);
    
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { getStocksWithDrop, sendToDiscord, exportToCSV };