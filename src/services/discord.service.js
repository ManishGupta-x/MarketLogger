const { Client, GatewayIntentBits } = require('discord.js');
const logger = require('../utils/logger');

class DiscordService {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });
    this.logChannel = null;
    this.commandPrefix = '!';
    this.isReady = false;
  }

  async initialize() {
    return new Promise((resolve) => {
      this.client.once('ready', () => {
        this.logChannel = this.client.channels.cache.get(process.env.DISCORD_LOG_CHANNEL_ID);
        this.isReady = true;
        logger.info(`Discord bot logged in as ${this.client.user.tag}`);

        this.setupCommands();
        resolve();
      });

      this.client.login(process.env.DISCORD_BOT_TOKEN);
    });
  }

  setupCommands() {
    // Only import stock commands after Discord is ready
    const stockCommands = require('../commands/stock.commands');

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      if (message.channel.id !== process.env.DISCORD_LOG_CHANNEL_ID) return;
      if (!message.content.startsWith(this.commandPrefix)) return;

      const args = message.content.slice(this.commandPrefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      try {
        await this.handleCommand(command, args, message, stockCommands);
      } catch (error) {
        logger.error('Command error:', error);
        await message.reply(`❌ Error: ${error.message}`);
      }
    });

    logger.info('Discord commands active');
  }

  async handleCommand(command, args, message, stockCommands) {
    switch (command) {
      case 'search':
        await this.searchCommand(args, message, stockCommands);
        break;

      case 'sub':
      case 'subscribe':
        await this.subscribeCommand(args, message, stockCommands);
        break;

      case 'unsub':
      case 'unsubscribe':
        await this.unsubscribeCommand(args, message, stockCommands);
        break;

      case 'list':
        await this.listCommand(message, stockCommands);
        break;

      case 'help':
        await this.helpCommand(message);
        break;
      case 'debug':
      case 'status':
        await this.debugCommand(message);
        break;

      default:
        await this.stockInfoCommand(command, args, message, stockCommands);
    }
  }


  async debugCommand(message) {
    try {
      const tickerService = require('./ticker.service');
      const zerodhaService = require('./zerodha.service');
      const marketData = require('./market-data.service');

      const status = tickerService.getStatus();
      const now = new Date();
      const istTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const hour = now.getHours();
      const isMarketHours = hour >= 9 && hour < 16;

      let debug = `🔍 **System Debug Status**\n\n`;

      // Zerodha Status
      debug += `**Zerodha Connection:**\n`;
      debug += `${zerodhaService.isConnected ? '✅' : '❌'} Zerodha API: ${zerodhaService.isConnected ? 'Connected' : 'Disconnected'}\n\n`;

      // WebSocket Status
      debug += `**WebSocket Ticker:**\n`;
      debug += `${status.connected ? '✅' : '❌'} WebSocket: ${status.connected ? 'Connected' : 'Disconnected'}\n`;
      debug += `📊 Subscribed Tokens: ${status.subscribedTokens}\n`;
      debug += `📈 Stocks with Data: ${status.stocksWithData}\n`;
      debug += `🎫 Total Ticks Received: ${status.totalTicks}\n`;

      if (status.lastTick) {
        const secAgo = Math.floor((Date.now() - status.lastTick) / 1000);
        debug += `⏱️ Last Tick: ${secAgo}s ago\n`;
      } else {
        debug += `⏱️ Last Tick: Never\n`;
      }
      debug += `\n`;

      // Discord Status
      debug += `**Discord Ticker:**\n`;
      const tickerChannel = this.client.channels.cache.get(status.channelId);
      debug += `${tickerChannel ? '✅' : '❌'} Channel Found: ${tickerChannel ? 'Yes' : 'No'}\n`;
      debug += `${status.messageCreated ? '✅' : '❌'} Message Created: ${status.messageCreated ? 'Yes' : 'No'}\n`;
      debug += `📺 Channel ID: ${status.channelId || 'Not Set'}\n\n`;

      // Market Status
      debug += `**Market Status:**\n`;
      debug += `⏰ Current Time: ${istTime}\n`;
      debug += `${isMarketHours ? '✅' : '⏸️'} Market: ${isMarketHours ? 'OPEN (9:15 AM - 3:30 PM)' : 'CLOSED'}\n\n`;

      // Subscriptions
      debug += `**Subscriptions:**\n`;
      debug += `📋 Total: ${marketData.subscribedStocks.length}\n`;
      if (marketData.subscribedStocks.length > 0) {
        debug += `Stocks: ${marketData.subscribedStocks.map(s => s.replace('NSE:', '')).join(', ')}\n`;
      }

      await message.reply(debug);

    } catch (error) {
      await message.reply(`❌ Debug error: ${error.message}`);
    }
  }

  async stockInfoCommand(stockName, options, message, stockCommands) {
    const symbol = stockName.toUpperCase();

    if (options.length === 0) {
      await this.showBasicInfo(symbol, message, stockCommands);
    } else {
      const action = options[0].toLowerCase();

      switch (action) {
        case 'sub':
        case 'subscribe':
          await this.quickSubscribe(symbol, message, stockCommands);
          break;

        case 'unsub':
        case 'unsubscribe':
          await this.quickUnsubscribe(symbol, message, stockCommands);
          break;

        case 'full':
        case 'detail':
        case 'details':
          await this.showFullInfo(symbol, message, stockCommands);
          break;

        case 'ohlc':
          await this.showOHLC(symbol, message, stockCommands);
          break;

        default:
          await message.reply(`❓ Unknown option: ${action}\n\nAvailable options:\n\`!${symbol} subscribe\` - Subscribe\n\`!${symbol} full\` - Full details\n\`!${symbol} ohlc\` - OHLC data`);
      }
    }
  }

  async showBasicInfo(symbol, message, stockCommands) {
    await message.reply(`⏳ Fetching ${symbol}...`);
    const data = await stockCommands.getStockInfo(symbol);

    if (!data) {
      await message.reply(`❌ Could not fetch data for ${symbol}. Try \`!search ${symbol}\``);
      return;
    }

    const change = data.last_price - data.ohlc.close;
    const changePercent = ((change / data.ohlc.close) * 100).toFixed(2);
    const emoji = change >= 0 ? '📈' : '📉';
    const color = change >= 0 ? '🟢' : '🔴';

    let reply = `${emoji} **${symbol}**\n\n`;
    reply += `${color} **₹${data.last_price.toFixed(2)}**\n`;
    reply += `${change >= 0 ? '+' : ''}₹${change.toFixed(2)} (${changePercent}%)\n\n`;
    reply += `High: ₹${data.ohlc.high} | Low: ₹${data.ohlc.low}\n`;
    reply += `Volume: ${(data.volume / 100000).toFixed(2)}L\n\n`;
    reply += `💡 **Options:**\n\`!${symbol} subscribe\` - Subscribe\n\`!${symbol} full\` - Full details\n\`!${symbol} ohlc\` - OHLC data`;

    await message.reply(reply);
  }

  async showFullInfo(symbol, message, stockCommands) {
    await message.reply(`⏳ Fetching full details for ${symbol}...`);
    const data = await stockCommands.getStockInfo(symbol);

    if (!data) {
      await message.reply(`❌ Could not fetch data for ${symbol}`);
      return;
    }

    const formattedSymbol = symbol.startsWith('NSE:') ? symbol : `NSE:${symbol}`;
    const formattedInfo = stockCommands.formatStockInfo(formattedSymbol, data);
    await message.reply(formattedInfo);
  }

  async showOHLC(symbol, message, stockCommands) {
    await message.reply(`⏳ Fetching OHLC for ${symbol}...`);
    const data = await stockCommands.getStockInfo(symbol);

    if (!data) {
      await message.reply(`❌ Could not fetch data for ${symbol}`);
      return;
    }

    let reply = `📊 **${symbol} - OHLC Data**\n\n`;
    reply += `**Open:** ₹${data.ohlc.open}\n**High:** ₹${data.ohlc.high}\n**Low:** ₹${data.ohlc.low}\n**Close:** ₹${data.ohlc.close}\n**Last Price:** ₹${data.last_price}\n\n`;
    reply += `**Volume:** ${data.volume.toLocaleString()}\n**Avg Price:** ₹${data.average_price.toFixed(2)}`;

    await message.reply(reply);
  }

  async quickSubscribe(symbol, message, stockCommands) {
    await message.reply(`⏳ Subscribing to ${symbol}...`);
    const result = await stockCommands.subscribeStock(symbol);

    if (!result.success) {
      await message.reply(`❌ ${result.message}`);
      return;
    }

    const stockInfo = result.quote[result.symbol];
    const change = stockInfo.last_price - stockInfo.ohlc.close;
    const changePercent = ((change / stockInfo.ohlc.close) * 100).toFixed(2);
    const emoji = change >= 0 ? '📈' : '📉';

    let reply = `✅ Subscribed to **${symbol}**\n\n${emoji} Current Price: ₹${stockInfo.last_price.toFixed(2)}\nChange: ${change >= 0 ? '+' : ''}₹${change.toFixed(2)} (${changePercent}%)`;
    await message.reply(reply);
  }

  async quickUnsubscribe(symbol, message, stockCommands) {
    const result = await stockCommands.unsubscribeStock(symbol);

    if (!result.success) {
      await message.reply(`❌ ${result.message}`);
      return;
    }

    await message.reply(`✅ Unsubscribed from **${symbol}**`);
  }

  async searchCommand(args, message, stockCommands) {
    if (args.length === 0) {
      await message.reply('❌ Usage: `!search <stock name>`');
      return;
    }

    const query = args.join(' ');
    await message.reply(`🔍 Searching for "${query}"...`);

    const results = await stockCommands.searchStock(query);

    if (results.length === 0) {
      await message.reply('❌ No stocks found matching your query.');
      return;
    }

    let reply = `📊 **Search Results for "${query}":**\n\n`;
    results.forEach((stock, index) => {
      reply += `${index + 1}. **${stock.tradingsymbol}** - ${stock.name || 'N/A'}\n   Type: \`!${stock.tradingsymbol}\` for info\n\n`;
    });

    await message.reply(reply);
  }

  async subscribeCommand(args, message, stockCommands) {
    if (args.length === 0) {
      await message.reply('❌ Usage: `!subscribe <SYMBOL>`');
      return;
    }

    const symbol = args[0].toUpperCase();
    await this.quickSubscribe(symbol, message, stockCommands);
  }

  async unsubscribeCommand(args, message, stockCommands) {
    if (args.length === 0) {
      await message.reply('❌ Usage: `!unsubscribe <SYMBOL>`');
      return;
    }

    const symbol = args[0].toUpperCase();
    await this.quickUnsubscribe(symbol, message, stockCommands);
  }

  async listCommand(message, stockCommands) {
    const subscribed = stockCommands.getSubscribedStocks();

    if (subscribed.length === 0) {
      await message.reply('📭 No subscribed stocks. Use `!search` to find stocks!');
      return;
    }

    let reply = `📋 **Subscribed Stocks (${subscribed.length}):**\n\n`;
    subscribed.forEach((stock, index) => {
      const symbol = stock.replace('NSE:', '');
      reply += `${index + 1}. ${symbol} - Type \`!${symbol}\` for info\n`;
    });

    await message.reply(reply);
  }
  async helpCommand(message) {
    const help = `📚 **Bot Commands**

**Quick Stock Info:**
\`!SYMBOL\` - Get basic stock info

**Stock with Options:**
\`!SYMBOL subscribe\` - Subscribe to stock
\`!SYMBOL full\` - Full details
\`!SYMBOL ohlc\` - OHLC data

**Search & Manage:**
\`!search <name>\` - Search for stocks
\`!subscribe <SYMBOL>\` - Subscribe
\`!unsubscribe <SYMBOL>\` - Unsubscribe
\`!list\` - Show subscriptions

**System:**
\`!debug\` or \`!status\` - Check system status
\`!help\` - Show this message

**Examples:**
\`!search reliance\`
\`!RELIANCE\`
\`!RELIANCE subscribe\`
\`!TCS full\`
\`!debug\``;

    await message.reply(help);
  }
  async log(message, type = 'info') {
    // Check if Discord is ready before logging
    if (!this.isReady || !this.logChannel) {
      logger.warn('Discord not ready, logging to console only');
      logger.info(message);
      return;
    }

    const emoji = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const prefix = emoji[type] || emoji.info;
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const formattedMessage = `${prefix} **[${timestamp}]**\n${message}`;

    try {
      await this.logChannel.send(formattedMessage);
    } catch (error) {
      logger.error('Failed to send Discord message:', error.message);
    }
  }
}

module.exports = new DiscordService();