const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'planning-box.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      is_active INTEGER DEFAULT 1
    );
    
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
  `);
  
  // Plan-Uploads table (human-created ideas/notes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'open' CHECK(status IN ('open','processing','planned','complete')),
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_uploads_user ON plan_uploads(user_id);
    CREATE INDEX IF NOT EXISTS idx_uploads_status ON plan_uploads(status);
  `);
  
  // Comments on Plan-Uploads
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_upload_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      parent_id INTEGER,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_upload_id) REFERENCES plan_uploads(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES comments(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_comments_upload ON comments(plan_upload_id);
    CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
  `);
  
  console.log('Database schema initialized');
}

/**
 * Initialize API Tokens table (Phase 4)
 */
function initializeApiTokens() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used DATETIME,
      expires_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);
  `);
  
  console.log('API Tokens table initialized');
}

/**
 * Initialize Plans table (Phase 4)
 */
function initializePlans() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_token_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      phases TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_token_id) REFERENCES api_tokens(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_plans_agent ON plans(agent_token_id);
  `);
  
  console.log('Plans table initialized');
}

/**
 * Initialize Plan-Uploads Plans junction table (Phase 4)
 */
function initializePlanUploadsPlans() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_uploads_plans (
      plan_id INTEGER NOT NULL,
      plan_upload_id INTEGER NOT NULL,
      PRIMARY KEY (plan_id, plan_upload_id),
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_upload_id) REFERENCES plan_uploads(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_plan_uploads_plans_upload ON plan_uploads_plans(plan_upload_id);
  `);
  
  console.log('Plan-Uploads Plans junction table initialized');
}

initializeSchema();
initializeApiTokens();
initializePlans();
initializePlanUploadsPlans();

module.exports = { db, DB_PATH };
