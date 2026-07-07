const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'market.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Ensure the two singleton settings rows always exist.
db.prepare(`INSERT OR IGNORE INTO risk_settings (id) VALUES (1)`).run();
db.prepare(`INSERT OR IGNORE INTO app_settings (id) VALUES (1)`).run();
db.prepare(`INSERT OR IGNORE INTO paper_account (id, name) VALUES (1, 'Paper Account')`).run();

module.exports = db;
