-- Which session a race's tips lock at: 'sprint', 'qualifying' or 'race'. NULL means the
-- default (start of the race weekend). Stored as a session rather than a time so it
-- follows OpenF1 schedule changes. A custom lock_time takes precedence over it.
ALTER TABLE race_config ADD COLUMN IF NOT EXISTS lock_at TEXT;
