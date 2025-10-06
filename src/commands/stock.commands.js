const marketData = require('../services/market-data.service');
const zerodhaService = require('../services/zerodha.service');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class StockCommands {
  constructor() {
    this.tickerService = null;
    this.setupStoragePath();
    this.loadSubscriptions();
  }

  setupStoragePath() {
    // Detect Railway environment
    const isRailway = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
    
    if (isRailway) {
      // Railway: use persistent volume
      const volumePath = '/app/data';
      this.subscriptionsFile = path.join(volumePath, 'subscriptions.json');
      
      // Ensure volume directory exists
      try {
        if (!fs.existsSync(volumePath)) {
          fs.mkdirSync(volumePath, { recursive: true });
          logger.info('📁 Created volume directory');
        }
        logger.info(`💾 Using Railway volume: ${this.subscriptionsFile}`);
      } catch (error) {
        logger.error('Failed to create volume directory:', error);
        // Fallback to local path if volume fails
        this.subscriptionsFile = path.join(__dirname, '../../subscriptions.json');
        logger.warn(`⚠️ Falling back to local path: ${this.subscriptionsFile}`);
      }
    } else {
      // Local development: use project directory
      this.subscriptionsFile = path.join(__dirname, '../../subscriptions.json');
      logger.info(`💾 Using local file: ${this.subscriptionsFile}`);
    }
  }

  // Lazy load ticker service to avoid circular dependency
  getTickerService() {
    if (!this.tickerService) {
      try {
        this.tickerService = require('../services/ticker.service');
      } catch (error) {
        logger.warn('Ticker service not available');
      }
    }
    return this.tickerService;
  }

  loadSubscriptions() {
    try {
      if (fs.existsSync(this.subscriptionsFile)) {
        const data = fs.readFileSync(this.subscriptionsFile, 'utf8');
        const subs = JSON.parse(data);
        marketData.subscribedStocks = subs;
        logger.info(`✅ Loaded ${subs.length} subscribed stocks`);
        
        if (subs.length > 0) {
          logger.info(`📊 Stocks: ${subs.map(s => s.replace('NSE:', '')).join(', ')}`);
        }
      } else {
        logger.info('📝 No subscriptions file found, creating new one');
        this.saveSubscriptions([]);
      }
    } catch (error) {
      logger.error('❌ Error loading subscriptions:', error);
      console.error('Subscriptions load error:', error.message);
      marketData.subscribedStocks = [];
    }
  }

  saveSubscriptions(stocks) {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.subscriptionsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.subscriptionsFile, JSON.stringify(stocks, null, 2));
      logger.info(`💾 Subscriptions saved: ${stocks.length} stocks`);
      
      // Log saved location for debugging
      if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
        logger.info('✅ Saved to Railway volume (persistent)');
      } else {
        logger.info('✅ Saved to local file');
      }
    } catch (error) {
      logger.error('❌ Error saving subscriptions:', error);
      console.error('Save error:', error.message);
    }
  }

  async searchStock(query) {
    try {
      const instruments = await zerodhaService.kite.getInstruments('NSE');
      
      const results = instruments.filter(inst => 
        inst.tradingsymbol.toLowerCase().includes(query.toLowerCase()) ||
        (inst.name && inst.name.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 5);

      return results;
    } catch (error) {
      logger.error('Error searching stock:', error);
      return [];
    }
  }

  async subscribeStock(symbol) {
    const formattedSymbol = symbol.startsWith('NSE:') ? symbol : `NSE:${symbol}`;
    
    if (marketData.subscribedStocks.includes(formattedSymbol)) {
      return { success: false, message: 'Already subscribed to this stock' };
    }

    marketData.subscribedStocks.push(formattedSymbol);
    this.saveSubscriptions(marketData.subscribedStocks);

    logger.info(`➕ Subscribed to ${formattedSymbol}`);
    
    // Add to ticker stream if available
    const ticker = this.getTickerService();
    if (ticker && ticker.isConnected) {
      try {
        await ticker.addStock(formattedSymbol);
        logger.info(`📊 Added ${formattedSymbol} to ticker stream`);
      } catch (error) {
        logger.warn(`Could not add to ticker stream: ${error.message}`);
      }
    }
    
    // Get initial data
    try {
      const quote = await marketData.getQuote([formattedSymbol]);
      return { success: true, symbol: formattedSymbol, quote: quote };
    } catch (error) {
      logger.warn('Could not fetch initial quote:', error.message);
      return { success: true, symbol: formattedSymbol, quote: null };
    }
  }

  async unsubscribeStock(symbol) {
    const formattedSymbol = symbol.startsWith('NSE:') ? symbol : `NSE:${symbol}`;
    
    const index = marketData.subscribedStocks.indexOf(formattedSymbol);
    if (index === -1) {
      return { success: false, message: 'Stock not in subscription list' };
    }

    marketData.subscribedStocks.splice(index, 1);
    this.saveSubscriptions(marketData.subscribedStocks);

    logger.info(`➖ Unsubscribed from ${formattedSymbol}`);
    
    // Remove from ticker stream if available
    const ticker = this.getTickerService();
    if (ticker && ticker.isConnected) {
      try {
        await ticker.removeStock(formattedSymbol);
        logger.info(`📊 Removed ${formattedSymbol} from ticker stream`);
      } catch (error) {
        logger.warn(`Could not remove from ticker stream: ${error.message}`);
      }
    }
    
    return { success: true, symbol: formattedSymbol };
  }

  getSubscribedStocks() {
    return marketData.subscribedStocks;
  }

  async getStockInfo(symbol) {
    const formattedSymbol = symbol.startsWith('NSE:') ? symbol : `NSE:${symbol}`;
    
    try {
      const quote = await marketData.getQuote([formattedSymbol]);
      return quote[formattedSymbol];
    } catch (error) {
      logger.error('Error getting stock info:', error);
      return null;
    }
  }

  formatStockInfo(symbol, data) {
    if (!data) return 'Stock data not available';

    const change = data.last_price - data.ohlc.close;
    const changePercent = ((change / data.ohlc.close) * 100).toFixed(2);
    const emoji = change >= 0 ? '📈' : '📉';
    const color = change >= 0 ? '🟢' : '🔴';

    let message = `${emoji} **${symbol.replace('NSE:', '')}**\n\n`;
    message += `${color} **Price:** ₹${data.last_price.toFixed(2)}\n`;
    message += `**Change:** ${change >= 0 ? '+' : ''}₹${change.toFixed(2)} (${changePercent}%)\n\n`;
    message += `**Open:** ₹${data.ohlc.open}\n`;
    message += `**High:** ₹${data.ohlc.high}\n`;
    message += `**Low:** ₹${data.ohlc.low}\n`;
    message += `**Close:** ₹${data.ohlc.close}\n\n`;
    message += `**Volume:** ${data.volume.toLocaleString()}\n`;
    message += `**Avg Price:** ₹${data.average_price.toFixed(2)}\n`;
    
    if (data.upper_circuit_limit && data.lower_circuit_limit) {
      message += `\n**Upper Circuit:** ₹${data.upper_circuit_limit}\n`;
      message += `**Lower Circuit:** ₹${data.lower_circuit_limit}\n`;
    }

    return message;
  }
}

module.exports = new StockCommands();