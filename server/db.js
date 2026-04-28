const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'pitlane.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    display_name  TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'user',
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS predictions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    race_round     INTEGER NOT NULL,
    season         INTEGER NOT NULL DEFAULT 2025,
    pole           TEXT,
    pos_1          TEXT, pos_2  TEXT, pos_3  TEXT, pos_4  TEXT, pos_5  TEXT,
    pos_6          TEXT, pos_7  TEXT, pos_8  TEXT, pos_9  TEXT, pos_10 TEXT,
    dnf            TEXT,
    sprint_winner  TEXT,
    submitted_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, race_round, season)
  );

  CREATE TABLE IF NOT EXISTS race_config (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    race_round       INTEGER NOT NULL,
    season           INTEGER NOT NULL DEFAULT 2025,
    lock_time        DATETIME,
    manually_locked  INTEGER NOT NULL DEFAULT 0,
    is_sprint        INTEGER NOT NULL DEFAULT 0,
    notes            TEXT,
    UNIQUE(race_round, season)
  );

  CREATE TABLE IF NOT EXISTS scoring_rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_key    TEXT UNIQUE NOT NULL,
    points      INTEGER NOT NULL,
    description TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS race_scores (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    race_round   INTEGER NOT NULL,
    season       INTEGER NOT NULL DEFAULT 2025,
    points_total INTEGER NOT NULL DEFAULT 0,
    breakdown    TEXT NOT NULL DEFAULT '{}',
    scored_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, race_round, season)
  );
`);

// Migrate: add cancelled column to race_config if missing
const raceCols = db.prepare('PRAGMA table_info(race_config)').all().map(c => c.name);
if (!raceCols.includes('cancelled')) {
  db.exec('ALTER TABLE race_config ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0');
  console.log('DB migration: race_config.cancelled added');
}

// Migrate: rename email → username if the old schema is still in place
const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (userCols.includes('email') && !userCols.includes('username')) {
  // Foreign keys must be off to drop and recreate the users table
  db.pragma('foreign_keys = OFF');
  db.exec(`
    BEGIN;
    CREATE TABLE users_new (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    UNIQUE NOT NULL,
      password_hash TEXT    NOT NULL,
      display_name  TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'user',
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users_new SELECT id, email, password_hash, display_name, role, is_active, created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
    COMMIT;
  `);
  db.pragma('foreign_keys = ON');
  console.log('DB migration: email → username complete');
}

// Seed default scoring rules if empty
const ruleCount = db.prepare('SELECT COUNT(*) as c FROM scoring_rules').get().c;
if (ruleCount === 0) {
  const insert = db.prepare(`
    INSERT INTO scoring_rules (rule_key, points, description) VALUES (?, ?, ?)
  `);
  [
    ['exact_position',        3, 'Driver guessed in exact correct finishing position'],
    ['position_one_off',      1, 'Driver finishes one place above or below your guess'],
    ['pole_correct',          2, 'Pole position guess is correct'],
    ['dnf_correct',           1, 'DNF driver guess is correct'],
    ['sprint_winner_correct', 2, 'Sprint race winner guess is correct (sprint weekends only)'],
  ].forEach(r => insert.run(...r));
}

module.exports = db;
