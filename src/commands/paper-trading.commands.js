const db = require('../services/database.service');
const logger = require('../utils/logger');
const discordService = require('../services/discord.service');
const fs = require('fs');
const path = require('path');

class PaperTradingCommands {
  // Helper to update .env file
  updateEnvFile(key, value) {
    const envPath = path.join(__dirname, '../../.env');

    try {
      let envContent = fs.readFileSync(envPath, 'utf8');
      const regex = new RegExp(`^${key}=.*$`, 'm');

      if (regex.test(envContent)) {
        // Update existing key
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        // Add new key
        envContent += `\n${key}=${value}`;
      }

      fs.writeFileSync(envPath, envContent);
      logger.info(`✅ Updated .env: ${key}=${value}`);
      return true;
    } catch (error) {
      logger.error(`Failed to update .env file:`, error);
      return false;
    }
  }

  // Helper to get channel number from channel id
  getChannelNumber(channelId) {
    if (channelId === process.env.DISCORD_CHANNEL_1_ID) return 1;
    if (channelId === process.env.DISCORD_CHANNEL_2_ID) return 2;
    if (channelId === process.env.DISCORD_CHANNEL_3_ID) return 3;
    return null;
  }

  // Helper to get the correct channel instance based on message channel
  getChannelInstance(message) {
    const channelManager = discordService.channelManager;
    if (!channelManager) {
      throw new Error('Channel Manager not initialized. Bot may not be connected to Zerodha.');
    }

    const channel = channelManager.getChannel(message.channel.id);
    if (!channel) {
      throw new Error(`This channel is not configured for trading. Please use a configured trading channel.`);
    }

    return channel;
  }

