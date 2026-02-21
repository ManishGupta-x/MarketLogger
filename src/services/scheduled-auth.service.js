const cron = require('node-cron');
const axios = require('axios');
const AutoLogin = require('../auth/auto-login');
const zerodhaService = require('./zerodha.service');
const database = require('./database.service');
const logger = require('../utils/logger');

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1474700813363449858/yObNT6jgu8TeWSiH26TOWx895VnVMLF63yTwtmzqpcQwNRlfAq3RKVhS94s3cKZtZ3sO';

class ScheduledAuth {
  constructor() {
    this.autoLogin = new AutoLogin();
    this.isStrategyActive = false;
    this.todayStrategy = null;
    this.gridStrategy = null;
    this.paperTrading = null;
  }

  async start() {
    // Schedule daily login + strategy load at 8:00 AM IST (Mon-Fri)
    cron.schedule('0 8 * * 1-5', async () => {
      logger.info('=== 8:00 AM Daily Automation Started ===');
      await this.performMorningRoutine();
    }, {
      timezone: 'Asia/Kolkata'
    });

    // Schedule strategy close at 3:40 PM IST (Mon-Fri)
    cron.schedule('40 15 * * 1-5', async () => {
      logger.info('=== 3:40 PM Strategy Close Triggered ===');
      await this.performEveningRoutine();
    }, {
      timezone: 'Asia/Kolkata'
    });

    logger.info('Scheduled automation enabled:');
    logger.info('  - Morning routine: 8:00 AM IST (Mon-Fri)');
    logger.info('  - Evening routine: 3:40 PM IST (Mon-Fri)');

    // Check on startup and refresh if needed
    await this.checkAndRefreshOnStartup();
  }

  /**
   * Set references to grid strategy and paper trading services
   * Called from app.js after services are initialized
   */
  setServices(gridStrategy, paperTrading) {
    this.gridStrategy = gridStrategy;
    this.paperTrading = paperTrading;
  }

  async checkAndRefreshOnStartup() {
    try {
      logger.info('Checking token validity on startup...');
      const isValid = await zerodhaService.initialize();

      if (!isValid) {
        logger.info('Token invalid on startup, performing auto-login...');
        await this.performAutoLogin();
      } else {
        logger.info('Token is valid, no refresh needed');
      }

      // Check if we should load today's strategy (if app starts after 8 AM but before 3:40 PM)
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const hour = now.getHours();
      const minute = now.getMinutes();
      const day = now.getDay();

      // Weekday check (Mon=1 to Fri=5)
      if (day >= 1 && day <= 5) {
        // If between 8:00 AM and 3:40 PM, load strategy
        if ((hour > 8 || (hour === 8 && minute >= 0)) && (hour < 15 || (hour === 15 && minute < 40))) {
          logger.info('App started during trading hours, loading today\'s strategy...');
          await this.loadTodayStrategy();
        }
      }
    } catch (error) {
      logger.error('Startup check failed:', error);
    }
  }

  async performMorningRoutine() {
    try {
      const today = this.getTodayDate();

      // Step 1: Always perform auto-login and token refresh (even on holidays)
      logger.info('Step 1: Refreshing authentication token...');
      const loginResult = await this.performAutoLogin();

      if (!loginResult) {
        logger.error('Morning routine aborted: Auto-login failed');
        return;
      }

      // Step 2: Check if today is a holiday
      const calendarResult = database.getCalendarStrategyWithFallback(today);

      if (calendarResult.source === 'holiday') {
        logger.info(`${today} is marked as a market holiday. Token refreshed but skipping strategy.`);
        return;
      }

      // Step 3: Load and apply today's strategy
      logger.info('Step 2: Loading today\'s strategy from calendar...');
      await this.loadTodayStrategy();

      logger.info('=== Morning Routine Completed ===');
    } catch (error) {
      logger.error('Morning routine failed:', error);
    }
  }

