-- Last good response for each cached OpenF1 lookup (calendar, sessions, drivers, standings).
-- OpenF1 locks its free API during live F1 sessions, and the in-memory cache is empty on
-- every fresh serverless instance, so this is served when OpenF1 can't be reached.
CREATE TABLE IF NOT EXISTS openf1_cache (
  key        TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
