-- last_login_at: last password / Face ID sign-in.
-- last_seen_at: last time the app was used (sessions last 30 days, so logins are rare).
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ;
