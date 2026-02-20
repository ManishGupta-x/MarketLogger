const http = require('http');
const logger = require('../utils/logger');

class SSEServer {
  constructor() {
    this.tickClients = new Set();
    this.logClients = new Set();
    this.portfolioClients = new Set();
    this.orderClients = new Set();
    this.regimeClients = new Set(); // New: regime change SSE clients
    this.server = null;
    this.latestTicks = new Map(); // token -> tick data
    this.logBuffer = []; // Recent logs for logs page
    this.maxLogBuffer = 1000;
    this.tokenToSymbolMap = null; // Will be set by grid-strategy
    this.paperTradingService = null; // Reference to paper trading service
    this.gridStrategyService = null; // Reference to grid strategy service
    this.lastPortfolioBroadcast = 0;
    this.portfolioBroadcastInterval = 1000; // Broadcast portfolio every 1 second max
  }

  setTokenMap(tokenMap) {
    this.tokenToSymbolMap = tokenMap;
  }

  setPaperTradingService(service) {
    this.paperTradingService = service;
  }

  setGridStrategyService(service) {
    this.gridStrategyService = service;
  }

  async start(port = 8080) {
    this.server = http.createServer((req, res) => {
      // CORS headers - allow all origins
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '86400');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Routes
      if (req.url === '/api/ticks/stream') {
        this.handleTicksSSE(req, res);
      } else if (req.url === '/api/ticks/latest') {
        this.handleLatestTicks(req, res);
      } else if (req.url === '/api/logs/stream') {
        this.handleLogsSSE(req, res);
      } else if (req.url === '/api/tokens') {
        this.handleTokenList(req, res);
      } else if (req.url === '/api/portfolio') {
        this.handlePortfolio(req, res);
      } else if (req.url === '/api/portfolio/stream') {
        this.handlePortfolioSSE(req, res);
      } else if (req.url === '/api/holdings') {
        this.handleHoldings(req, res);
      } else if (req.url === '/api/orders') {
        this.handleOrders(req, res);
      } else if (req.url === '/api/orders/today') {
        this.handleTodayOrders(req, res);
      } else if (req.url === '/api/orders/stream') {
        this.handleOrdersSSE(req, res);
      } else if (req.url === '/api/stats') {
        this.handleStats(req, res);
      } else if (req.url === '/api/daily-pnl') {
        this.handleDailyPnl(req, res);
      } else if (req.url === '/api/strategies') {
        this.handleStrategies(req, res);
      } else if (req.url === '/api/strategies/today') {
        this.handleTodayStrategy(req, res);
      } else if (req.url === '/api/calendar' && req.method === 'GET') {
        this.handleCalendar(req, res);
      } else if (req.url === '/api/calendar' && req.method === 'POST') {
        this.handleCalendarPost(req, res);
      } else if (req.url === '/api/regime') {
        this.handleRegime(req, res);
      } else if (req.url === '/api/regime/stream') {
        this.handleRegimeSSE(req, res);
      } else if (req.url === '/api/regime/history') {
        this.handleRegimeHistory(req, res);
      } else if (req.url === '/api/active-stocks') {
        this.handleActiveStocks(req, res);
      } else if (req.url.startsWith('/api/stock-rankings')) {
        this.handleStockRankings(req, res);
      } else if (req.url === '/api/adaptive-info') {
        this.handleAdaptiveInfo(req, res);
      } else if (req.url === '/api/exit-stats') {
        this.handleExitStats(req, res);
      } else if (req.url === '/api/risk-status') {
        this.handleRiskStatus(req, res);
      } else if (req.url === '/api/risk-resume' && req.method === 'POST') {
        this.handleRiskResume(req, res);
      } else if (req.url === '/api/cost-estimate') {
        this.handleCostEstimate(req, res);
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', clients: this.tickClients.size }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      }
    });

    return new Promise((resolve) => {
      this.server.listen(port, () => {
        logger.info(`SSE Server running on port ${port}`);
        resolve();
      });
    });
  }

  handleTicksSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    this.tickClients.add(res);
    logger.info(`SSE client connected. Total: ${this.tickClients.size}`);

    // Send initial snapshot of all latest ticks
    const snapshot = Array.from(this.latestTicks.values());
    if (snapshot.length > 0) {
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
    }

    req.on('close', () => {
      this.tickClients.delete(res);
      logger.info(`SSE client disconnected. Total: ${this.tickClients.size}`);
    });
  }

  handleLogsSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    this.logClients.add(res);

    // Send recent log buffer
    if (this.logBuffer.length > 0) {
      res.write(`event: history\ndata: ${JSON.stringify(this.logBuffer.slice(-100))}\n\n`);
    }

    req.on('close', () => {
      this.logClients.delete(res);
    });
  }

  handlePortfolioSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    this.portfolioClients.add(res);

    // Send initial portfolio state
    if (this.paperTradingService) {
      const portfolio = this.paperTradingService.getPortfolio();
      const holdings = this.paperTradingService.getHoldings();
      res.write(`event: portfolio\ndata: ${JSON.stringify({ ...portfolio, holdings })}\n\n`);
    }

    req.on('close', () => {
      this.portfolioClients.delete(res);
    });
  }

  handleOrdersSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    this.orderClients.add(res);

    req.on('close', () => {
      this.orderClients.delete(res);
    });
  }

  broadcastOrder(order) {
    if (this.orderClients.size === 0) return;

    const data = JSON.stringify(order);
    this.orderClients.forEach(client => {
      try {
        client.write(`event: order\ndata: ${data}\n\n`);
      } catch (err) {
        this.orderClients.delete(client);
      }
    });
  }

  broadcastTicks(ticks) {
    const timestamp = Date.now();

    // Update latest ticks cache with symbol names
    ticks.forEach(tick => {
      const symbol = this.tokenToSymbolMap?.get(tick.instrument_token) || `Token-${tick.instrument_token}`;
      const enrichedTick = {
        ...tick,
        symbol: symbol.replace('NSE:', ''),
        timestamp
      };
      this.latestTicks.set(tick.instrument_token, enrichedTick);
    });

    // Add to log buffer
    const logEntry = {
      timestamp,
      count: ticks.length,
      ticks: ticks.map(t => ({
        ...t,
        symbol: (this.tokenToSymbolMap?.get(t.instrument_token) || `Token-${t.instrument_token}`).replace('NSE:', '')
      }))
    };
    this.logBuffer.push(logEntry);
    if (this.logBuffer.length > this.maxLogBuffer) {
      this.logBuffer.shift();
    }

    // Broadcast to tick clients
    const enrichedTicks = ticks.map(t => ({
      ...t,
      symbol: (this.tokenToSymbolMap?.get(t.instrument_token) || `Token-${t.instrument_token}`).replace('NSE:', ''),
      timestamp
    }));
    const tickData = JSON.stringify(enrichedTicks);
    this.tickClients.forEach(client => {
      try {
        client.write(`event: ticks\ndata: ${tickData}\n\n`);
      } catch (err) {
        this.tickClients.delete(client);
      }
    });

    // Broadcast to log clients
    const logData = JSON.stringify(logEntry);
    this.logClients.forEach(client => {
      try {
        client.write(`event: log\ndata: ${logData}\n\n`);
      } catch (err) {
        this.logClients.delete(client);
      }
    });

    // Update holding prices and broadcast portfolio (throttled)
    if (this.paperTradingService && this.portfolioClients.size > 0) {
      // Update holding prices with latest tick data
      ticks.forEach(tick => {
        if (tick.last_price) {
          this.paperTradingService.updateHoldingPrice(tick.instrument_token, tick.last_price);
        }
      });

      // Throttle portfolio broadcasts to avoid overwhelming clients
      const now = Date.now();
      if (now - this.lastPortfolioBroadcast >= this.portfolioBroadcastInterval) {
        this.lastPortfolioBroadcast = now;
        this.broadcastPortfolio();
      }
    }
  }

  broadcastPortfolio() {
    if (!this.paperTradingService || this.portfolioClients.size === 0) return;

    const portfolio = this.paperTradingService.getPortfolio();
    const holdings = this.paperTradingService.getHoldings();
    const data = JSON.stringify({ ...portfolio, holdings });

    this.portfolioClients.forEach(client => {
      try {
        client.write(`event: portfolio\ndata: ${data}\n\n`);
      } catch (err) {
        this.portfolioClients.delete(client);
      }
    });
  }

  handleLatestTicks(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Array.from(this.latestTicks.values())));
  }

  handleTokenList(req, res) {
    const tokens = [];
    if (this.tokenToSymbolMap) {
      for (const [token, symbol] of this.tokenToSymbolMap.entries()) {
        tokens.push({
          token,
          symbol: symbol.replace('NSE:', '')
        });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tokens));
  }

  handlePortfolio(req, res) {
    let portfolio = {
      cash: 0,
      holdings: [],
      totalValue: 0,
      realizedPnl: 0,
      unrealizedPnl: 0
    };

    if (this.paperTradingService) {
      portfolio = this.paperTradingService.getPortfolio();
      portfolio.holdings = this.paperTradingService.getHoldings();
    } else if (this.portfolioData) {
      portfolio = this.portfolioData;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(portfolio));
  }

  handleHoldings(req, res) {
    let holdings = [];
    if (this.paperTradingService) {
      holdings = this.paperTradingService.getHoldings();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(holdings));
  }

  handleOrders(req, res) {
    let orders = [];
    if (this.paperTradingService) {
      orders = this.paperTradingService.getOrders(100);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(orders));
  }

  handleTodayOrders(req, res) {
    let orders = [];
    if (this.paperTradingService) {
      orders = this.paperTradingService.getTodayOrders();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(orders));
  }

  handleStats(req, res) {
    let stats = {
      totalTrades: 0,
      profitableTrades: 0,
      lossTrades: 0,
      winRate: 0
    };
    if (this.paperTradingService) {
      stats = this.paperTradingService.getStats();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
  }

  handleDailyPnl(req, res) {
    let dailyPnl = [];
    if (this.paperTradingService) {
      dailyPnl = this.paperTradingService.getDailyPnl(30);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dailyPnl));
  }

  handleStrategies(req, res) {
    const database = require('./database.service');
    const strategies = database.getAllDailyStrategies(30);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(strategies));
  }

  handleTodayStrategy(req, res) {
    const database = require('./database.service');
    const strategy = database.getTodayStrategy();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(strategy || { status: 'none' }));
  }

  handleCalendar(req, res) {
    const database = require('./database.service');
    const calendar = database.getUpcomingCalendarStrategies(14);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(calendar));
  }

  handleCalendarPost(req, res) {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const database = require('./database.service');

        // Validate required fields
        const required = ['date', 'gridPercentage', 'targetPercentage', 'stopLossPercentage', 'perTradeAmount', 'capital'];
        const missing = required.filter(f => data[f] === undefined || data[f] === null);

        if (missing.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Missing fields: ${missing.join(', ')}` }));
          return;
        }

        // Handle holiday
        if (data.isHoliday) {
          database.markAsHoliday(data.date, data.notes || null);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: `Marked ${data.date} as holiday` }));
          return;
        }

        // Add/update calendar entry
        database.upsertCalendarStrategy(data.date, {
          gridPercentage: parseFloat(data.gridPercentage),
          targetPercentage: parseFloat(data.targetPercentage),
          stopLossPercentage: parseFloat(data.stopLossPercentage),
          perTradeAmount: parseFloat(data.perTradeAmount),
          capital: parseFloat(data.capital),
          isHoliday: false,
          notes: data.notes || null
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Strategy scheduled for ${data.date}` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }

  updatePortfolio(portfolioData) {
    this.portfolioData = portfolioData;
    // Also broadcast to portfolio SSE clients
    this.broadcastPortfolio();
  }

  // ==========================================
  // Adaptive Trading Endpoints
  // ==========================================

  handleRegime(req, res) {
    const marketRegime = require('./market-regime.service');
    const regime = marketRegime.getRegime();
    const dataStatus = marketRegime.getDataStatus();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...regime, dataStatus }));
  }

  handleRegimeSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    this.regimeClients.add(res);

    // Send initial regime state
    const marketRegime = require('./market-regime.service');
    const regime = marketRegime.getRegime();
    res.write(`event: regime\ndata: ${JSON.stringify(regime)}\n\n`);

    req.on('close', () => {
      this.regimeClients.delete(res);
    });
  }

  handleRegimeHistory(req, res) {
    const marketRegime = require('./market-regime.service');
    const history = marketRegime.getRegimeHistory(50);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(history));
  }

  handleActiveStocks(req, res) {
    const stockScreener = require('./stock-screener.service');
    const activeStocks = stockScreener.getActiveStocks();
    const status = stockScreener.getStatus();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ activeStocks, ...status }));
  }

  handleStockRankings(req, res) {
    const stockScreener = require('./stock-screener.service');
    const url = new URL(req.url, `http://${req.headers.host}`);
    const regime = url.searchParams.get('regime');

    let rankings;
    if (regime && ['BULLISH', 'BEARISH', 'SIDEWAYS'].includes(regime.toUpperCase())) {
      rankings = { [regime.toUpperCase()]: stockScreener.getTopStocks(regime.toUpperCase()) };
    } else {
      rankings = stockScreener.getAllRankings();
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rankings));
  }

  handleAdaptiveInfo(req, res) {
    let adaptiveInfo = { enabled: false };

    if (this.gridStrategyService) {
      adaptiveInfo = this.gridStrategyService.getAdaptiveInfo();
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(adaptiveInfo));
  }

  handleExitStats(req, res) {
    const database = require('./database.service');
    const exitStats = database.getExitReasonStats(30);
    const regimeStats = database.getRegimePerformanceStats(30);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ exitStats, regimeStats }));
  }

  handleRiskStatus(req, res) {
    let riskStatus = { initialized: false };

    if (this.gridStrategyService) {
      riskStatus = this.gridStrategyService.getRiskStatus();
    }

    // Also get recent risk events
    const database = require('./database.service');
    const recentEvents = database.getTodayRiskEvents();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...riskStatus, recentEvents }));
  }

  handleRiskResume(req, res) {
    if (!this.gridStrategyService) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Grid strategy not initialized' }));
      return;
    }

    const result = this.gridStrategyService.forceResumeTrading();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  }

  handleCostEstimate(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const price = parseFloat(url.searchParams.get('price')) || 100;
    const qty = parseInt(url.searchParams.get('qty')) || 50;
    const targetPercent = parseFloat(url.searchParams.get('target')) || 0.25;

    if (!this.gridStrategyService) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Grid strategy not initialized' }));
      return;
    }

    const estimate = this.gridStrategyService.estimateTradeCosts(price, qty, targetPercent);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(estimate));
  }

  broadcastRegimeChange(regimeData) {
    if (this.regimeClients.size === 0) return;

    const data = JSON.stringify(regimeData);
    this.regimeClients.forEach(client => {
      try {
        client.write(`event: regime_change\ndata: ${data}\n\n`);
      } catch (err) {
        this.regimeClients.delete(client);
      }
    });

    logger.info(`Broadcast regime change to ${this.regimeClients.size} clients`);
  }

  stop() {
    if (this.server) {
      this.server.close();
      logger.info('SSE Server stopped');
    }
  }
}

module.exports = new SSEServer();
