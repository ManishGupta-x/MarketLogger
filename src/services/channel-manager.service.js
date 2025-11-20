const PaperTradingService = require('./paper-trading.service');
const GridStrategyService = require('./grid-strategy.service');
const logger = require('../utils/logger');

class ChannelManager {
  constructor() {
    this.channels = new Map();
    this.isInitialized = false;
  }

  // Parse combined config format: CHANNEL_ID-NAME-INITIAL_CAPITAL-AMOUNT_PER_TRADE-GRID_PERCENTAGE
  parseChannelConfig(configString, channelNum) {
    if (!configString) return null;

    const parts = configString.split('-');
    if (parts.length < 5) {
      logger.warn(`⚠️ Invalid config format for channel ${channelNum}: ${configString}`);
      logger.warn(`Expected format: CHANNEL_ID-NAME-INITIAL_CAPITAL-AMOUNT_PER_TRADE-GRID_PERCENTAGE`);
      return null;
    }

    // Handle names with dashes by joining middle parts
    const id = parts[0];
    const gridPercentage = parseFloat(parts[parts.length - 1]);
    const amountPerTrade = parseFloat(parts[parts.length - 2]);
    const initialCapital = parseFloat(parts[parts.length - 3]);
    const name = parts.slice(1, parts.length - 3).join('-') || `Channel-${channelNum}`;

    return {
      id,
      name,
      initialCapital: isNaN(initialCapital) ? 100000 : initialCapital,
      amountPerTrade: isNaN(amountPerTrade) ? 5000 : amountPerTrade,
      gridPercentage: isNaN(gridPercentage) ? 5.0 : gridPercentage,
    };
  }

  async initialize() {
    try {
      logger.info('🎛️  Initializing Channel Manager...');

      // Define channel configurations from environment variables
      // Support both new combined format and legacy separate variables
      const channelConfigs = [];

      // Try to load up to 10 channels
      for (let i = 1; i <= 10; i++) {
        let config = null;

        // First try new combined format: CHANNEL_X_CONFIG
        const combinedConfig = process.env[`CHANNEL_${i}_CONFIG`];
        if (combinedConfig) {
          config = this.parseChannelConfig(combinedConfig, i);
          if (config) {
            logger.info(`📡 Loaded channel ${i} from combined config`);
          }
        }

        // Fall back to legacy separate variables
        if (!config) {
          const legacyId = process.env[`DISCORD_CHANNEL_${i}_ID`];
          if (legacyId) {
            config = {
              id: legacyId,
              name: process.env[`CHANNEL_${i}_NAME`] || `Channel-${i}`,
              initialCapital: parseFloat(process.env[`CHANNEL_${i}_INITIAL_CAPITAL`] || '100000'),
              amountPerTrade: parseFloat(process.env[`CHANNEL_${i}_AMOUNT_PER_TRADE`] || '5000'),
              gridPercentage: parseFloat(process.env[`CHANNEL_${i}_GRID_PERCENTAGE`] || '5.0'),
            };
            logger.info(`📡 Loaded channel ${i} from legacy config`);
          }
        }

        if (config) {
          channelConfigs.push(config);
        }
      }

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
