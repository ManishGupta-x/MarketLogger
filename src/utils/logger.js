const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir);
    }
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    console.log(logMessage);
    if (data) console.log(data);

    const logFile = path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logMessage + (data ? `\n${JSON.stringify(data)}` : '') + '\n');
  }

  info(message, data) { this.log('info', message, data); }
  error(message, data) { this.log('error', message, data); }
  warn(message, data) { this.log('warn', message, data); }
}

module.exports = new Logger();  