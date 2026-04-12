/**
 * SSE (Server-Sent Events) broadcaster.
 * Maintains a set of response objects per channel and writes events to them.
 */
class SSEBroadcaster {
  constructor() {
    this.clients = {
      ticks:     new Set(),
      portfolio: new Set(),
      orders:    new Set(),
      regime:    new Set(),
      logs:      new Set()
    };
  }

  // Register a client on a channel and send heartbeat
  addClient(channel, res) {
    if (!this.clients[channel]) this.clients[channel] = new Set();
    this.clients[channel].add(res);
    res.on('close', () => this.clients[channel].delete(res));
  }

  // Send event to all clients on a channel
  emit(channel, event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients[channel] || []) {
      try { res.write(payload); } catch (e) { this.clients[channel].delete(res); }
    }
  }

  // Convenience methods used by orchestrator and tick-processor
  broadcast(type, data) {
    switch (type) {
      case 'tick':    this.emit('ticks',     'tick',    data); break;
      case 'order':   this.emit('orders',    'order',   data); this.emit('portfolio', 'update', data); break;
      case 'regime':  this.emit('regime',    'change',  data); break;
      case 'log':     this.emit('logs',      'log',     data); break;
      default:        this.emit(type, 'data', data);
    }
  }

  broadcastPortfolio(data) { this.emit('portfolio', 'update', data); }

  clientCount(channel) { return this.clients[channel]?.size || 0; }

  getStats() {
    const out = {};
    for (const [ch, set] of Object.entries(this.clients)) out[ch] = set.size;
    return out;
  }
}

module.exports = new SSEBroadcaster();
