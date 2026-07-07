const fs = require('fs');
const path = require('path');

// Single choke point for all log output. Any object key matching this pattern
// has its value redacted before it's written to console or disk, so secrets
// (api keys, tokens, passwords) can never leak through a stray log call.
const SECRET_KEY_PATTERN = /(api[_-]?key|secret|token|password|totp)/i;

function redact(data) {
  if (data == null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(redact);
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      out[key] = redact(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const safeData = redact(data);
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logMessage);
    if (safeData) console.log(safeData);
    const logFile = path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logMessage + (safeData ? `\n${JSON.stringify(safeData)}` : '') + '\n');
  }

  info(message, data) { this.log('info', message, data); }
  error(message, data) { this.log('error', message, data); }
  warn(message, data) { this.log('warn', message, data); }
  debug(message, data) { this.log('debug', message, data); }
}

module.exports = new Logger();
