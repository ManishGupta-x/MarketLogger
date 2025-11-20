const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');

class ControlPanelCommands {
  constructor() {
    this.panelMessageId = null;
    this.channelManager = null;
  }

  setChannelManager(channelManager) {
    this.channelManager = channelManager;
  }

  // Main panel command - creates or updates the control panel
  async panelCommand(message) {
    if (!this.channelManager) {
      await message.reply('Control panel not initialized.');
      return;
    }

    const controlPanelChannelId = process.env.CONTROL_PANEL_CHANNEL_ID;

    // Check if command is in control panel channel
    if (controlPanelChannelId && message.channel.id !== controlPanelChannelId) {
      await message.reply(`Please use this command in the control panel channel.`);
      return;
    }

    // Delete the command message to keep channel clean
    try {
      await message.delete();
    } catch (e) {
      // Ignore if can't delete
    }

    // Send the panel
    await this.sendControlPanel(message.channel);
  }

  // Send or update the control panel embed with buttons
  async sendControlPanel(channel, interaction = null) {
    const embed = this.buildMainPanelEmbed();
    const components = this.buildMainPanelComponents();

    if (interaction) {
      // Update existing message (keeps embed in place)
      await interaction.update({ embeds: [embed], components });
    } else {
      // Send new message
      const sentMessage = await channel.send({ embeds: [embed], components });
      this.panelMessageId = sentMessage.id;
    }
  }

  // Build the main panel embed
  buildMainPanelEmbed() {
    const channels = this.channelManager.getAllChannels();

    const fields = channels.map(ch => {
      const portfolio = ch.paperTradingService.getPortfolio();
      const status = ch.gridStrategyService.isActive ? '🟢 Active' : '🔴 Stopped';
      const pnl = portfolio.total_pnl >= 0
        ? `+${portfolio.total_pnl.toFixed(2)}`
        : portfolio.total_pnl.toFixed(2);
      const pnlColor = portfolio.total_pnl >= 0 ? '' : '';

      return {
        name: `${ch.config.name} ${status}`,
        value: [
          `**Capital:** ₹${ch.config.initialCapital.toLocaleString('en-IN')}`,
          `**Trade Size:** ₹${ch.config.amountPerTrade.toLocaleString('en-IN')}`,
          `**Grid:** ${ch.config.gridPercentage}%`,
          `**P&L:** ₹${pnl} (${portfolio.pnl_percent.toFixed(2)}%)`,
          `**Holdings:** ${portfolio.holdings_count}`
        ].join('\n'),
        inline: true
      };
    });

    // Add summary field
    const totalPnl = channels.reduce((sum, ch) => {
      return sum + ch.paperTradingService.getPortfolio().total_pnl;
    }, 0);

    const activeCount = channels.filter(ch => ch.gridStrategyService.isActive).length;

    return new EmbedBuilder()
      .setTitle('Trading Control Panel')
      .setDescription(`**Total P&L:** ₹${totalPnl.toFixed(2)} | **Active:** ${activeCount}/${channels.length} channels`)
      .setColor(totalPnl >= 0 ? 0x00ff00 : 0xff0000)
      .addFields(fields)
      .setFooter({ text: 'Use buttons below to manage trading' })
      .setTimestamp();
  }

  // Build main panel buttons
  buildMainPanelComponents() {
    const channels = this.channelManager.getAllChannels();

    // Row 1: Global controls
    const globalRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_start_all')
        .setLabel('Start All')
        .setStyle(ButtonStyle.Success)
        .setEmoji('▶️'),
      new ButtonBuilder()
        .setCustomId('panel_stop_all')
        .setLabel('Stop All')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⏹️'),
      new ButtonBuilder()
        .setCustomId('panel_refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
    );

    // Row 2: Channel selector for detailed view
    const channelOptions = channels.map(ch => ({
      label: ch.config.name,
      description: `View portfolio and controls`,
      value: `channel_${ch.id}`
    }));

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('panel_select_channel')
        .setPlaceholder('Select channel for details...')
        .addOptions(channelOptions)
    );

