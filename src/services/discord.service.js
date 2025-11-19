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
    this.channelManager = null;
  }

  async initialize(channelManager = null) {
    this.channelManager = channelManager;

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
    const paperTradingCommands = require('../commands/paper-trading.commands');

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      // Check if this is a valid channel for commands
      const channelIds = this.channelManager ? this.channelManager.getChannelIds() : [];
      const isLogChannel = message.channel.id === process.env.DISCORD_LOG_CHANNEL_ID;
      const isTradingChannel = channelIds.includes(message.channel.id);

      if (!isLogChannel && !isTradingChannel) return;
      if (!message.content.startsWith(this.commandPrefix)) return;

      const args = message.content.slice(this.commandPrefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      try {
        await this.handleCommand(command, args, message, paperTradingCommands);
      } catch (error) {
        logger.error('Command error:', error);
        await message.reply(`❌ Error: ${error.message}`);
      }
    });

    logger.info(`Discord commands active${this.channelManager ? ' with multi-channel support' : ''}`);
  }

  async handleCommand(command, args, message, paperTradingCommands) {
    switch (command) {
      // System Commands
      case 'debug':
        await this.debugCommand(message);
        break;

      case 'status':
        await paperTradingCommands.statusCommand(message);
        break;

      case 'ticker':
        await this.tickerCommand(args, message);
        break;

      case 'time':
        await this.timeCommand(message);
        break;

      case 'help':
        await this.helpCommand(message);
        break;

      case 'test':
        await this.testCommand(args, message);
        break;

      // Paper Trading Commands
      case 'portfolio':
        await paperTradingCommands.portfolioCommand(message);
        break;

      case 'holdings':
        await paperTradingCommands.holdingsCommand(message);
        break;

      case 'orders':
        await paperTradingCommands.ordersCommand(args, message);
        break;

      case 'pnl':
        await paperTradingCommands.pnlCommand(message);
        break;

      case 'topstocks':
        await paperTradingCommands.topStocksCommand(message);
        break;

      case 'grid':
        await paperTradingCommands.gridCommand(args, message);
        break;

      case 'grids':
        await paperTradingCommands.gridsCommand(message);
        break;

      case 'reset':
        await paperTradingCommands.resetCommand(message);
        break;

      case 'config':
        await paperTradingCommands.configCommand(args, message);
        break;

      case 'start-trading':
        await paperTradingCommands.startTradingCommand(message);
        break;

      case 'stop-trading':
        await paperTradingCommands.stopTradingCommand(message);
        break;

      default:
        await message.reply(`❌ Unknown command: \`!${command}\`\nType \`!help\` for available commands.`);
    }
  }

  async testCommand(args, message) {
    try {
      const zerodhaService = require('./zerodha.service');
      const marketData = require('./market-data.service');

      await message.reply('🧪 Running diagnostic tests...');

      let results = '📋 **Diagnostic Results**\n\n';

      try {
        const instruments = await zerodhaService.kite.getInstruments('NSE');
        results += `✅ Can fetch instruments: ${instruments.length} total\n`;

        const pfs = instruments.find(i => i.tradingsymbol === 'PFS');
        const tcs = instruments.find(i => i.tradingsymbol === 'TCS');

        if (pfs) {
          results += `✅ PFS found - Token: ${pfs.instrument_token}\n`;
        } else {
          results += `❌ PFS not found in NSE instruments\n`;
        }

        if (tcs) {
          results += `✅ TCS found - Token: ${tcs.instrument_token}\n`;
        } else {
          results += `❌ TCS not found in NSE instruments\n`;
        }

      } catch (error) {
        results += `❌ Failed to fetch instruments: ${error.message}\n`;
      }

      results += '\n';

      if (marketData.subscribedStocks.length > 0) {
        results += `**Testing Subscribed Stocks:**\n`;

        for (const symbol of marketData.subscribedStocks) {
          try {
            const quote = await marketData.getQuote([symbol]);
            if (quote && quote[symbol]) {
              results += `✅ ${symbol}: ₹${quote[symbol].last_price}\n`;
            } else {
              results += `⚠️ ${symbol}: No data returned\n`;
            }
          } catch (error) {
            results += `❌ ${symbol}: ${error.message}\n`;
          }
        }
      } else {
        results += `⚠️ No subscribed stocks to test\n`;
      }

      results += '\n';

      const tickerService = require('./ticker.service');
      const status = tickerService.getStatus();

      results += `**WebSocket Status:**\n`;
      results += `Connection: ${status.connected ? '✅ Connected' : '❌ Disconnected'}\n`;
      results += `Subscribed tokens: ${status.subscribedTokens}\n`;
      results += `Ticks received: ${status.totalTicks}\n`;

      if (status.subscribedTokens === 0) {
        results += `\n⚠️ **Issue Found:** No tokens subscribed to WebSocket!\n`;
        results += `Try: \`!ticker restart\`\n`;
      } else if (status.totalTicks === 0) {
        results += `\n⚠️ **Issue Found:** WebSocket connected but no ticks\n`;
        results += `Possible reasons:\n`;
        results += `- Market is closed or it's a holiday\n`;
        results += `- Stocks are not trading today\n`;
        results += `- Access token issue\n`;
      }

      await message.reply(results);

    } catch (error) {
      await message.reply(`❌ Test failed: ${error.message}`);
    }
  }

  async debugCommand(message) {
    try {
      const tickerService = require('./ticker.service');
      const zerodhaService = require('./zerodha.service');
      const paperTradingService = require('./paper-trading.service');
      const gridStrategyService = require('./grid-strategy.service');

      const status = tickerService.getStatus();
      const gridStatus = gridStrategyService.getStatus();
      const portfolio = paperTradingService.getPortfolio();
      const now = new Date();
      const istTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      const istHour = parseInt(new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        hour12: false
      }));
      const isMarketHours = istHour >= 9 && istHour < 16;

      let debug = `🔍 **System Debug Status**\n\n`;

      debug += `**Zerodha Connection:**\n`;
      debug += `${zerodhaService.isConnected ? '✅' : '❌'} Zerodha API: ${zerodhaService.isConnected ? 'Connected' : 'Disconnected'}\n\n`;

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

      debug += `**Paper Trading:**\n`;
      debug += `${paperTradingService.isEnabled ? '✅' : '❌'} Trading: ${paperTradingService.isEnabled ? 'Enabled' : 'Disabled'}\n`;
      debug += `${gridStatus.active ? '✅' : '❌'} Grid Strategy: ${gridStatus.active ? 'Active' : 'Inactive'}\n`;
      debug += `💰 Cash: ₹${portfolio.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
      debug += `📦 Holdings: ${portfolio.holdings_count} stocks\n`;
      debug += `📈 Total P&L: ₹${portfolio.total_pnl.toFixed(2)} (${portfolio.pnl_percent.toFixed(2)}%)\n`;
      debug += `🎯 Active Grids: ${gridStatus.active_grids}\n\n`;

      debug += `**Market Status:**\n`;
      debug += `⏰ Current IST Time: ${istTime}\n`;
      debug += `${isMarketHours ? '✅' : '⏸️'} Market: ${isMarketHours ? 'OPEN (9:15 AM - 3:30 PM)' : 'CLOSED'}\n\n`;

      if (!status.connected) {
        debug += `\n💡 Try: \`!ticker restart\``;
      } else if (!paperTradingService.isEnabled) {
        debug += `\n💡 Try: \`!start-trading\` to begin grid trading`;
      }

      await message.reply(debug);

    } catch (error) {
      await message.reply(`❌ Debug error: ${error.message}`);
    }
  }

  async tickerCommand(args, message) {
    const tickerService = require('./ticker.service');

    if (args.length === 0 || args[0] === 'status') {
      const status = tickerService.getStatus();
      let reply = `📊 **Ticker Status**\n\n`;
      reply += `WebSocket: ${status.connected ? '✅ Connected' : '❌ Disconnected'}\n`;
      reply += `Subscribed: ${status.subscribedTokens} stocks\n`;
      reply += `Data received: ${status.stocksWithData} stocks\n`;
      reply += `Total ticks: ${status.totalTicks}\n`;

      if (status.lastTick) {
        const secAgo = Math.floor((Date.now() - status.lastTick) / 1000);
        reply += `Last tick: ${secAgo}s ago\n`;
      }

      await message.reply(reply);
      return;
    }

    const action = args[0].toLowerCase();

    switch (action) {
      case 'start':
      case 'restart':
        await message.reply('🔄 Restarting ticker service...');
        try {
          await tickerService.stop();
          await new Promise(resolve => setTimeout(resolve, 2000));
          await tickerService.initialize();
          await message.reply('✅ Ticker service restarted!');
        } catch (error) {
          await message.reply(`❌ Failed to restart: ${error.message}`);
        }
        break;

      case 'stop':
        await tickerService.stop();
        await message.reply('🛑 Ticker service stopped');
        break;

      case 'debug':
        await this.tickerDebugCommand(message, tickerService);
        break;

      case 'test':
        await this.tickerTestCommand(message);
        break;

      case 'resub':
      case 'resubscribe':
        await this.tickerResubCommand(message, tickerService);
        break;

      default:
        await message.reply('Usage: `!ticker [status|start|restart|stop|debug|test|resub]`');
    }
  }

  async tickerDebugCommand(message, tickerService) {
    try {
      await tickerService.debugSubscription();
      
      const status = tickerService.getStatus();
      
      const embed = {
        title: '🔍 Ticker Debug Info',
        color: status.connected ? 0x00ff00 : 0xff0000,
        fields: [
          { name: 'WebSocket', value: status.connected ? '✅ Connected' : '❌ Disconnected', inline: true },
          { name: 'Subscribed Tokens', value: status.subscribedTokens.toString(), inline: true },
          { name: 'Ticks Received', value: status.totalTicks.toString(), inline: true },
          { name: 'Heartbeats', value: (status.heartbeats || 0).toString(), inline: true },
          { name: 'Stocks with Data', value: status.stocksWithData.toString(), inline: true },
          { name: 'Last Tick', value: status.lastTick ? new Date(status.lastTick).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never', inline: true }
        ],
        timestamp: new Date()
      };
      
      await message.reply({ embeds: [embed] });
    } catch (error) {
      await message.reply(`❌ Debug failed: ${error.message}`);
    }
  }

  async tickerTestCommand(message) {
    const stockCommands = require('../commands/stock.commands');
    
    await message.reply('🧪 Testing with RELIANCE (high volume stock)...');
    
    try {
      const result = await stockCommands.subscribeStock('RELIANCE');
      
      if (result.success) {
        await message.reply('✅ Subscribed to RELIANCE. Check logs for ticks in 10-30 seconds.\n💡 Use `!ticker debug` to monitor status.');
      } else {
        await message.reply(`❌ Test failed: ${result.message}`);
      }
    } catch (error) {
      await message.reply(`❌ Test failed: ${error.message}`);
    }
  }

  async tickerResubCommand(message, tickerService) {
    if (!tickerService.isConnected) {
      await message.reply('❌ WebSocket not connected. Try `!ticker restart` first.');
      return;
    }
    
    if (!tickerService.subscribedTokens || tickerService.subscribedTokens.length === 0) {
      await message.reply('❌ No stocks subscribed. Use `!subscribe SYMBOL` first.');
      return;
    }
    
    try {
      await message.reply('🔄 Resubscribing to all stocks...');
      
      tickerService.ticker.subscribe(tickerService.subscribedTokens);
      await new Promise(resolve => setTimeout(resolve, 500));
      tickerService.ticker.setMode(tickerService.ticker.modeFull, tickerService.subscribedTokens);
      
      await message.reply(`✅ Resubscribed to ${tickerService.subscribedTokens.length} stocks. Check logs for ticks.`);
    } catch (error) {
      await message.reply(`❌ Resubscription failed: ${error.message}`);
    }
  }

  async timeCommand(message) {
    const now = new Date();

    const istTime = now.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'long'
    });

    const istHour = parseInt(new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false
    }));

    const dayOfWeek = now.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long'
    });
    const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';

    let reply = `🕐 **Time Information**\n\n`;
    reply += `**IST Time:** ${istTime}\n`;
    reply += `**IST Hour:** ${istHour}:00\n`;
    reply += `**Day:** ${dayOfWeek}\n\n`;

    reply += `**Market Status:**\n`;
    if (isWeekend) {
      reply += `⏸️ Weekend - Market closed\n`;
    } else if (istHour < 9) {
      reply += `⏸️ Pre-market - Opens at 9:15 AM\n`;
    } else if (istHour >= 9 && istHour < 16) {
      reply += `✅ Market is OPEN (9:15 AM - 3:30 PM)\n`;
    } else {
      reply += `⏸️ After hours - Market closed\n`;
    }

    reply += `\n**Server Time:** ${now.toString()}`;

    await message.reply(reply);
  }

  async helpCommand(message) {
    const help = `📚 **Grid Trading Bot Commands**

**Paper Trading:**
\`!status\` - Trading bot status
\`!portfolio\` - View portfolio summary
\`!holdings\` - Current holdings
\`!orders [today|week|all]\` - Order history
\`!pnl\` - Profit & loss summary
\`!topstocks\` - Best/worst performers
\`!grid <SYMBOL>\` - Grid levels for stock
\`!grids\` - All active grids
\`!start-trading\` - Start grid bot
\`!stop-trading\` - Stop grid bot

**Configuration:**
\`!config\` - View current settings
\`!config set amount_per_trade <amount>\` - Set trade amount
\`!config set grid_percentage <percent>\` - Set grid %
\`!reset\` - Reset portfolio (requires confirmation)

**System:**
\`!debug\` - System diagnostics
\`!ticker [status|restart|debug]\` - Manage ticker
\`!time\` - IST time and market status
\`!test\` - Run connection tests
\`!help\` - Show this message

**Examples:**
\`!start-trading\` - Start the 5% grid bot
\`!portfolio\` - Check your virtual portfolio
\`!grid RELIANCE\` - See RELIANCE grid levels
\`!config set amount_per_trade 15000\` - Trade ₹15k per order
\`!orders today\` - View today's trades

**Grid Strategy:**
🟢 Buys when price drops 5% from reference
🔴 Sells when price rises 5% from last buy
📊 Monitors 707 stocks automatically
💰 Virtual trading with ₹5L capital`;

    await message.reply(help);
  }

  async log(message, type = 'info') {
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

  async logToChannel(channelId, message, type = 'info') {
    if (!this.isReady || !this.client) {
      logger.warn('Discord not ready, logging to console only');
      logger.info(message);
      return;
    }

    try {
      const channel = this.client.channels.cache.get(channelId);

      if (!channel) {
        logger.error(`Channel not found: ${channelId}`);
        // Fallback to default log channel
        await this.log(message, type);
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

      await channel.send(formattedMessage);
    } catch (error) {
      logger.error(`Failed to send Discord message to channel ${channelId}:`, error.message);
      // Fallback to default log channel
      await this.log(message, type);
    }
  }
}

module.exports = new DiscordService();