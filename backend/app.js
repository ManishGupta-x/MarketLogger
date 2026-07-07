require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const logger = require('./utils/logger');
const seed = require('./src/db/seed');
const scheduler = require('./src/auth/scheduler');
const { startServer } = require('./src/api/server');

const PORT = process.env.PORT || 4000;

async function main() {
  logger.info('=== Market backend starting ===');

  seed();

  startServer(PORT);

  if (process.env.ZERODHA_API_KEY) {
    await scheduler.start();
  } else {
    logger.warn('ZERODHA_API_KEY not set — skipping auth scheduler (broker features will be unavailable)');
  }
}

main().catch(err => {
  logger.error('Fatal startup error:', err.message);
  process.exit(1);
});
