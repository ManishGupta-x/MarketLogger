const marketData = require('../services/market-data.service');
const zerodhaService = require('../services/zerodha.service');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class StockCommands {
  constructor() {
    this.subscriptionsFile = path.join(__dirname, '../../subscriptions.json');
    this.loadSubscriptions();
  }

  loadSubscriptions() {
    try {
      if (fs.existsSync(this.subscriptionsFile)) {
        const data = fs.readFileSync(this.subscriptionsFile, 'utf8');
        const subs = JSON.parse(data);
        marketData.subscribedStocks = subs;
        logger.info(`Loaded ${subs.length} subscribed stocks`);
      } else {
        this.saveSubscriptions([]);
      }
    } catch (error) {
      logger.error('Error loading subscriptions:', error);
      marketData.subscribedStocks = [];
    }
  }

  saveSubscriptions(stocks) {
    try {
      fs.writeFileSync(this.subscriptionsFile, JSON.stringify(stocks, null, 2));
      logger.info('Subscriptions saved to file');
    } catch (error) {
      logger.error('Error saving subscriptions:', error);
    }
  }

  async searchStock(query) {
    try {
      // Search instruments
      const instruments = await zerodhaService.kite.getInstruments('NSE');
      
      // Filter by search query
      const results = instruments.filter(inst => 
        inst.tradingsymbol.toLowerCase().includes(query.toLowerCase()) ||
        (inst.name && inst.name.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 5); // Top 5 results

      return results;
    } catch (error) {
      logger.error('Error searching stock:', error);
      return [];
    }
  }

  async subscribeStock(symbol) {
    // Format: NSE:SYMBOL
    const formattedSymbol = symbol.startsWith('NSE:') ? symbol : `NSE:${symbol}`;
    
    if (marketData.subscribedStocks.includes(formattedSymbol)) {
      return { success: false, message: 'Already subscribed to this stock' };
    }

    marketData.subscribedStocks.push(formattedSymbol);
    this.saveSubscriptions(marketData.subscribedStocks);

    logger.info(`Subscribed to ${formattedSymbol}`);
    
    // Get initial data
    const quote = await marketData.getQuote([formattedSymbol]);
    
    return { success: true, symbol: formattedSymbol, quote: quote };
  }

  async unsubscribeStock(symbol) {
    const formattedSymbol = symbol.startsWith('NSE:') ? symbol : `NSE:${symbol}`;
    
    const index = marketData.subscribedStocks.indexOf(formattedSymbol);
    if (index === -1) {
      return { success: false, message: 'Stock not in subscription list' };
    }

    marketData.subscribedStocks.splice(index, 1);
    this.saveSubscriptions(marketData.subscribedStocks);

    logger.info(`Unsubscribed from ${formattedSymbol}`);
    
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