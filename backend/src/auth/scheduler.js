const cron = require('node-cron');
const axios = require('axios');
const AutoLogin = require('./auto-login');
const zerodha  = require('./zerodha');
const db       = require('../database');
const logger   = require('../../utils/logger');
const entry    = require('../strategy/entry');
const exit     = require('../strategy/exit');

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || '';

class Scheduler {
  constructor() {
    this.autoLogin = new AutoLogin();
    this.paperTrading = null;
    this.orchestrator = null;
    this.isStrategyActive = false;
    this.todayStrategy = null;
  }

  setServices(paperTrading, orchestrator) {
    this.paperTrading = paperTrading;
    this.orchestrator = orchestrator;
  }

  async start() {
    // 8:00 AM IST Mon-Fri — login + load strategy
    cron.schedule('0 8 * * 1-5', async () => {
      logger.info('=== 8:00 AM morning routine ===');
      await this._morningRoutine();
    }, { timezone: 'Asia/Kolkata' });

    // 3:40 PM IST Mon-Fri — close strategy
    cron.schedule('40 15 * * 1-5', async () => {
      logger.info('=== 3:40 PM evening routine ===');
      await this._eveningRoutine();
    }, { timezone: 'Asia/Kolkata' });

    logger.info('Scheduler started: morning 8:00 AM, close 3:40 PM (IST, Mon-Fri)');
    await this._startupCheck();
  }

  async _startupCheck() {
    try {
      logger.info('Startup: checking token validity...');
      const valid = await zerodha.initialize();
      if (!valid) {
        logger.info('Token invalid, performing auto-login...');
        await this._doLogin();
      }

      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const h = now.getHours(), m = now.getMinutes(), d = now.getDay();
      if (d >= 1 && d <= 5 && (h > 8 || (h === 8 && m >= 0)) && (h < 15 || (h === 15 && m < 40))) {
        logger.info('Started during trading hours, loading strategy...');
        await this._loadStrategy();
      }
    } catch (err) {
      logger.error('Startup check failed:', err.message);
    }
  }

  async _morningRoutine() {
    try {
      const today = this._today();
      const loginOk = await this._doLogin();
      if (!loginOk) { logger.error('Morning routine aborted: login failed'); return; }

      const cal = db.getCalendarStrategyWithFallback(today);
      if (cal.source === 'holiday') { logger.info(`${today} is a holiday`); return; }

      // Reset strategy state for new day
      entry.reset();
      exit.reset();
      if (this.orchestrator) {
        this.orchestrator.warmupComplete = false;
        this.orchestrator.tickCount = 0;
        logger.info('Morning reset: entry, exit, warmup cleared for fresh start');
      }

      await this._loadStrategy();
      logger.info('=== Morning routine complete ===');
    } catch (err) {
      logger.error('Morning routine failed:', err.message);
    }
  }

  async _loadStrategy() {
    const today = this._today();
    const cal = db.getCalendarStrategyWithFallback(today);

    if (cal.source === 'holiday') { this.isStrategyActive = false; return; }

    if (!cal.strategy) {
      this.todayStrategy = {
        gridPercentage: 0.25, targetPercentage: 0.25, stopLossPercentage: 1,
        perTradeAmount: parseFloat(process.env.AMOUNT_PER_TRADE) || 6000,
        capital: parseFloat(process.env.INITIAL_CAPITAL) || 100000
      };
    } else {
      const s = cal.strategy;
      this.todayStrategy = {
        gridPercentage:      s.grid_percentage,
        targetPercentage:    s.target_percentage,
        stopLossPercentage:  s.stop_loss_percentage,
        perTradeAmount:      s.per_trade_amount,
        capital:             s.capital
      };
    }

    await this._applyStrategy(this.todayStrategy);

    if (!db.getDailyStrategy(today)) {
      db.createDailyStrategy(this.todayStrategy);
    }

    this.isStrategyActive = true;
    logger.info(`Strategy loaded: perTrade=${this.todayStrategy.perTradeAmount}, capital=${this.todayStrategy.capital}`);
  }

