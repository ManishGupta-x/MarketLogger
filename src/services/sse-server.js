const http = require('http');
const logger = require('../utils/logger');

class SSEServer {
  constructor() {
    this.tickClients = new Set();
    this.logClients = new Set();
    this.server = null;
    this.latestTicks = new Map(); // token -> tick data
    this.logBuffer = []; // Recent logs for logs page
    this.maxLogBuffer = 1000;
    this.tokenToSymbolMap = null; // Will be set by grid-strategy
  }

  setTokenMap(tokenMap) {
    this.tokenToSymbolMap = tokenMap;
  }

  async start(port = 8080) {
    this.server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
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
    // This will be populated by paper trading service
    const portfolio = this.portfolioData || {
      cash: 0,
      holdings: [],
      totalValue: 0,
      realizedPnl: 0,
      unrealizedPnl: 0
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(portfolio));
  }

  updatePortfolio(portfolioData) {
    this.portfolioData = portfolioData;
  }

  stop() {
    if (this.server) {
      this.server.close();
      logger.info('SSE Server stopped');
    }
  }
}

module.exports = new SSEServer();
