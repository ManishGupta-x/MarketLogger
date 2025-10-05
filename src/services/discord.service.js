const { Client, GatewayIntentBits } = require('discord.js');
const logger = require('../utils/logger');
const stockCommands = require('../commands/stock.commands');

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
  }

  async initialize() {
    await this.client.login(process.env.DISCORD_BOT_TOKEN);
    
    this.client.once('ready', () => {
      this.logChannel = this.client.channels.cache.get(process.env.DISCORD_LOG_CHANNEL_ID);
      logger.info(`Discord bot logged in as ${this.client.user.tag}`);
      
      this.setupCommands();
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  setupCommands() {
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      if (message.channel.id !== process.env.DISCORD_LOG_CHANNEL_ID) return;
      if (!message.content.startsWith(this.commandPrefix)) return;

      const args = message.content.slice(this.commandPrefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      try {
        await this.handleCommand(command, args, message);
      } catch (error) {
        logger.error('Command error:', error);
        await message.reply(`❌ Error: ${error.message}`);
      }
    });

    logger.info('Discord commands active');
  }

  async handleCommand(command, args, message) {
    switch (command) {
      case 'search':
        await this.searchCommand(args, message);
        break;
      
      case 'sub':
      case 'subscribe':
        await this.subscribeCommand(args, message);
        break;
      
      case 'unsub':
      case 'unsubscribe':
        await this.unsubscribeCommand(args, message);
        break;
      
      case 'list':
        await this.listCommand(message);
        break;
      
      case 'help':
        await this.helpCommand(message);
        break;
      
      default:
        // Check if it's a stock name (starts with !)
        await this.stockInfoCommand(command, args, message);
    }
  }

  async stockInfoCommand(stockName, options, message) {
    // !RELIANCE or !TCS subscribe or !INFY history
    const symbol = stockName.toUpperCase();
    
    if (options.length === 0) {
      // No options - just show basic info
      await this.showBasicInfo(symbol, message);
    } else {
      const action = options[0].toLowerCase();
      
      switch (action) {
        case 'sub':
        case 'subscribe':
          await this.quickSubscribe(symbol, message);
          break;
        
        case 'unsub':
        case 'unsubscribe':
          await this.quickUnsubscribe(symbol, message);
          break;
        
        case 'full':
        case 'detail':
        case 'details':
          await this.showFullInfo(symbol, message);
          break;
        
        case 'ohlc':
          await this.showOHLC(symbol, message);
          break;
        
        case 'chart':
        case 'history':
          await this.showHistory(symbol, options.slice(1), message);
          break;
        
        default:
          await message.reply(`❓ Unknown option: ${action}\n\nAvailable options:\n\`!${symbol} subscribe\` - Subscribe to stock\n\`!${symbol} full\` - Full details\n\`!${symbol} ohlc\` - OHLC data\n\`!${symbol} history\` - Historical data`);
      }
    }
  }

  async showBasicInfo(symbol, message) {
    await message.reply(`⏳ Fetching ${symbol}...`);

    const data = await stockCommands.getStockInfo(symbol);

    if (!data) {
      await message.reply(`❌ Could not fetch data for ${symbol}. Try \`!search ${symbol}\` to find the correct symbol.`);
      return;
    }

    const formattedSymbol = symbol.startsWith('NSE:') ? symbol : `NSE:${symbol}`;
    const change = data.last_price - data.ohlc.close;
    const changePercent = ((change / data.ohlc.close) * 100).toFixed(2);
    const emoji = change >= 0 ? '📈' : '📉';
    const color = change >= 0 ? '🟢' : '🔴';

    let reply = `${emoji} **${symbol}**\n\n`;
    reply += `${color} **₹${data.last_price.toFixed(2)}**\n`;
    reply += `${change >= 0 ? '+' : ''}₹${change.toFixed(2)} (${changePercent}%)\n\n`;
    reply += `High: ₹${data.ohlc.high} | Low: ₹${data.ohlc.low}\n`;
    reply += `Volume: ${(data.volume / 100000).toFixed(2)}L\n\n`;
    reply += `💡 **Options:**\n`;
    reply += `\`!${symbol} subscribe\` - Subscribe to updates\n`;
    reply += `\`!${symbol} full\` - Full details\n`;
    reply += `\`!${symbol} ohlc\` - OHLC data\n`;

    await message.reply(reply);
  }

  async showFullInfo(symbol, message) {
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

  async showOHLC(symbol, message) {
    await message.reply(`⏳ Fetching OHLC for ${symbol}...`);

    const data = await stockCommands.getStockInfo(symbol);

    if (!data) {
      await message.reply(`❌ Could not fetch data for ${symbol}`);
      return;
    }

    let reply = `📊 **${symbol} - OHLC Data**\n\n`;
    reply += `**Open:** ₹${data.ohlc.open}\n`;
    reply += `**High:** ₹${data.ohlc.high}\n`;
    reply += `**Low:** ₹${data.ohlc.low}\n`;
    reply += `**Close:** ₹${data.ohlc.close}\n`;
    reply += `**Last Price:** ₹${data.last_price}\n\n`;
    reply += `**Volume:** ${data.volume.toLocaleString()}\n`;
    reply += `**Avg Price:** ₹${data.average_price.toFixed(2)}\n`;

    await message.reply(reply);
  }

  async showHistory(symbol, options, message) {
    await message.reply(`⏳ Fetching historical data for ${symbol}...`);

    // For now, just show a message - you can implement historical data later
    let reply = `📈 **${symbol} - Historical Data**\n\n`;
    reply += `⚠️ Historical data feature coming soon!\n\n`;
    reply += `Will support:\n`;
    reply += `\`!${symbol} history 1day\` - Last 1 day\n`;
    reply += `\`!${symbol} history 1week\` - Last 1 week\n`;
    reply += `\`!${symbol} history 1month\` - Last 1 month\n`;

    await message.reply(reply);
  }

  async quickSubscribe(symbol, message) {
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

    let reply = `✅ Subscribed to **${symbol}**\n\n`;
    reply += `${emoji} Current Price: ₹${stockInfo.last_price.toFixed(2)}\n`;
    reply += `Change: ${change >= 0 ? '+' : ''}₹${change.toFixed(2)} (${changePercent}%)\n`;

    await message.reply(reply);
  }

  async quickUnsubscribe(symbol, message) {
    const result = await stockCommands.unsubscribeStock(symbol);

    if (!result.success) {
      await message.reply(`❌ ${result.message}`);
      return;
    }

    await message.reply(`✅ Unsubscribed from **${symbol}**`);
  }

  async searchCommand(args, message) {
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
      reply += `${index + 1}. **${stock.tradingsymbol}** - ${stock.name || 'N/A'}\n`;
      reply += `   Type: \`!${stock.tradingsymbol}\` for info\n\n`;
    });

    await message.reply(reply);
  }

  async subscribeCommand(args, message) {
    if (args.length === 0) {
      await message.reply('❌ Usage: `!subscribe <SYMBOL>`');
      return;
    }

    const symbol = args[0].toUpperCase();
    await this.quickSubscribe(symbol, message);
  }

  async unsubscribeCommand(args, message) {
    if (args.length === 0) {
      await message.reply('❌ Usage: `!unsubscribe <SYMBOL>`');
      return;
    }

    const symbol = args[0].toUpperCase();
    await this.quickUnsubscribe(symbol, message);
  }

  async listCommand(message) {
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
    const help = `
📚 **Bot Commands**

**Quick Stock Info:**
\`!SYMBOL\` - Get basic stock info
\`!RELIANCE\` - Example

**Stock with Options:**
\`!SYMBOL subscribe\` - Subscribe to stock
\`!SYMBOL full\` - Full details
\`!SYMBOL ohlc\` - OHLC data
\`!SYMBOL history\` - Historical data (coming soon)

**Search & Manage:**
\`!search <name>\` - Search for stocks
\`!subscribe <SYMBOL>\` - Subscribe to a stock
\`!unsubscribe <SYMBOL>\` - Unsubscribe
\`!list\` - Show subscribed stocks

**Examples:**
\`!search reliance\`
\`!RELIANCE\`
\`!RELIANCE subscribe\`
\`!RELIANCE full\`
\`!TCS ohlc\`
\`!list\`
`;

    await message.reply(help);
  }

  async log(message, type = 'info') {
    if (!this.logChannel) return;

    const emoji = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const prefix = emoji[type] || emoji.info;
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    
    const formattedMessage = `${prefix} **[${timestamp}]**\n${message}`;

    await this.logChannel.send(formattedMessage);
  }
}

module.exports = new DiscordService();