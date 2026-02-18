const http = require('http');
const logger = require('../utils/logger');

class SSEServer {
  constructor() {
    this.tickClients = new Set();
    this.logClients = new Set();
    this.portfolioClients = new Set();
    this.server = null;
    this.latestTicks = new Map(); // token -> tick data
    this.logBuffer = []; // Recent logs for logs page
    this.maxLogBuffer = 1000;
    this.tokenToSymbolMap = null; // Will be set by grid-strategy
    this.paperTradingService = null; // Reference to paper trading service
  }

  setTokenMap(tokenMap) {
    this.tokenToSymbolMap = tokenMap;
  }

  setPaperTradingService(service) {
    this.paperTradingService = service;
  }

  async start(port = 8080) {
    this.server = http.createServer((req, res) => {
      // CORS headers - allow all origins and ngrok header
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ngrok-skip-browser-warning');
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
      } else if (req.url === '/api/stats') {
        this.handleStats(req, res);
      } else if (req.url === '/api/daily-pnl') {
        this.handleDailyPnl(req, res);
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

  updatePortfolio(portfolioData) {
    this.portfolioData = portfolioData;
    // Also broadcast to portfolio SSE clients
    this.broadcastPortfolio();
  }

  stop() {
    if (this.server) {
      this.server.close();
      logger.info('SSE Server stopped');
    }
  }
}

module.exports = new SSEServer();
