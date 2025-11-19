const PaperTradingService = require('./paper-trading.service');
const GridStrategyService = require('./grid-strategy.service');
const logger = require('../utils/logger');

class ChannelManager {
  constructor() {
    this.channels = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('🎛️  Initializing Channel Manager...');

      // Define channel configurations from environment variables
      const channelConfigs = [
        {
          id: process.env.DISCORD_CHANNEL_1_ID,
          name: process.env.CHANNEL_1_NAME || 'Channel-1',
          initialCapital: parseFloat(process.env.CHANNEL_1_INITIAL_CAPITAL || '100000'),
          amountPerTrade: parseFloat(process.env.CHANNEL_1_AMOUNT_PER_TRADE || '5000'),
          gridPercentage: parseFloat(process.env.CHANNEL_1_GRID_PERCENTAGE || '5.0'),
        },
        {
          id: process.env.DISCORD_CHANNEL_2_ID,
          name: process.env.CHANNEL_2_NAME || 'Channel-2',
          initialCapital: parseFloat(process.env.CHANNEL_2_INITIAL_CAPITAL || '50000'),
          amountPerTrade: parseFloat(process.env.CHANNEL_2_AMOUNT_PER_TRADE || '2500'),
          gridPercentage: parseFloat(process.env.CHANNEL_2_GRID_PERCENTAGE || '7.5'),
        },
        {
          id: process.env.DISCORD_CHANNEL_3_ID,
          name: process.env.CHANNEL_3_NAME || 'Channel-3',
          initialCapital: parseFloat(process.env.CHANNEL_3_INITIAL_CAPITAL || '25000'),
          amountPerTrade: parseFloat(process.env.CHANNEL_3_AMOUNT_PER_TRADE || '2000'),
          gridPercentage: parseFloat(process.env.CHANNEL_3_GRID_PERCENTAGE || '10.0'),
        },
      ];

      // Initialize each channel
      for (const config of channelConfigs) {
        if (!config.id) {
          logger.warn(`⚠️ Skipping ${config.name} - no channel ID configured`);
          continue;
        }

        logger.info(`📡 Initializing ${config.name} (${config.id})...`);

        // Create paper trading service instance for this channel
        const paperTradingService = new PaperTradingService(config.id);
        await paperTradingService.initialize(
          config.initialCapital,
          config.amountPerTrade
        );

        // Create grid strategy service instance for this channel
        const gridStrategyService = new GridStrategyService(config.id);
        await gridStrategyService.initialize(config.gridPercentage);

        // Link paper trading service to grid strategy
        gridStrategyService.setPaperTradingService(paperTradingService);

        // Store channel instance
        this.channels.set(config.id, {
          id: config.id,
          name: config.name,
          config: config,
          paperTradingService,
          gridStrategyService,
        });

        logger.info(`✅ ${config.name} initialized`);
      }

      this.isInitialized = true;
      logger.info(`✅ Channel Manager initialized with ${this.channels.size} channels`);

      return true;
    } catch (error) {
      logger.error('❌ Failed to initialize channel manager:', error);
      throw error;
    }
  }

  getChannel(channelId) {
    return this.channels.get(channelId);
  }

  getAllChannels() {
    return Array.from(this.channels.values());
  }

  getChannelIds() {
    return Array.from(this.channels.keys());
  }

  processTicks(ticks) {
    // Distribute ticks to all channel grid strategies
    for (const channel of this.channels.values()) {
      if (channel.gridStrategyService.isActive) {
        channel.gridStrategyService.processTicks(ticks);
      }
    }
  }

  async startTrading(channelId) {
    const channel = this.getChannel(channelId);
    if (!channel) {
      return { success: false, message: 'Channel not found' };
    }

    await channel.paperTradingService.enableTrading();
    await channel.gridStrategyService.start();

    logger.info(`🚀 Trading started for ${channel.name}`);
    return { success: true, message: `Trading started for ${channel.name}` };
  }

  async stopTrading(channelId) {
    const channel = this.getChannel(channelId);
    if (!channel) {
      return { success: false, message: 'Channel not found' };
    }

    await channel.paperTradingService.disableTrading();
    await channel.gridStrategyService.stop();

    logger.info(`⏸️ Trading stopped for ${channel.name}`);
    return { success: true, message: `Trading stopped for ${channel.name}` };
  }

  getChannelStatus(channelId) {
    const channel = this.getChannel(channelId);
    if (!channel) {
      return null;
    }

    return {
      id: channel.id,
      name: channel.name,
      config: channel.config,
      tradingEnabled: channel.paperTradingService.isEnabled,
      gridActive: channel.gridStrategyService.isActive,
      paperTradingStatus: channel.paperTradingService.getStatus(),
      gridStatus: channel.gridStrategyService.getStatus(),
    };
  }

  getAllChannelStatuses() {
    const statuses = [];
    for (const channelId of this.channels.keys()) {
      statuses.push(this.getChannelStatus(channelId));
    }
    return statuses;
  }

  async autoStartTrading() {
    const autoStart = process.env.AUTO_START_TRADING === 'true';
    if (!autoStart) {
      return;
    }

    logger.info('🚀 Auto-starting trading for all channels...');

    for (const channel of this.channels.values()) {
      if (channel.paperTradingService.isInitialized && channel.gridStrategyService.isInitialized) {
        await this.startTrading(channel.id);
      }
    }

    logger.info('✅ Auto-start complete');
  }
}

module.exports = new ChannelManager();
