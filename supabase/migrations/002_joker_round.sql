-- Joker round: every score for that round counts double (at most one per season).
ALTER TABLE race_config ADD COLUMN IF NOT EXISTS is_joker INTEGER NOT NULL DEFAULT 0;