  async loadTodayStrategy() {
    const today = this.getTodayDate();
    const calendarResult = database.getCalendarStrategyWithFallback(today);

    if (calendarResult.source === 'holiday') {
      logger.info(`Skipping strategy load: ${today} is a holiday`);
      this.isStrategyActive = false;
      return;
    }

    if (!calendarResult.strategy) {
      logger.warn('No strategy found in calendar and no fallback available!');
      logger.warn('Using environment variable defaults...');

      // Fallback to env vars
      this.todayStrategy = {
        gridPercentage: parseFloat(process.env.GRID_PERCENTAGE) || 0.25,
        targetPercentage: parseFloat(process.env.TARGET_PERCENTAGE) || 0.25,
        stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE) || 1,
        perTradeAmount: parseFloat(process.env.AMOUNT_PER_TRADE) || 5000,
        capital: parseFloat(process.env.INITIAL_CAPITAL) || 100000
      };
    } else {
      const strategy = calendarResult.strategy;
      logger.info(`Strategy loaded from ${calendarResult.source}: ${calendarResult.date}`);

      this.todayStrategy = {
        gridPercentage: strategy.grid_percentage,
        targetPercentage: strategy.target_percentage,
        stopLossPercentage: strategy.stop_loss_percentage,
        perTradeAmount: strategy.per_trade_amount,
        capital: strategy.capital
      };
    }

    // Apply strategy to services
    await this.applyStrategy(this.todayStrategy);

    // Create daily_strategies entry for today
    const existingDailyStrategy = database.getDailyStrategy(today);
    if (!existingDailyStrategy) {
      database.createDailyStrategy(this.todayStrategy);
      logger.info('Created daily_strategies entry for today');
    } else {
      logger.info('Daily strategy entry already exists');
    }

