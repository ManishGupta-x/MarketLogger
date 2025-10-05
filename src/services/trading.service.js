const logger = require('../utils/logger');
const discordService = require('./discord.service');
const zerodhaService = require('./zerodha.service');

class TradingService {
  constructor() {
    this.isRunning = false;
  }

  async start() {
    this.isRunning = true;
    logger.info('🤖 Trading service started');
    
    await discordService.log(
      '🤖 **Trading Service Active**\nReady to execute strategies',
      'success'
    );

    // Example: Check positions every 5 minutes
    setInterval(async () => {
      if (this.isRunning && zerodhaService.isConnected) {
        await this.monitorPositions();
      }
    }, 300000); // 5 minutes
  }

  async monitorPositions() {
    try {
      const positions = await zerodhaService.getPositions();
      
      if (positions && positions.net.length > 0) {
        logger.info(`📊 Active positions: ${positions.net.length}`);
      }
    } catch (error) {
      logger.error('Error monitoring positions:', error.message);
    }
  }

  async stop() {
    this.isRunning = false;
    logger.info('🛑 Trading service stopped');
    await discordService.log('🛑 Trading service stopped', 'warning');
  }
}

module.exports = new TradingService();