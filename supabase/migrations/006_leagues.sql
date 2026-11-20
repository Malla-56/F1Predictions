-- Leagues: one account can belong to several leagues, each with its own leaderboard,
-- scoring rules, joker round, polls and admins. Tips stay global (one tip per race,
-- counted in every league the tipper is in), as do race results and lock times.
--
-- Everything that existed before this migration becomes the "Pulse" league (id 1).

CREATE TABLE IF NOT EXISTS leagues (
  id          SERIAL      PRIMARY KEY,
  name        TEXT        NOT NULL,
  created_by  INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- role: 'admin' runs the league (members, scoring, joker, polls, invite codes).
-- is_active = 0 means an admin removed them; their history stays but they're hidden.
CREATE TABLE IF NOT EXISTS league_members (
  league_id  INTEGER     NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id    INTEGER     NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  is_active  INTEGER     NOT NULL DEFAULT 1,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (league_id, user_id)
);
CREATE INDEX IF NOT EXISTS league_members_user_id_idx ON league_members(user_id);

-- Short-lived invite codes (15 minutes), generated on demand by a league admin.
CREATE TABLE IF NOT EXISTS league_invites (
  code        TEXT        PRIMARY KEY,
  league_id   INTEGER     NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  created_by  INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS league_invites_league_id_idx ON league_invites(league_id);

-- Each league's point values. scoring_rules keeps the descriptions and the defaults
-- new leagues start with; a rule missing here falls back to that default.
CREATE TABLE IF NOT EXISTS league_scoring_rules (
  league_id  INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  rule_key   TEXT    NOT NULL REFERENCES scoring_rules(rule_key) ON DELETE CASCADE,
  points     INTEGER NOT NULL,
  PRIMARY KEY (league_id, rule_key)
);

-- Per-league race settings. Only the joker round for now; race_config.is_joker is no
-- longer read.
CREATE TABLE IF NOT EXISTS league_race_settings (
  league_id   INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season      INTEGER NOT NULL,
  race_round  INTEGER NOT NULL,
  is_joker    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (league_id, season, race_round)
);

-- ── Move the existing data into the Pulse league ─────────────────────────────

INSERT INTO leagues (id, name, created_by)
SELECT 1, 'Pulse', (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1)
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('leagues', 'id'), (SELECT MAX(id) FROM leagues));

INSERT INTO league_members (league_id, user_id, role, is_active, joined_at)
SELECT 1, id, CASE WHEN role = 'admin' THEN 'admin' ELSE 'member' END, is_active, COALESCE(created_at, NOW())
FROM users
ON CONFLICT DO NOTHING;

-- The old global admin becomes the site manager: runs race lock times, results,
-- imports and OpenF1 for every league. League admin rights come from league_members.
UPDATE users SET role = 'site_manager' WHERE role = 'admin';

INSERT INTO league_scoring_rules (league_id, rule_key, points)
SELECT 1, rule_key, points FROM scoring_rules
ON CONFLICT DO NOTHING;

INSERT INTO league_race_settings (league_id, season, race_round, is_joker)
SELECT 1, season, race_round, 1 FROM race_config WHERE is_joker = 1
ON CONFLICT DO NOTHING;

-- Scores are per league: the same tip can score differently under each league's rules.
ALTER TABLE race_scores ADD COLUMN IF NOT EXISTS league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE;
UPDATE race_scores SET league_id = 1 WHERE league_id IS NULL;
ALTER TABLE race_scores ALTER COLUMN league_id SET NOT NULL;
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'race_scores'::regclass AND contype = 'u' LOOP
    EXECUTE format('ALTER TABLE race_scores DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE race_scores ADD CONSTRAINT race_scores_league_user_round_key
  UNIQUE (league_id, user_id, race_round, season);

ALTER TABLE polls ADD COLUMN IF NOT EXISTS league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE;
UPDATE polls SET league_id = 1 WHERE league_id IS NULL;
ALTER TABLE polls ALTER COLUMN league_id SET NOT NULL;
