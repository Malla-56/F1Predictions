const fs = require('fs');
const path = require('path');

// Applies supabase/migrations/NNN_*.sql in order, recording each in schema_migrations.
// Runs during every production Vercel build (vercel-build) and once per server
// instance at startup, so deploys never depend on running SQL by hand.
//
// Everything happens in one transaction under an advisory lock: concurrent runs wait
// for each other, and a failing migration rolls back cleanly. Uses a transaction-level
// lock so it also works through Supabase's transaction pooler.

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const LOCK_ID = 727274; // arbitrary, unique to this app

// Preview deployments share the production database, so they must not migrate it
// with code that hasn't been merged yet.
const skip = () => process.env.VERCEL_ENV === 'preview';

async function migrate() {
  if (skip()) return [];
  const pool = require('./db');
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => /^\d+_.+\.sql$/.test(f)).sort();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map(r => r.name));

    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      applied.push(file);
    }
    await client.query('COMMIT');
    return applied;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Memoised per process; a failure is retried on the next call.
let ready = null;
function ensureMigrated() {
  if (!ready) {
    ready = migrate()
      .then(applied => { if (applied.length) console.log(`[migrate] applied ${applied.join(', ')}`); })
      .catch(err => { ready = null; throw err; });
  }
  return ready;
}

module.exports = { migrate, ensureMigrated };

// CLI: `npm run migrate`, also run by vercel-build.
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  if (skip()) {
    console.log('[migrate] preview deployment — skipping');
    process.exit(0);
  }
  if (!process.env.DATABASE_URL) {
    // Not fatal: the server applies pending migrations itself when it starts.
    console.warn('[migrate] DATABASE_URL not set — skipping (the server will migrate on startup)');
    process.exit(0);
  }
  migrate()
    .then(applied => {
      console.log(applied.length ? `[migrate] applied ${applied.join(', ')}` : '[migrate] up to date');
      process.exit(0);
    })
    .catch(err => {
      console.error('[migrate] failed:', err.message);
      process.exit(1);
    });
}
