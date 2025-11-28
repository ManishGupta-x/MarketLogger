const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trading.db');
const db = new Database(dbPath);

console.log('🗑️  Starting database reset...\n');

// Drop all existing tables
console.log('📋 Dropping old tables...');
try {
  db.exec('DROP TABLE IF EXISTS virtual_orders');
  console.log('  ✅ Dropped virtual_orders');
} catch (e) {
  console.log('  ⚠️  virtual_orders does not exist');
}

try {
  db.exec('DROP TABLE IF EXISTS virtual_holdings');
  console.log('  ✅ Dropped virtual_holdings');
} catch (e) {
  console.log('  ⚠️  virtual_holdings does not exist');
}

try {
  db.exec('DROP TABLE IF EXISTS virtual_portfolio');
  console.log('  ✅ Dropped virtual_portfolio');
} catch (e) {
  console.log('  ⚠️  virtual_portfolio does not exist');
}

try {
  db.exec('DROP TABLE IF EXISTS channels');
  console.log('  ✅ Dropped channels');
} catch (e) {
  console.log('  ⚠️  channels does not exist');
}

try {
  db.exec('DROP TABLE IF EXISTS brokerage');
  console.log('  ✅ Dropped brokerage');
} catch (e) {
  console.log('  ⚠️  brokerage does not exist');
}

console.log('\n📦 Creating new tables with updated schema...\n');

// Create virtual_orders table
db.exec(`
  CREATE TABLE virtual_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL DEFAULT 'default',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT NOT NULL,
    token TEXT NOT NULL,
    symbol TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price REAL NOT NULL,
    value REAL NOT NULL,
    balance REAL NOT NULL,
    pnl REAL DEFAULT 0,
    pnl_percent REAL DEFAULT 0,
    grid_level INTEGER DEFAULT 0,
    reference_price REAL,
    notes TEXT,
    synced INTEGER DEFAULT 0
  )
`);
console.log('  ✅ Created virtual_orders');

// Create virtual_holdings table
db.exec(`
  CREATE TABLE virtual_holdings (
    channel_id TEXT NOT NULL DEFAULT 'default',
    token TEXT NOT NULL,
    symbol TEXT NOT NULL,
    qty INTEGER NOT NULL,
    avg_price REAL NOT NULL,
    current_price REAL,
    invested_value REAL NOT NULL,
    current_value REAL,
    unrealized_pnl REAL,
    unrealized_pnl_percent REAL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, token)
  )
`);
console.log('  ✅ Created virtual_holdings');

// Create virtual_portfolio table
db.exec(`
  CREATE TABLE virtual_portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL DEFAULT 'default',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    cash_balance REAL NOT NULL,
    holdings_value REAL NOT NULL,
    total_value REAL NOT NULL,
    total_pnl REAL NOT NULL,
    total_pnl_percent REAL NOT NULL,
    realized_pnl REAL DEFAULT 0,
    unrealized_pnl REAL DEFAULT 0,
    holdings_count INTEGER DEFAULT 0,
    synced INTEGER DEFAULT 0
  )
`);
console.log('  ✅ Created virtual_portfolio');

// Create channels table
db.exec(`
  CREATE TABLE channels (
    channel_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    initial_capital REAL NOT NULL,
    amount_per_trade REAL NOT NULL,
    grid_percentage REAL NOT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('  ✅ Created channels');

// Create brokerage table
db.exec(`
  CREATE TABLE brokerage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    order_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    symbol TEXT NOT NULL,
    buy_price REAL NOT NULL,
    sell_price REAL NOT NULL,
    qty INTEGER NOT NULL,
    turnover REAL NOT NULL,
    brokerage REAL NOT NULL,
    exchange_txn REAL NOT NULL,
    sebi_charges REAL NOT NULL,
    gst REAL NOT NULL,
    total_charges REAL NOT NULL,
    gross_pnl REAL NOT NULL,
    net_pnl REAL NOT NULL,
    synced INTEGER DEFAULT 0
  )
`);
console.log('  ✅ Created brokerage');

console.log('\n📊 Creating indexes...\n');

// Create indexes
db.exec(`
  CREATE INDEX idx_orders_channel ON virtual_orders(channel_id);
  CREATE INDEX idx_orders_timestamp ON virtual_orders(timestamp);
  CREATE INDEX idx_orders_symbol ON virtual_orders(symbol);
  CREATE INDEX idx_orders_synced ON virtual_orders(synced);
  CREATE INDEX idx_holdings_channel ON virtual_holdings(channel_id);
  CREATE INDEX idx_portfolio_channel ON virtual_portfolio(channel_id);
  CREATE INDEX idx_portfolio_synced ON virtual_portfolio(synced);
  CREATE INDEX idx_brokerage_channel ON brokerage(channel_id);
  CREATE INDEX idx_brokerage_order ON brokerage(order_id);
  CREATE INDEX idx_brokerage_synced ON brokerage(synced);
`);
console.log('  ✅ Created all indexes');

console.log('\n🌱 Inserting hardcoded channel configurations...\n');

// Insert the 2 hardcoded channels
db.exec(`
  INSERT INTO channels (channel_id, name, initial_capital, amount_per_trade, grid_percentage)
  VALUES
    ('1443823756823891979', 'smallamount', 100000, 3000, 0.25),
    ('1443823807155409009', 'largeamount', 100000, 10000, 0.25)
`);
console.log('  ✅ Inserted smallamount channel (₹100k capital, ₹3k/trade, 0.25% grid)');
console.log('  ✅ Inserted largeamount channel (₹100k capital, ₹10k/trade, 0.25% grid)');

console.log('\n✅ Database reset complete!');
console.log('\n📝 Summary:');
console.log('  - All old tables dropped');
console.log('  - New tables created with updated schema');
console.log('  - Brokerage tracking table added');
console.log('  - 2 hardcoded channels inserted');
console.log('  - All indexes created');
console.log('\n🚀 You can now start the application with fresh data!\n');

db.close();
