const zerodhaService = require('./zerodha.service');
const discordService = require('./discord.service');
const logger = require('../utils/logger');

class MarketDataService {
  constructor() {
    this.subscribedStocks = [];
    this.watchInterval = null;
  }

  // Subscribe to stocks and get updates
  async subscribeStocks(symbols) {
    // symbols format: ['NSE:RELIANCE', 'NSE:TCS', 'NSE:INFY']
    this.subscribedStocks = symbols;
    logger.info(`Subscribed to: ${symbols.join(', ')}`);
    
    await discordService.log(
      `📊 Subscribed to stocks:\n${symbols.join('\n')}`,
      'info'
    );
  }

  // Get live price (LTP)
  async getLTP(symbols) {
    try {
      if (!zerodhaService.isConnected) {
        logger.warn('Zerodha not connected, cannot get LTP');
        return null;
      }
      const quotes = await zerodhaService.kite.getLTP(symbols);
      return quotes;
    } catch (error) {
      logger.error('Error getting LTP:', error.message);
      return null;
    }
  }

  // Get full quote with OHLC, bid/ask, etc.
  async getQuote(symbols) {
    try {
      if (!zerodhaService.isConnected) {
        logger.warn('Zerodha not connected, cannot get quote');
        return null;
      }
      const quotes = await zerodhaService.kite.getQuote(symbols);
      return quotes;
    } catch (error) {
      logger.error('Error getting quote:', error.message);
      return null;
    }
  }

  // Get OHLC (Open, High, Low, Close)
  async getOHLC(symbols) {
    try {
      if (!zerodhaService.isConnected) {
        logger.warn('Zerodha not connected, cannot get OHLC');
        return null;
      }
      const ohlc = await zerodhaService.kite.getOHLC(symbols);
      return ohlc;
    } catch (error) {
      logger.error('Error getting OHLC:', error.message);
      return null;
    }
  }

  // Get historical data (candles)
  async getHistoricalData(instrumentToken, interval, fromDate, toDate) {
    // interval: 'minute', '3minute', '5minute', '15minute', '30minute', 'hour', 'day'
    try {
      if (!zerodhaService.isConnected) {
        logger.warn('Zerodha not connected, cannot get historical data');
        return null;
      }
      const candles = await zerodhaService.kite.getHistoricalData(
        instrumentToken,
        interval,
        fromDate,
        toDate
      );
      return candles;
    } catch (error) {
      logger.error('Error getting historical data:', error.message);
      return null;
    }
  }

  // Start watching subscribed stocks (polls every X seconds)
  startWatching(intervalSeconds = 300) {
    if (this.watchInterval) {
      logger.warn('Already watching stocks');
      return;
    }

    logger.info(`Starting stock watch (every ${intervalSeconds}s)`);
    
    this.watchInterval = setInterval(async () => {
      if (this.subscribedStocks.length === 0) {
        logger.info('No subscribed stocks to watch');
        return;
      }

      try {
        logger.info(`Fetching updates for ${this.subscribedStocks.length} stocks`);
        const quotes = await this.getQuote(this.subscribedStocks);
        
        if (quotes) {
          await this.processQuotes(quotes);
        }
      } catch (error) {
        logger.error('Error in watch loop:', error.message);
      }
    }, intervalSeconds * 1000);
  }

  // Stop watching
  stopWatching() {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
      logger.info('Stopped watching stocks');
    }
  }

  // Process and log quotes (internal use)
  async processQuotes(quotes) {
    let message = '📊 **Stock Updates**\n\n';
    let hasData = false;

    for (const [symbol, data] of Object.entries(quotes)) {
      if (!data || !data.last_price) continue;
      
      hasData = true;
      const change = data.last_price - data.ohlc.close;
      const changePercent = ((change / data.ohlc.close) * 100).toFixed(2);
      const emoji = change >= 0 ? '📈' : '📉';

      message += `${emoji} **${symbol.replace('NSE:', '')}**\n`;
      message += `Price: ₹${data.last_price.toFixed(2)} `;
      message += `(${change >= 0 ? '+' : ''}${changePercent}%)\n`;
      message += `Vol: ${(data.volume / 100000).toFixed(2)}L\n\n`;
    }

    if (hasData) {
      logger.info('Stock updates processed');
      // Uncomment to send periodic updates to Discord (can be spammy!)
      // await discordService.log(message, 'info');
    }
  }

  // Get your watchlist stocks
  async getWatchlists() {
    try {
      if (!zerodhaService.isConnected) {
        logger.warn('Zerodha not connected');
        return null;
      }
      const watchlists = await zerodhaService.kite.getWatchlists();
      return watchlists;
    } catch (error) {
      logger.error('Error getting watchlists:', error.message);
      return null;
    }
  }

  // Get holdings (stocks you own)
  async getHoldings() {
    try {
      if (!zerodhaService.isConnected) {
        logger.warn('Zerodha not connected');
        return null;
      }
      const holdings = await zerodhaService.kite.getHoldings();
      return holdings;
    } catch (error) {
      logger.error('Error getting holdings:', error.message);
      return null;
    }
  }

  // Get positions (open trades today)
  async getPositions() {
    try {
      if (!zerodhaService.isConnected) {
        logger.warn('Zerodha not connected');
        return null;
      }
      const positions = await zerodhaService.kite.getPositions();
      return positions;
    } catch (error) {
      logger.error('Error getting positions:', error.message);
      return null;
    }
  }

  // Get orders
  async getOrders() {
    try {
      if (!zerodhaService.isConnected) {
        logger.warn('Zerodha not connected');
        return null;
      }
      const orders = await zerodhaService.kite.getOrders();
      return orders;
    } catch (error) {
      logger.error('Error getting orders:', error.message);
      return null;
    }
  }

  // Place an order
  async placeOrder(params) {
    try {
      if (!zerodhaService.isConnected) {
        logger.warn('Zerodha not connected');
        return null;
      }
      
      // params should include:
      // {
      //   exchange: "NSE",
      //   tradingsymbol: "RELIANCE",
      //   transaction_type: "BUY", // or "SELL"
      //   quantity: 1,
      //   product: "CNC", // or "MIS", "NRML"
      //   order_type: "MARKET", // or "LIMIT"
      //   price: 0, // for LIMIT orders
      //   validity: "DAY"
      // }
      
      const order = await zerodhaService.kite.placeOrder('regular', params);
      
      logger.info(`Order placed: ${params.transaction_type} ${params.quantity} ${params.tradingsymbol}`);
      
      await discordService.log(
        `📝 **Order Placed**\n` +
        `${params.transaction_type} ${params.quantity} ${params.tradingsymbol}\n` +
        `Type: ${params.order_type}\n` +
        `Order ID: ${order.order_id}`,
        'success'
      );
      
      return order;
    } catch (error) {
      logger.error('Error placing order:', error.message);
      
      await discordService.log(
        `❌ **Order Failed**\n${error.message}`,
        'error'
      );
      
      return null;
    }
  }

  // Cancel an order
  async cancelOrder(orderId, variety = 'regular') {
    try {
      if (!zerodhaService.isConnected) {
        logger.warn('Zerodha not connected');
        return null;
      }
      
      const result = await zerodhaService.kite.cancelOrder(variety, orderId);
      
      logger.info(`Order cancelled: ${orderId}`);
      
      await discordService.log(
        `🚫 **Order Cancelled**\nOrder ID: ${orderId}`,
        'warning'
      );
      
      return result;
    } catch (error) {
      logger.error('Error cancelling order:', error.message);
      return null;
    }
  }
}

module.exports = new MarketDataService();