  async portfolioCommand(message) {
    try {
      const channel = this.getChannelInstance(message);
      const portfolio = channel.paperTradingService.getPortfolio();
      const config = channel.config;

      const fields = [
        {
          name: '💵 Cash Balance',
          value: `₹${portfolio.cash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          inline: true
        },
        {
          name: '📊 Holdings Value',
          value: `₹${portfolio.holdings_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          inline: true
        }
      ];

      fields.push(
        {
          name: '💰 Total Value',
          value: `₹${portfolio.total_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          inline: true
        },
        {
          name: '📈 Total P&L',
          value: `₹${portfolio.total_pnl.toFixed(2)} (${portfolio.pnl_percent.toFixed(2)}%)`,
          inline: false
        },
        {
          name: '💹 Realized P&L',
          value: `₹${portfolio.realized_pnl.toFixed(2)}`,
          inline: true
        },
        {
          name: '📊 Unrealized P&L',
          value: `₹${portfolio.unrealized_pnl.toFixed(2)}`,
          inline: true
        },
        {
          name: '🎯 Positions',
          value: `${portfolio.holdings_count}`,
          inline: true
        },
        {
          name: '📅 Today\'s Orders',
          value: `${portfolio.today_orders}`,
          inline: true
        },
        {
          name: '💵 Today\'s P&L',
          value: `₹${portfolio.today_pnl.toFixed(2)}`,
          inline: true
        },
        {
          name: '💼 Initial Capital',
          value: `₹${portfolio.initial_capital.toLocaleString('en-IN')}`,
          inline: true
        }
      );

      const embed = {
        title: `💼 ${config.name} Portfolio`,
        description: `**Config:** Capital: ₹${config.initialCapital.toLocaleString('en-IN')} | Trade: ₹${config.amountPerTrade.toLocaleString('en-IN')} | Grid: ${config.gridPercentage}%`,
        color: portfolio.total_pnl >= 0 ? 0x00ff00 : 0xff0000,
        fields: fields,
        timestamp: new Date()
      };

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Portfolio command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async portfolioByNumberCommand(channelNumber, message) {
    try {
      const channelManager = discordService.channelManager;
      if (!channelManager) {
        throw new Error('Channel Manager not initialized.');
      }

      const channels = channelManager.getAllChannels();
      if (channelNumber < 1 || channelNumber > channels.length) {
        await message.reply(`❌ Invalid channel number. Available: 1-${channels.length}`);
        return;
      }

      const channel = channels[channelNumber - 1];
      const portfolio = channel.paperTradingService.getPortfolio();
      const config = channel.config;

      const fields = [
        {
          name: '💵 Cash Balance',
          value: `₹${portfolio.cash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          inline: true
        },
        {
          name: '📊 Holdings Value',
          value: `₹${portfolio.holdings_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          inline: true
        }
      ];

      fields.push(
        {
          name: '💰 Total Value',
          value: `₹${portfolio.total_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          inline: true
        },
        {
          name: '📈 Total P&L',
          value: `₹${portfolio.total_pnl.toFixed(2)} (${portfolio.pnl_percent.toFixed(2)}%)`,
          inline: false
        },
        {
          name: '💹 Realized P&L',
          value: `₹${portfolio.realized_pnl.toFixed(2)}`,
          inline: true
        },
        {
          name: '📊 Unrealized P&L',
          value: `₹${portfolio.unrealized_pnl.toFixed(2)}`,
          inline: true
        },
        {
          name: '🎯 Positions',
          value: `${portfolio.holdings_count}`,
          inline: true
        },
        {
          name: '📅 Today\'s Orders',
          value: `${portfolio.today_orders}`,
          inline: true
        },
        {
          name: '💵 Today\'s P&L',
          value: `₹${portfolio.today_pnl.toFixed(2)}`,
          inline: true
        },
        {
          name: '💼 Initial Capital',
          value: `₹${portfolio.initial_capital.toLocaleString('en-IN')}`,
          inline: true
        }
      );

      const embed = {
        title: `💼 ${config.name} Portfolio`,
        description: `**Config:** Capital: ₹${config.initialCapital.toLocaleString('en-IN')} | Trade: ₹${config.amountPerTrade.toLocaleString('en-IN')} | Grid: ${config.gridPercentage}%`,
        color: portfolio.total_pnl >= 0 ? 0x00ff00 : 0xff0000,
        fields: fields,
        timestamp: new Date()
      };

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Portfolio by number command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async holdingsCommand(message) {
    try {
      const channel = this.getChannelInstance(message);
      const holdings = channel.paperTradingService.getHoldings();

      if (holdings.length === 0) {
        await message.reply('📭 No current holdings');
        return;
      }

      let reply = `📦 **Current Holdings (${holdings.length})**\n\n`;

      holdings.forEach((holding, index) => {
        const pnlEmoji = holding.unrealized_pnl >= 0 ? '🟢' : '🔴';
        reply += `${index + 1}. **${holding.symbol}**\n`;
        reply += `   Qty: ${holding.qty} @ ₹${holding.avg_price.toFixed(2)}\n`;
        reply += `   Current: ₹${holding.current_price?.toFixed(2) || holding.avg_price.toFixed(2)}\n`;
        reply += `   Invested: ₹${holding.invested_value.toFixed(2)}\n`;
        reply += `   ${pnlEmoji} P&L: ₹${(holding.unrealized_pnl || 0).toFixed(2)} (${(holding.unrealized_pnl_percent || 0).toFixed(2)}%)\n\n`;
      });

      reply += `💡 Use \`!sell holding <number>\` to sell a specific holding`;

      await message.reply(reply);
    } catch (error) {
      logger.error('Holdings command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async sellHoldingCommand(args, message) {
    try {
      const channel = this.getChannelInstance(message);

      if (args.length < 2 || args[0].toLowerCase() !== 'holding') {
        await message.reply('Usage: `!sell holding <number>`\nExample: `!sell holding 1` to sell the first holding');
        return;
      }

      const holdingNumber = parseInt(args[1]);
      if (isNaN(holdingNumber) || holdingNumber < 1) {
        await message.reply('❌ Invalid holding number. Use `!holdings` to see the list.');
        return;
      }

      const holdings = channel.paperTradingService.getHoldings();

      if (holdings.length === 0) {
        await message.reply('📭 No holdings to sell');
        return;
      }

      if (holdingNumber > holdings.length) {
        await message.reply(`❌ Invalid holding number. You have ${holdings.length} holdings. Use \`!holdings\` to see the list.`);
        return;
      }

      const holding = holdings[holdingNumber - 1];
      const currentPrice = holding.current_price || holding.avg_price;

      // Execute the manual sell
      const result = await channel.paperTradingService.executeManualSell(
        holding.token,
        holding.symbol,
        currentPrice
      );

      if (result.success) {
        const pnlEmoji = result.pnl >= 0 ? '📈' : '📉';
        let reply = `✅ **Sold ${holding.symbol}**\n\n`;
        reply += `**Qty:** ${result.qty} @ ₹${result.price.toFixed(2)}\n`;
        reply += `**Value:** ₹${result.value.toFixed(2)}\n`;
        reply += `${pnlEmoji} **P&L:** ₹${result.pnl.toFixed(2)} (${result.pnlPercent.toFixed(2)}%)\n`;
        reply += `**Balance:** ₹${result.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

        await message.reply(reply);
      } else {
        await message.reply(`❌ Failed to sell: ${result.message}`);
      }
    } catch (error) {
      logger.error('Sell holding command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async ordersCommand(args, message) {
    try {
      const channel = this.getChannelInstance(message);
      let orders;
      const period = args[0]?.toLowerCase() || 'today';

      switch (period) {
        case 'today':
          orders = db.getTodayOrders(channel.id);
          break;
        case 'week':
          orders = db.getOrders(channel.id, 100, 0);
          break;
        case 'all':
          orders = db.getOrders(channel.id, 200, 0);
          break;
        default:
          await message.reply('Usage: `!orders [today|week|all]`');
          return;
      }

      if (orders.length === 0) {
        await message.reply(`📭 No orders found for ${period}`);
        return;
      }

      let reply = `📋 **Orders (${period}) - ${orders.length} total**\n\n`;

      orders.slice(0, 20).forEach((order, index) => {
        const emoji = order.type === 'BUY' ? '🟢' : '🔴';
        const timestamp = new Date(order.timestamp).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        reply += `${emoji} **${order.type} ${order.symbol}**\n`;
        reply += `   ${timestamp} | Qty: ${order.qty} @ ₹${order.price.toFixed(2)}\n`;

        if (order.type === 'SELL' && order.pnl) {
          const pnlEmoji = order.pnl >= 0 ? '📈' : '📉';
          reply += `   ${pnlEmoji} P&L: ₹${order.pnl.toFixed(2)} (${order.pnl_percent.toFixed(2)}%)\n`;
        }

        reply += `\n`;
      });

      if (orders.length > 20) {
        reply += `\n_Showing latest 20 of ${orders.length} orders_`;
      }

      await message.reply(reply);
    } catch (error) {
      logger.error('Orders command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async pnlCommand(message) {
    try {
      const channel = this.getChannelInstance(message);
      const stats = db.getTotalPnL(channel.id);
      const todayStats = db.getTodayStats(channel.id);
      const portfolio = channel.paperTradingService.getPortfolio();

      const embed = {
        title: '📊 Profit & Loss Summary',
        color: portfolio.total_pnl >= 0 ? 0x00ff00 : 0xff0000,
        fields: [
          {
            name: '💰 Total P&L',
            value: `₹${portfolio.total_pnl.toFixed(2)} (${portfolio.pnl_percent.toFixed(2)}%)`,
            inline: false
          },
          {
            name: '💹 Realized P&L',
            value: `₹${portfolio.realized_pnl.toFixed(2)}`,
            inline: true
          },
          {
            name: '📊 Unrealized P&L',
            value: `₹${portfolio.unrealized_pnl.toFixed(2)}`,
            inline: true
          },
          {
            name: '📅 Today\'s P&L',
            value: `₹${(todayStats.today_pnl || 0).toFixed(2)}`,
            inline: true
          },
          {
            name: '📈 Total Orders',
            value: `${stats.total_orders || 0}`,
            inline: true
          },
          {
            name: '🟢 Buy Orders',
            value: `${stats.buy_orders || 0}`,
            inline: true
          },
          {
            name: '🔴 Sell Orders',
            value: `${stats.sell_orders || 0}`,
            inline: true
          },
          {
            name: '🎯 Stocks Traded',
            value: `${stats.traded_symbols || 0}`,
            inline: true
          },
          {
            name: '💼 Current Holdings',
            value: `${portfolio.holdings_count}`,
            inline: true
          }
        ],
        timestamp: new Date()
      };

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('P&L command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async topStocksCommand(message) {
    try {
      const channel = this.getChannelInstance(message);
      const topPerformers = db.getTopPerformers(10, channel.id);
      const worstPerformers = db.getWorstPerformers(10, channel.id);

      let reply = '🏆 **Top Performing Stocks**\n\n';

      if (topPerformers.length > 0 && topPerformers[0].total_pnl > 0) {
        topPerformers.slice(0, 5).forEach((stock, index) => {
          reply += `${index + 1}. **${stock.symbol}**: ₹${stock.total_pnl.toFixed(2)} (${stock.trade_count} trades)\n`;
        });
      } else {
        reply += '_No profitable trades yet_\n';
      }

      reply += '\n📉 **Worst Performing Stocks**\n\n';

      if (worstPerformers.length > 0 && worstPerformers[0].total_pnl < 0) {
        worstPerformers.slice(0, 5).forEach((stock, index) => {
          reply += `${index + 1}. **${stock.symbol}**: ₹${stock.total_pnl.toFixed(2)} (${stock.trade_count} trades)\n`;
        });
      } else {
        reply += '_No losing trades yet_\n';
      }

      await message.reply(reply);
    } catch (error) {
      logger.error('Top stocks command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async gridCommand(args, message) {
    try {
      const channel = this.getChannelInstance(message);
      if (args.length === 0) {
        await message.reply('Usage: `!grid <SYMBOL>`');
        return;
      }

      const symbol = args[0].toUpperCase();
      const gridInfo = channel.gridStrategyService.getGridInfo(symbol);

      if (!gridInfo) {
        await message.reply(`❌ No grid data found for ${symbol}`);
        return;
      }

      const embed = {
        title: `📊 Grid Levels - ${gridInfo.symbol}`,
        color: gridInfo.total_pnl >= 0 ? 0x00ff00 : 0xff0000,
        fields: [
          {
            name: '📍 Reference Price',
            value: `₹${gridInfo.reference_price.toFixed(2)}`,
            inline: true
          },
          {
            name: '🎯 Buy Threshold',
            value: `₹${gridInfo.buy_threshold.toFixed(2)}`,
            inline: true
          },
          {
            name: '🎯 Sell Threshold',
            value: gridInfo.sell_threshold ? `₹${gridInfo.sell_threshold.toFixed(2)}` : 'N/A',
            inline: true
          },
          {
            name: '💰 Last Buy Price',
            value: gridInfo.last_buy_price ? `₹${gridInfo.last_buy_price.toFixed(2)}` : 'N/A',
            inline: true
          },
          {
            name: '💸 Last Sell Price',
            value: gridInfo.last_sell_price ? `₹${gridInfo.last_sell_price.toFixed(2)}` : 'N/A',
            inline: true
          },
          {
            name: '📈 Total P&L',
            value: `₹${gridInfo.total_pnl.toFixed(2)}`,
            inline: true
          },
          {
            name: '🟢 Buy Count',
            value: `${gridInfo.buy_count}`,
            inline: true
          },
          {
            name: '🔴 Sell Count',
            value: `${gridInfo.sell_count}`,
            inline: true
          },
          {
            name: '⚡ Status',
            value: gridInfo.is_active ? '✅ Active' : '❌ Inactive',
            inline: true
          }
        ],
        timestamp: new Date()
      };

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Grid command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async resetCommand(message) {
    try {
      const channel = this.getChannelInstance(message);
      await message.reply('⚠️ **WARNING**: This will reset your entire portfolio!\n\nType `!confirm-reset` within 30 seconds to proceed.');

      const filter = m => m.author.id === message.author.id && m.content === '!confirm-reset';
      const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

      collector.on('collect', async () => {
        await channel.paperTradingService.resetPortfolio();
        await message.reply('✅ Portfolio reset complete! Starting fresh with initial capital.');
      });

      collector.on('end', collected => {
        if (collected.size === 0) {
          message.reply('❌ Reset cancelled (timeout)');
        }
      });
    } catch (error) {
      logger.error('Reset command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async configCommand(args, message) {
    try {
      const channel = this.getChannelInstance(message);
      if (args.length === 0) {
        // Show current config - use channel.config for accurate values
        const channelConfig = channel.config;
        const tradingConfig = channel.paperTradingService.getConfig();
        const gridStatus = channel.gridStrategyService.getStatus();

        const embed = {
          title: '⚙️ Paper Trading Configuration',
          color: 0x0099ff,
          fields: [
            {
              name: '💰 Initial Capital',
              value: `₹${channelConfig.initialCapital.toLocaleString('en-IN')}`,
              inline: true
            },
            {
              name: '📊 Amount per Trade',
              value: `₹${channelConfig.amountPerTrade.toLocaleString('en-IN')}`,
              inline: true
            },
            {
              name: '📈 Grid Percentage',
              value: `${channelConfig.gridPercentage}%`,
              inline: true
            },
            {
              name: '🎯 Trading Status',
              value: tradingConfig.trading_enabled ? '✅ Enabled' : '❌ Disabled',
              inline: true
            },
            {
              name: '📊 Grid Strategy',
              value: gridStatus.active ? '✅ Active' : '❌ Inactive',
              inline: true
            },
            {
              name: '🎯 Active Grids',
              value: `${gridStatus.active_grids} / ${gridStatus.total_grids}`,
              inline: true
            }
          ],
          footer: {
            text: 'Use !config set <key> <value> to update settings'
          },
          timestamp: new Date()
        };

        await message.reply({ embeds: [embed] });
        return;
      }

      // Update config
      if (args[0] === 'set' && args.length >= 3) {
        const key = args[1];
        const value = args[2];
        const channelNum = this.getChannelNumber(message.channel.id);

        if (key === 'amount_per_trade') {
          channel.paperTradingService.updateConfig('amount_per_trade', value);

          // Update .env file
          if (channelNum) {
            this.updateEnvFile(`CHANNEL_${channelNum}_AMOUNT_PER_TRADE`, value);
          }

          await message.reply(`✅ Amount per trade updated to ₹${parseFloat(value).toLocaleString('en-IN')} (saved to .env)`);
        } else if (key === 'grid_percentage') {
          channel.gridStrategyService.updateGridPercentage(value);

          // Update .env file
          if (channelNum) {
            this.updateEnvFile(`CHANNEL_${channelNum}_GRID_PERCENTAGE`, value);
          }

          await message.reply(`✅ Grid percentage updated to ${value}% (saved to .env)`);
        } else if (key === 'initial_capital') {
          // Update .env file only (requires restart to take effect)
          if (channelNum) {
            this.updateEnvFile(`CHANNEL_${channelNum}_INITIAL_CAPITAL`, value);
          }

          await message.reply(`✅ Initial capital updated to ₹${parseFloat(value).toLocaleString('en-IN')} in .env\n⚠️ Requires restart and !reset-portfolio to take effect`);
        } else {
          await message.reply(`❌ Unknown config key: ${key}\nAvailable keys: amount_per_trade, grid_percentage, initial_capital`);
        }
      } else {
        await message.reply('Usage: `!config` or `!config set <key> <value>`');
      }
    } catch (error) {
      logger.error('Config command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async startTradingCommand(message) {
    try {
      const channel = this.getChannelInstance(message);
      await channel.paperTradingService.enableTrading();
      await channel.gridStrategyService.start();
      await message.reply('✅ **Paper Trading Started**\nGrid strategy is now active and monitoring prices.');
    } catch (error) {
      logger.error('Start trading command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async stopTradingCommand(message) {
    try {
      const channel = this.getChannelInstance(message);
      await channel.paperTradingService.disableTrading();
      await channel.gridStrategyService.stop();
      await message.reply('⏸️ **Paper Trading Stopped**\nNo new orders will be placed.');
    } catch (error) {
      logger.error('Stop trading command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async resetPortfolioCommand(message) {
    try {
      const channel = this.getChannelInstance(message);

      // Check if trading is still active
      if (channel.paperTradingService.isEnabled) {
        await message.reply('⚠️ **Cannot reset while trading is active**\nPlease run `!stop-trading` first.');
        return;
      }

      const config = channel.config;
      await channel.paperTradingService.resetPortfolio();

      // Also reset grids
      await channel.gridStrategyService.stop();
      channel.gridStrategyService.grids.clear();

      await message.reply(`🔄 **Portfolio Reset Complete for ${config.name}**\n\nAll holdings, orders, and grid levels have been cleared.\nStarting fresh with ₹${config.initialCapital.toLocaleString('en-IN')} capital.\n\nUse \`!start-trading\` to begin trading again.`);
    } catch (error) {
      logger.error('Reset portfolio command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async statusCommand(message) {
    try {
      const channel = this.getChannelInstance(message);
      const portfolio = channel.paperTradingService.getPortfolio();
      const gridStatus = channel.gridStrategyService.getStatus();
      const todayStats = db.getTodayStats(channel.id);

      const embed = {
        title: '🤖 Paper Trading Bot Status',
        color: channel.paperTradingService.isEnabled ? 0x00ff00 : 0xff0000,
        fields: [
          {
            name: '⚡ Trading',
            value: channel.paperTradingService.isEnabled ? '✅ Enabled' : '❌ Disabled',
            inline: true
          },
          {
            name: '📊 Grid Strategy',
            value: gridStatus.active ? '✅ Active' : '❌ Inactive',
            inline: true
          },
          {
            name: '💰 Cash Balance',
            value: `₹${portfolio.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
            inline: true
          },
          {
            name: '📦 Holdings',
            value: `${portfolio.holdings_count} stocks`,
            inline: true
          },
          {
            name: '📈 Total P&L',
            value: `₹${portfolio.total_pnl.toFixed(2)} (${portfolio.pnl_percent.toFixed(2)}%)`,
            inline: true
          },
          {
            name: '📅 Today\'s Orders',
            value: `${todayStats.today_orders || 0}`,
            inline: true
          },
          {
            name: '🎯 Active Grids',
            value: `${gridStatus.active_grids}`,
            inline: true
          },
          {
            name: '📊 Grid %',
            value: `${gridStatus.grid_percentage}%`,
            inline: true
          },
          {
            name: '💵 Trade Amount',
            value: `₹${channel.paperTradingService.amountPerTrade.toLocaleString('en-IN')}`,
            inline: true
          }
        ],
        timestamp: new Date()
      };

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Status command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  async gridsCommand(message) {
    try {
      const channel = this.getChannelInstance(message);
      const grids = channel.gridStrategyService.getAllGrids();

      if (grids.length === 0) {
        await message.reply('📭 No active grids');
        return;
      }

      let reply = `📊 **Active Grid Levels (${grids.length})**\n\n`;

      grids.slice(0, 15).forEach((grid, index) => {
        const pnlEmoji = grid.total_pnl >= 0 ? '🟢' : '🔴';
        reply += `${index + 1}. **${grid.symbol}**\n`;
        reply += `   Ref: ₹${grid.reference_price.toFixed(2)} | Buys: ${grid.buy_count} | Sells: ${grid.sell_count}\n`;
        reply += `   ${pnlEmoji} P&L: ₹${grid.total_pnl.toFixed(2)}\n\n`;
      });

      if (grids.length > 15) {
        reply += `\n_Showing top 15 of ${grids.length} grids_`;
      }

      await message.reply(reply);
    } catch (error) {
      logger.error('Grids command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  }
}

module.exports = new PaperTradingCommands();
