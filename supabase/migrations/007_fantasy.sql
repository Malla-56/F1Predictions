-- Fantasy: an optional side game a league can switch on. Each round a member picks one
-- driver and one team; the weekend's fantasy score ranks them within the league, and the
-- rank adds a few points to that league's scoreboard.
--
-- Picks are shared like tips (one per person per round, counted in every league that has
-- fantasy on). Scores are per league, because the ranking is.

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS fantasy_enabled INTEGER NOT NULL DEFAULT 0;

-- team is OpenF1's team_name (teams have no id of their own here).
-- powerup: NULL, 'boost' or 'net'. carried = 1 when the pick was copied forward from an
-- earlier round because the person didn't choose one.
CREATE TABLE IF NOT EXISTS fantasy_picks (
  user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  race_round  INTEGER     NOT NULL,
  season      INTEGER     NOT NULL DEFAULT 2026,
  driver      TEXT        NOT NULL,
  team        TEXT        NOT NULL,
  powerup     TEXT        CHECK (powerup IN ('boost', 'net')),
  carried     INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, race_round, season)
);

-- What fantasy scoring needs beyond the stored result: starting grid, fastest lap,
-- fastest pit stop, which team each driver drove for, and overtake counts.
CREATE TABLE IF NOT EXISTS fantasy_race_stats (
  race_round  INTEGER     NOT NULL,
  season      INTEGER     NOT NULL DEFAULT 2026,
  stats_json  TEXT        NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (race_round, season)
);

-- score is the weekend fantasy score; rank is the place within the league that weekend;
-- bonus_points is what that rank adds to the league scoreboard.
CREATE TABLE IF NOT EXISTS fantasy_scores (
  league_id     INTEGER     NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id       INTEGER     NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  race_round    INTEGER     NOT NULL,
  season        INTEGER     NOT NULL DEFAULT 2026,
  score         INTEGER     NOT NULL,
  rank          INTEGER     NOT NULL,
  bonus_points  INTEGER     NOT NULL DEFAULT 0,
  breakdown     TEXT        NOT NULL DEFAULT '{}',
  scored_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (league_id, user_id, race_round, season)
);