  async _applyStrategy(s) {
    process.env.AMOUNT_PER_TRADE = s.perTradeAmount.toString();
    process.env.INITIAL_CAPITAL  = s.capital.toString();
    if (this.paperTrading) {
      this.paperTrading.amountPerTrade = s.perTradeAmount;
    }
  }

  async _eveningRoutine() {
    try {
      const today = this._today();
      const daily = db.getDailyStrategy(today);
      if (!daily || daily.status === 'completed') { logger.info('No active strategy to close'); return; }
      await this._closeStrategy(today);
      this.isStrategyActive = false;
      logger.info('=== Evening routine complete ===');
    } catch (err) {
      logger.error('Evening routine failed:', err.message);
    }
  }

  async _closeStrategy(date) {
    const txns      = db.getTodayTransactions();
    const pnl       = db.getTodayPnl();
    const holdings  = db.getAllHoldings();
    const state     = db.getPortfolioState();
    const existing  = db.getDailyStrategy(date);

    const sells = txns.filter(t => t.type === 'SELL');
    const buys  = txns.filter(t => t.type === 'BUY');

    const metrics = {
      total_trades: txns.length, buy_count: buys.length, sell_count: sells.length,
      winning_trades: sells.filter(t => t.pnl > 0).length,
      losing_trades:  sells.filter(t => t.pnl < 0).length,
      realized_pnl:   pnl.realized_pnl || 0,
      buy_value:       pnl.buy_value || 0,
      sell_value:      pnl.sell_value || 0,
      total_brokerage: sells.reduce((s, t) => s + (t.brokerage || 0), 0),
      max_single_win:  sells.length ? Math.max(0, ...sells.map(t => t.pnl || 0)) : 0,
      max_single_loss: sells.length ? Math.min(0, ...sells.map(t => t.pnl || 0)) : 0,
      ending_cash_balance:   state?.cash_balance || 0,
      ending_holdings_count: holdings.length,
      ending_holdings_value: holdings.reduce((s, h) => s + h.invested_value, 0),
      status: 'completed', completed_at: new Date().toISOString()
    };

    metrics.win_rate   = metrics.sell_count > 0 ? parseFloat((metrics.winning_trades / metrics.sell_count * 100).toFixed(2)) : 0;
    metrics.pnl_percent = existing?.capital > 0 ? parseFloat((metrics.realized_pnl / existing.capital * 100).toFixed(4)) : 0;

    db.updateDailyStrategy(date, metrics);
    logger.info(`Strategy closed: trades=${metrics.total_trades}, P&L=Rs.${metrics.realized_pnl.toFixed(2)} (${metrics.pnl_percent}%), winRate=${metrics.win_rate}%`);
  }

  async _doLogin() {
    try {
      const result = await this.autoLogin.login();
      if (result.success) {
        zerodha.setAccessToken(result.accessToken);
        await zerodha.initialize();
        await this._discord(`**8AM Login** in ${result.duration}s — date: ${this._today()}`);
        return true;
      } else {
        await this._discord(`**Login Failed** — ${result.error}`, false);
        return false;
      }
    } catch (err) {
      await this._discord(`**Login Crashed** — ${err.message}`, false);
      return false;
    }
  }

  async _discord(msg, success = true) {
    if (!DISCORD_WEBHOOK) return;
    try {
      await axios.post(DISCORD_WEBHOOK, {
        embeds: [{
          title: success ? '✅ MarketLogger' : '❌ MarketLogger',
          description: msg, color: success ? 0x00ff00 : 0xff0000,
          timestamp: new Date().toISOString(), footer: { text: 'MarketLogger' }
        }]
      });
    } catch (e) { logger.error('Discord notify failed:', e.message); }
  }

  _today() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().split('T')[0];
  }

  getStatus() {
    return { isStrategyActive: this.isStrategyActive, todayStrategy: this.todayStrategy, today: this._today() };
  }

  // Manual triggers
  async triggerMorning()  { await this._morningRoutine(); }
  async triggerEvening()  { await this._eveningRoutine(); }
}

module.exports = new Scheduler();
