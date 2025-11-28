const PaperTradingService = require('./paper-trading.service');
const GridStrategyService = require('./grid-strategy.service');
const db = require('./database.service');
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

      // Hardcoded channel configurations - no environment variables needed
      const channelConfigs = [
        {
          id: '1443823756823891979',
          name: 'smallamount',
          initialCapital: 100000,
          amountPerTrade: 3000,
          gridPercentage: 0.25,
        },
        {
          id: '1443823807155409009',
          name: 'largeamount',
          initialCapital: 100000,
          amountPerTrade: 10000,
          gridPercentage: 0.25,
        }
      ];

      logger.info(`📡 Using 2 hardcoded channel configurations`);

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

        // Save channel config to database for Supabase sync
        db.upsertChannel({
          channel_id: config.id,
          name: config.name,
          initial_capital: config.initialCapital,
          amount_per_trade: config.amountPerTrade,
          grid_percentage: config.gridPercentage
        });

        // Store channel instance (only name from config, other params can change)
        this.channels.set(config.id, {
          id: config.id,
          name: config.name,
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
