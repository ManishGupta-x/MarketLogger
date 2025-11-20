-- Run this SQL in your Supabase SQL Editor to create the required tables

-- Virtual orders table
CREATE TABLE IF NOT EXISTS virtual_orders (
  id BIGSERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL DEFAULT 'default',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
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
  notes TEXT
);

-- Virtual holdings table
CREATE TABLE IF NOT EXISTS virtual_holdings (
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
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, token)
);

-- Virtual portfolio snapshots table
CREATE TABLE IF NOT EXISTS virtual_portfolio (
  id BIGSERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL DEFAULT 'default',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  cash_balance REAL NOT NULL,
  holdings_value REAL NOT NULL,
  total_value REAL NOT NULL,
  total_pnl REAL NOT NULL,
  total_pnl_percent REAL NOT NULL,
  realized_pnl REAL DEFAULT 0,
  unrealized_pnl REAL DEFAULT 0,
  holdings_count INTEGER DEFAULT 0
);

-- Grid levels table
CREATE TABLE IF NOT EXISTS grid_levels (
  channel_id TEXT NOT NULL DEFAULT 'default',
  token TEXT NOT NULL,
  symbol TEXT NOT NULL,
  last_buy_price REAL,
  last_sell_price REAL,
  reference_price REAL NOT NULL,
  buy_count INTEGER DEFAULT 0,
  sell_count INTEGER DEFAULT 0,
  total_pnl REAL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, token)
);

-- Configuration table
CREATE TABLE IF NOT EXISTS config (
  channel_id TEXT NOT NULL DEFAULT 'default',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, key)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_orders_channel ON virtual_orders(channel_id);
CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON virtual_orders(timestamp);
CREATE INDEX IF NOT EXISTS idx_orders_symbol ON virtual_orders(symbol);
CREATE INDEX IF NOT EXISTS idx_orders_type ON virtual_orders(type);
CREATE INDEX IF NOT EXISTS idx_holdings_channel ON virtual_holdings(channel_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_channel ON virtual_portfolio(channel_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_timestamp ON virtual_portfolio(timestamp);
CREATE INDEX IF NOT EXISTS idx_grid_channel ON grid_levels(channel_id);
CREATE INDEX IF NOT EXISTS idx_grid_active ON grid_levels(is_active);
CREATE INDEX IF NOT EXISTS idx_config_channel ON config(channel_id);

-- Enable Row Level Security (optional but recommended)
-- ALTER TABLE virtual_orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE virtual_holdings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE virtual_portfolio ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE grid_levels ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (adjust as needed for security)
-- CREATE POLICY "Allow all" ON virtual_orders FOR ALL USING (true);
-- CREATE POLICY "Allow all" ON virtual_holdings FOR ALL USING (true);
-- CREATE POLICY "Allow all" ON virtual_portfolio FOR ALL USING (true);
-- CREATE POLICY "Allow all" ON grid_levels FOR ALL USING (true);
-- CREATE POLICY "Allow all" ON config FOR ALL USING (true);
