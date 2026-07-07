PRAGMA foreign_keys = ON;

-- ===================== Research =====================

CREATE TABLE IF NOT EXISTS stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,          -- e.g. RELIANCE
  name TEXT NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'NSE', -- NSE | BSE
  isin TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS industries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_industries (
  stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  industry_id INTEGER NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
  PRIMARY KEY (stock_id, industry_id)
);

-- Typed research sections per stock: bull_case, bear_case, history, quarterly,
-- kpis, risks, valuation, observations, links
CREATE TABLE IF NOT EXISTS research_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_notes_stock ON research_notes(stock_id);

CREATE TABLE IF NOT EXISTS industry_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  industry_id INTEGER NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_industry_notes_industry ON industry_notes(industry_id);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
  industry_id INTEGER REFERENCES industries(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,       -- stored on-disk filename
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,       -- industry_fundamentals | company_history | bull_case | bear_case | quarterly_update
  body TEXT NOT NULL DEFAULT '',
  placeholders TEXT NOT NULL DEFAULT '[]', -- JSON array of placeholder names
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name, category)
);

CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  notes TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(stock_id)
);

-- ===================== Market data =====================

CREATE TABLE IF NOT EXISTS candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  source TEXT NOT NULL,        -- csv | yahoo | kite
  date TEXT NOT NULL,          -- YYYY-MM-DD
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume INTEGER NOT NULL DEFAULT 0,
  UNIQUE(symbol, source, date)
);
CREATE INDEX IF NOT EXISTS idx_candles_symbol_date ON candles(symbol, date);

-- ===================== Strategies & backtests =====================

CREATE TABLE IF NOT EXISTS strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,          -- sma_crossover | rsi | breakout
  params TEXT NOT NULL DEFAULT '{}', -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backtests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id INTEGER NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  initial_capital REAL NOT NULL DEFAULT 100000,
  params TEXT NOT NULL DEFAULT '{}',   -- JSON: slippage_bps, position sizing, stop/target
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed
  error TEXT,
  results TEXT,                        -- JSON summary metrics + equity curve
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS backtest_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_id INTEGER NOT NULL REFERENCES backtests(id) ON DELETE CASCADE,
  side TEXT NOT NULL,          -- long | short
  entry_date TEXT NOT NULL,
  entry_price REAL NOT NULL,
  exit_date TEXT,
  exit_price REAL,
  quantity INTEGER NOT NULL,
  pnl REAL,
  costs REAL NOT NULL DEFAULT 0,
  exit_reason TEXT             -- signal | stop_loss | take_profit | end_of_data
);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_backtest ON backtest_trades(backtest_id);

-- ===================== Paper trading =====================

CREATE TABLE IF NOT EXISTS paper_account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'Paper Account',
  starting_capital REAL NOT NULL DEFAULT 1000000,
  cash REAL NOT NULL DEFAULT 1000000,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paper_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES paper_account(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,              -- buy | sell
  order_type TEXT NOT NULL DEFAULT 'market',
  quantity INTEGER NOT NULL,
  limit_price REAL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | filled | rejected | cancelled
  strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL,
  reason TEXT,
  filled_price REAL,
  filled_at TEXT,
  reject_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_paper_orders_account ON paper_orders(account_id);

CREATE TABLE IF NOT EXISTS paper_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES paper_account(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  avg_price REAL NOT NULL DEFAULT 0,
  realized_pnl REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, symbol)
);

-- ===================== Risk & safety =====================

CREATE TABLE IF NOT EXISTS order_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,              -- paper | live_readonly | live_confirm | live_auto
  action TEXT NOT NULL,            -- order_attempt
  symbol TEXT,
  side TEXT,
  quantity INTEGER,
  price REAL,
  passed INTEGER NOT NULL,         -- 0/1
  risk_checks TEXT NOT NULL DEFAULT '[]', -- JSON array of {check, passed, detail}
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_log_created ON order_log(created_at);

CREATE TABLE IF NOT EXISTS risk_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  max_order_value REAL NOT NULL DEFAULT 50000,
  max_daily_loss REAL NOT NULL DEFAULT 20000,
  max_risk_per_trade_pct REAL NOT NULL DEFAULT 1.0,
  max_open_positions INTEGER NOT NULL DEFAULT 10,
  max_position_exposure_pct REAL NOT NULL DEFAULT 20.0,
  max_total_exposure_pct REAL NOT NULL DEFAULT 80.0,
  kill_switch_active INTEGER NOT NULL DEFAULT 0,
  kill_switch_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  broker_mode TEXT NOT NULL DEFAULT 'paper', -- paper | live_readonly | live_confirm | live_auto
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