    this.isStrategyActive = true;
    logger.info('Strategy successfully applied:');
    logger.info(`  Grid: ${this.todayStrategy.gridPercentage}%`);
    logger.info(`  Target: ${this.todayStrategy.targetPercentage}%`);
    logger.info(`  Stop Loss: ${this.todayStrategy.stopLossPercentage}%`);
    logger.info(`  Per Trade: Rs.${this.todayStrategy.perTradeAmount}`);
    logger.info(`  Capital: Rs.${this.todayStrategy.capital}`);
  }

  async applyStrategy(strategy) {
    // Update environment variables for compatibility with existing services
    process.env.GRID_PERCENTAGE = strategy.gridPercentage.toString();
    process.env.TARGET_PERCENTAGE = strategy.targetPercentage.toString();
    process.env.STOP_LOSS_PERCENTAGE = strategy.stopLossPercentage.toString();
    process.env.AMOUNT_PER_TRADE = strategy.perTradeAmount.toString();
    process.env.INITIAL_CAPITAL = strategy.capital.toString();

    // Update grid strategy service directly if available
    if (this.gridStrategy) {
      this.gridStrategy.gridPercentage = strategy.gridPercentage;
      this.gridStrategy.targetPercentage = strategy.targetPercentage;
      this.gridStrategy.stopLossPercentage = strategy.stopLossPercentage;
      logger.info('Updated grid strategy service with new parameters');
    }

    // Update paper trading service directly if available
    if (this.paperTrading) {
      this.paperTrading.amountPerTrade = strategy.perTradeAmount;
      logger.info('Updated paper trading service with new parameters');
    }
  }

  async performEveningRoutine() {
    try {
      const today = this.getTodayDate();

      // Check if strategy exists
      const dailyStrategy = database.getDailyStrategy(today);
      if (!dailyStrategy) {
        logger.info('No active strategy for today, skipping close routine');
        return;
      }

      if (dailyStrategy.status === 'completed') {
        logger.info('Strategy already completed for today');
        return;
      }

      logger.info('Closing today\'s strategy...');
      await this.closeStrategy(today);

      this.isStrategyActive = false;
      logger.info('=== Evening Routine Completed ===');
    } catch (error) {
      logger.error('Evening routine failed:', error);
    }
  }

  async closeStrategy(date) {
    // Get today's data
    const transactions = database.getTodayTransactions();
    const dailyPnl = database.getTodayPnl();
    const holdings = database.getAllHoldings();
    const portfolioState = database.getPortfolioState();
    const existingStrategy = database.getDailyStrategy(date);

    logger.info(`Closing strategy: Found ${transactions.length} transactions`);

    const sellTrades = transactions.filter(t => t.type === 'SELL');
    const buyTrades = transactions.filter(t => t.type === 'BUY');

    // Calculate metrics
    const metrics = {
      total_trades: transactions.length,
      buy_count: buyTrades.length,
      sell_count: sellTrades.length,
      winning_trades: sellTrades.filter(t => t.pnl > 0).length,
      losing_trades: sellTrades.filter(t => t.pnl < 0).length,
      realized_pnl: dailyPnl.realized_pnl || 0,
      buy_value: dailyPnl.buy_value || 0,
      sell_value: dailyPnl.sell_value || 0,
      total_brokerage: sellTrades.reduce((sum, t) => sum + (t.brokerage || 0), 0),
      max_single_win: sellTrades.length > 0 ? Math.max(0, ...sellTrades.map(t => t.pnl || 0)) : 0,
      max_single_loss: sellTrades.length > 0 ? Math.min(0, ...sellTrades.map(t => t.pnl || 0)) : 0,
      ending_cash_balance: portfolioState?.cash_balance || 0,
      ending_holdings_count: holdings.length,
      ending_holdings_value: holdings.reduce((sum, h) => sum + h.invested_value, 0),
      status: 'completed',
      completed_at: new Date().toISOString()
    };

    // Calculate derived metrics
    metrics.win_rate = metrics.sell_count > 0
      ? parseFloat((metrics.winning_trades / metrics.sell_count * 100).toFixed(2))
      : 0;
    metrics.pnl_percent = existingStrategy?.capital > 0
      ? parseFloat((metrics.realized_pnl / existingStrategy.capital * 100).toFixed(4))
      : 0;

    // Update strategy record
    database.updateDailyStrategy(date, metrics);

    logger.info('Strategy closed successfully:');
    logger.info(`  Total Trades: ${metrics.total_trades}`);
    logger.info(`  Realized P&L: Rs.${metrics.realized_pnl.toFixed(2)} (${metrics.pnl_percent}%)`);
    logger.info(`  Win Rate: ${metrics.win_rate}%`);
  }

  async sendDiscordNotification(message, isSuccess = true) {
    try {
      const embed = {
        title: isSuccess ? '✅ MarketLogger Auto-Login' : '❌ MarketLogger Auto-Login Failed',
        description: message,
        color: isSuccess ? 0x00ff00 : 0xff0000,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'MarketLogger Bot'
        }
      };

      await axios.post(DISCORD_WEBHOOK_URL, {
        embeds: [embed]
      });

      logger.info('Discord notification sent successfully');
    } catch (error) {
      logger.error('Failed to send Discord notification:', error.message);
    }
  }

  async performAutoLogin() {
    logger.info('Auto-login triggered');

    try {
      const result = await this.autoLogin.login();

      if (result.success) {
        logger.info(`Auto-login successful (${result.duration}s)`);

        // Reinitialize Zerodha service
        await zerodhaService.initialize();
        logger.info('Zerodha service reconnected');

        // Send Discord notification
        await this.sendDiscordNotification(
          `🕗 **8 AM Scheduled Login Completed**\n\n` +
          `⏱️ Duration: ${result.duration}s\n` +
          `📅 Date: ${this.getTodayDate()}\n` +
          `🔗 Zerodha service reconnected`
        );

        return true;
      } else {
        logger.error('Auto-login failed:', result.error);

        // Send failure notification
        await this.sendDiscordNotification(
          `**Login Failed**\n\nError: ${result.error}`,
          false
        );

        return false;
      }
    } catch (error) {
      logger.error('Auto-login crashed:', error);

      // Send crash notification
      await this.sendDiscordNotification(
        `**Login Crashed**\n\nError: ${error.message}`,
        false
      );

      return false;
    }
  }

  getTodayDate() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().split('T')[0];
  }

  // Manual trigger methods for testing/debugging
  async triggerMorningRoutine() {
    logger.info('Manually triggering morning routine...');
    await this.performMorningRoutine();
  }

  async triggerEveningRoutine() {
    logger.info('Manually triggering evening routine...');
    await this.performEveningRoutine();
  }

  getStatus() {
    return {
      isStrategyActive: this.isStrategyActive,
      todayStrategy: this.todayStrategy,
      todayDate: this.getTodayDate()
    };
  }
}

module.exports = new ScheduledAuth();