    return [globalRow, selectRow];
  }

  // Handle button interactions
  async handleInteraction(interaction) {
    const customId = interaction.customId;

    try {
      if (customId === 'panel_start_all') {
        await this.handleStartAll(interaction);
      } else if (customId === 'panel_stop_all') {
        await this.handleStopAll(interaction);
      } else if (customId === 'panel_refresh') {
        await this.sendControlPanel(interaction.channel, interaction);
      } else if (customId === 'panel_select_channel') {
        await this.handleChannelSelect(interaction);
      } else if (customId.startsWith('channel_start_')) {
        await this.handleChannelStart(interaction);
      } else if (customId.startsWith('channel_stop_')) {
        await this.handleChannelStop(interaction);
      } else if (customId.startsWith('channel_portfolio_')) {
        await this.handleChannelPortfolio(interaction);
      } else if (customId.startsWith('channel_holdings_')) {
        await this.handleChannelHoldings(interaction);
      } else if (customId.startsWith('channel_orders_')) {
        await this.handleChannelOrders(interaction);
      } else if (customId.startsWith('channel_grids_')) {
        await this.handleChannelGrids(interaction);
      } else if (customId.startsWith('channel_config_')) {
        await this.handleChannelConfig(interaction);
      } else if (customId === 'panel_back') {
        await this.sendControlPanel(interaction.channel, interaction);
      }
    } catch (error) {
      logger.error('Panel interaction error:', error);
      await interaction.reply({
        content: `Error: ${error.message}`,
        ephemeral: true
      });
    }
  }

  // Start trading on all channels
  async handleStartAll(interaction) {
    const channels = this.channelManager.getAllChannels();

    for (const channel of channels) {
      await this.channelManager.startTrading(channel.id);
    }

    // Update panel to show new status
    await this.sendControlPanel(interaction.channel, interaction);
  }

  // Stop trading on all channels
  async handleStopAll(interaction) {
    const channels = this.channelManager.getAllChannels();

    for (const channel of channels) {
      await this.channelManager.stopTrading(channel.id);
    }

    // Update panel to show new status
    await this.sendControlPanel(interaction.channel, interaction);
  }

  // Handle channel selection from dropdown
  async handleChannelSelect(interaction) {
    const channelId = interaction.values[0].replace('channel_', '');
    await this.showChannelDetails(interaction, channelId);
  }

  // Show detailed view for a specific channel
  async showChannelDetails(interaction, channelId) {
    const channel = this.channelManager.getChannel(channelId);
    if (!channel) {
      await interaction.reply({ content: 'Channel not found', ephemeral: true });
      return;
    }

    const portfolio = channel.paperTradingService.getPortfolio();
    const gridStatus = channel.gridStrategyService.getStatus();
    const status = channel.gridStrategyService.isActive ? '🟢 Active' : '🔴 Stopped';

    const embed = new EmbedBuilder()
      .setTitle(`${channel.config.name} - Detailed View`)
      .setColor(portfolio.total_pnl >= 0 ? 0x00ff00 : 0xff0000)
      .addFields([
        {
          name: 'Trading Status',
          value: status,
          inline: true
        },
        {
          name: 'Grid Percentage',
          value: `${channel.config.gridPercentage}%`,
          inline: true
        },
        {
          name: 'Active Grids',
          value: gridStatus.active_grids.toString(),
          inline: true
        },
        {
          name: 'Cash Balance',
          value: `₹${portfolio.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          inline: true
        },
        {
          name: 'Holdings Value',
          value: `₹${portfolio.holdings_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          inline: true
        },
        {
          name: 'Total Value',
          value: `₹${portfolio.total_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          inline: true
        },
        {
          name: 'Total P&L',
          value: `₹${portfolio.total_pnl.toFixed(2)} (${portfolio.pnl_percent.toFixed(2)}%)`,
          inline: true
        },
        {
          name: 'Realized P&L',
          value: `₹${portfolio.realized_pnl.toFixed(2)}`,
          inline: true
        },
        {
          name: 'Unrealized P&L',
          value: `₹${portfolio.unrealized_pnl.toFixed(2)}`,
          inline: true
        },
        {
          name: 'Holdings Count',
          value: portfolio.holdings_count.toString(),
          inline: true
        },
        {
          name: 'Today Orders',
          value: portfolio.today_orders.toString(),
          inline: true
        },
        {
          name: 'Today P&L',
          value: `₹${portfolio.today_pnl.toFixed(2)}`,
          inline: true
        }
      ])
      .setFooter({ text: `Initial Capital: ₹${channel.config.initialCapital.toLocaleString('en-IN')} | Trade Size: ₹${channel.config.amountPerTrade.toLocaleString('en-IN')}` })
      .setTimestamp();

    // Build action buttons for this channel
    const isActive = channel.gridStrategyService.isActive;

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`channel_start_${channelId}`)
        .setLabel('Start')
        .setStyle(ButtonStyle.Success)
        .setDisabled(isActive),
      new ButtonBuilder()
        .setCustomId(`channel_stop_${channelId}`)
        .setLabel('Stop')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!isActive),
      new ButtonBuilder()
        .setCustomId('panel_back')
        .setLabel('Back to Panel')
        .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`channel_portfolio_${channelId}`)
        .setLabel('Portfolio')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`channel_holdings_${channelId}`)
        .setLabel('Holdings')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`channel_orders_${channelId}`)
        .setLabel('Orders')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`channel_grids_${channelId}`)
        .setLabel('Grids')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`channel_config_${channelId}`)
        .setLabel('Config')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.update({ embeds: [embed], components: [row1, row2] });
  }

  // Handle start button for specific channel
  async handleChannelStart(interaction) {
    const channelId = interaction.customId.replace('channel_start_', '');
    await this.channelManager.startTrading(channelId);
    await this.showChannelDetails(interaction, channelId);
  }

  // Handle stop button for specific channel
  async handleChannelStop(interaction) {
    const channelId = interaction.customId.replace('channel_stop_', '');
    await this.channelManager.stopTrading(channelId);
    await this.showChannelDetails(interaction, channelId);
  }

  // Show portfolio details (ephemeral)
  async handleChannelPortfolio(interaction) {
    const channelId = interaction.customId.replace('channel_portfolio_', '');
    const channel = this.channelManager.getChannel(channelId);

    if (!channel) {
      await interaction.reply({ content: 'Channel not found', ephemeral: true });
      return;
    }

    const portfolio = channel.paperTradingService.getPortfolio();

    const embed = new EmbedBuilder()
      .setTitle(`${channel.config.name} - Full Portfolio`)
      .setColor(portfolio.total_pnl >= 0 ? 0x00ff00 : 0xff0000)
      .addFields([
        { name: 'Initial Capital', value: `₹${portfolio.initial_capital.toLocaleString('en-IN')}`, inline: true },
        { name: 'Cash Balance', value: `₹${portfolio.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, inline: true },
        { name: 'Holdings Value', value: `₹${portfolio.holdings_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, inline: true },
        { name: 'Total Value', value: `₹${portfolio.total_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, inline: true },
        { name: 'Total P&L', value: `₹${portfolio.total_pnl.toFixed(2)} (${portfolio.pnl_percent.toFixed(2)}%)`, inline: true },
        { name: 'Realized P&L', value: `₹${portfolio.realized_pnl.toFixed(2)}`, inline: true },
        { name: 'Unrealized P&L', value: `₹${portfolio.unrealized_pnl.toFixed(2)}`, inline: true },
        { name: 'Holdings Count', value: portfolio.holdings_count.toString(), inline: true },
        { name: 'Today Orders', value: portfolio.today_orders.toString(), inline: true }
      ])
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Show holdings details (ephemeral)
  async handleChannelHoldings(interaction) {
    const channelId = interaction.customId.replace('channel_holdings_', '');
    const channel = this.channelManager.getChannel(channelId);

    if (!channel) {
      await interaction.reply({ content: 'Channel not found', ephemeral: true });
      return;
    }

    const holdings = channel.paperTradingService.getHoldings();

    if (holdings.length === 0) {
      await interaction.reply({
        content: `**${channel.config.name}** - No holdings`,
        ephemeral: true
      });
      return;
    }

    let holdingsText = holdings.map((h, i) => {
      const pnlSign = h.unrealized_pnl >= 0 ? '+' : '';
      return `**${i + 1}. ${h.symbol}**\n` +
        `   Qty: ${h.qty} | Avg: ₹${h.avg_price.toFixed(2)} | LTP: ₹${h.current_price.toFixed(2)}\n` +
        `   P&L: ${pnlSign}₹${h.unrealized_pnl.toFixed(2)} (${pnlSign}${h.unrealized_pnl_percent.toFixed(2)}%)`;
    }).join('\n\n');

    if (holdingsText.length > 4000) {
      holdingsText = holdingsText.substring(0, 3997) + '...';
    }

    const embed = new EmbedBuilder()
      .setTitle(`${channel.config.name} - Holdings (${holdings.length})`)
      .setDescription(holdingsText)
      .setColor(0x0099ff)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Show recent orders (ephemeral)
  async handleChannelOrders(interaction) {
    const channelId = interaction.customId.replace('channel_orders_', '');
    const channel = this.channelManager.getChannel(channelId);

    if (!channel) {
      await interaction.reply({ content: 'Channel not found', ephemeral: true });
      return;
    }

    const orders = channel.paperTradingService.getOrders('today');

    if (orders.length === 0) {
      await interaction.reply({
        content: `**${channel.config.name}** - No orders today`,
        ephemeral: true
      });
      return;
    }

    const recentOrders = orders.slice(0, 15);
    let ordersText = recentOrders.map(o => {
      const emoji = o.type === 'BUY' ? '🟢' : '🔴';
      const time = new Date(o.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
      return `${emoji} **${o.symbol}** ${o.type} ${o.qty} @ ₹${o.price.toFixed(2)} (${time})`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`${channel.config.name} - Today's Orders (${orders.length})`)
      .setDescription(ordersText)
      .setColor(0x0099ff)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Show grid info (ephemeral)
  async handleChannelGrids(interaction) {
    const channelId = interaction.customId.replace('channel_grids_', '');
    const channel = this.channelManager.getChannel(channelId);

    if (!channel) {
      await interaction.reply({ content: 'Channel not found', ephemeral: true });
      return;
    }

    const grids = channel.gridStrategyService.getAllGrids();

    if (grids.length === 0) {
      await interaction.reply({
        content: `**${channel.config.name}** - No active grids`,
        ephemeral: true
      });
      return;
    }

    const topGrids = grids.slice(0, 15);
    let gridsText = topGrids.map(g => {
      const pnlSign = g.total_pnl >= 0 ? '+' : '';
      return `**${g.symbol}**\n` +
        `   Ref: ₹${g.reference_price.toFixed(2)} | Buys: ${g.buy_count} | Sells: ${g.sell_count}\n` +
        `   P&L: ${pnlSign}₹${g.total_pnl.toFixed(2)}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle(`${channel.config.name} - Active Grids (${grids.length})`)
      .setDescription(gridsText)
      .setColor(0x0099ff)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Show config (ephemeral)
  async handleChannelConfig(interaction) {
    const channelId = interaction.customId.replace('channel_config_', '');
    const channel = this.channelManager.getChannel(channelId);

    if (!channel) {
      await interaction.reply({ content: 'Channel not found', ephemeral: true });
      return;
    }

    const config = channel.config;
    const gridStatus = channel.gridStrategyService.getStatus();

    const embed = new EmbedBuilder()
      .setTitle(`${channel.config.name} - Configuration`)
      .setColor(0x0099ff)
      .addFields([
        { name: 'Channel ID', value: config.id, inline: false },
        { name: 'Initial Capital', value: `₹${config.initialCapital.toLocaleString('en-IN')}`, inline: true },
        { name: 'Amount Per Trade', value: `₹${config.amountPerTrade.toLocaleString('en-IN')}`, inline: true },
        { name: 'Grid Percentage', value: `${config.gridPercentage}%`, inline: true },
        { name: 'Trading Enabled', value: channel.paperTradingService.isEnabled ? 'Yes' : 'No', inline: true },
        { name: 'Grid Active', value: gridStatus.active ? 'Yes' : 'No', inline: true },
        { name: 'Active Grids', value: gridStatus.active_grids.toString(), inline: true }
      ])
      .setFooter({ text: 'Use !config set in the channel to modify settings' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = new ControlPanelCommands();
