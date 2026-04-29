-- Pulse Pitlane Picks — Supabase / PostgreSQL schema
-- Run this in the Supabase SQL editor to initialise the database.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT    UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  display_name  TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user',
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS predictions (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  race_round     INTEGER NOT NULL,
  season         INTEGER NOT NULL DEFAULT 2026,
  pole           TEXT,
  pos_1          TEXT, pos_2  TEXT, pos_3  TEXT, pos_4  TEXT, pos_5  TEXT,
  pos_6          TEXT, pos_7  TEXT, pos_8  TEXT, pos_9  TEXT, pos_10 TEXT,
  dnf            TEXT,
  sprint_winner  TEXT,
  submitted_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, race_round, season)
);

CREATE TABLE IF NOT EXISTS race_config (
  id               SERIAL PRIMARY KEY,
  race_round       INTEGER NOT NULL,
  season           INTEGER NOT NULL DEFAULT 2026,
  lock_time        TIMESTAMPTZ,
  manually_locked  INTEGER NOT NULL DEFAULT 0,
  is_sprint        INTEGER NOT NULL DEFAULT 0,
  cancelled        INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  UNIQUE(race_round, season)
);

CREATE TABLE IF NOT EXISTS scoring_rules (
  id          SERIAL PRIMARY KEY,
  rule_key    TEXT UNIQUE NOT NULL,
  points      INTEGER NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS race_scores (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  race_round   INTEGER NOT NULL,
  season       INTEGER NOT NULL DEFAULT 2026,
  points_total INTEGER NOT NULL DEFAULT 0,
  breakdown    TEXT NOT NULL DEFAULT '{}',
  scored_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, race_round, season)
);

CREATE TABLE IF NOT EXISTS race_results (
  id          SERIAL PRIMARY KEY,
  race_round  INTEGER NOT NULL,
  season      INTEGER NOT NULL DEFAULT 2026,
  result_json TEXT    NOT NULL,
  source      TEXT    NOT NULL DEFAULT 'openf1',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(race_round, season)
);

-- Default scoring rules (idempotent)
INSERT INTO scoring_rules (rule_key, points, description) VALUES
  ('exact_position',        3, 'Driver guessed in exact correct finishing position'),
  ('position_one_off',      1, 'Driver finishes one place above or below your guess'),
  ('pole_correct',          2, 'Pole position guess is correct'),
  ('dnf_correct',           1, 'DNF driver guess is correct'),
  ('sprint_winner_correct', 2, 'Sprint race winner guess is correct (sprint weekends only)')
ON CONFLICT (rule_key) DO NOTHING;
