// db/migrate.js
// =============================================================
// HEALIX Database Migration Runner
// Runs schema.sql → triggers.sql → procedures.sql in order.
// Tracks which files have been run in a migrations table.
// Usage: node db/migrate.js
//        node db/migrate.js --reset   (drops + recreates schema)
// =============================================================
import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const RESET = args.includes('--reset');

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'HEALIX DATABASE',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '321654',
});

// Migration files in order
const MIGRATION_FILES = [
  { name: '001_schema', file: path.join(__dirname, '../../Sql/healix_schema.sql') },
  { name: '002_triggers', file: path.join(__dirname, '../../Sql/healix_triggers.sql') },
  { name: '003_procedures', file: path.join(__dirname, '../../Sql/healix_procedures.sql') },
];

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.healix_migrations (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(255) NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function hasBeenRun(client, name) {
  const { rows } = await client.query(
    'SELECT id FROM public.healix_migrations WHERE name=$1', [name]
  );
  return rows.length > 0;
}

async function markRun(client, name) {
  await client.query(
    'INSERT INTO public.healix_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
    [name]
  );
}

async function runReset(client) {
  console.log('⚠️  RESET mode: dropping healix schema...');
  await client.query('DROP SCHEMA IF EXISTS healix CASCADE');
  await client.query('DELETE FROM public.healix_migrations WHERE name LIKE \'00%\'');
  console.log('✅ Schema dropped');
}

async function main() {
  const client = await pool.connect();

  try {
    console.log('\n🏥 HEALIX Migration Runner\n');
    await ensureMigrationsTable(client);

    if (RESET) await runReset(client);

    for (const migration of MIGRATION_FILES) {
      const already = await hasBeenRun(client, migration.name);
      if (already && !RESET) {
        console.log(`  ⏭  ${migration.name} — already applied`);
        continue;
      }

      if (!fs.existsSync(migration.file)) {
        console.warn(`  ⚠️  ${migration.name} — file not found: ${migration.file}`);
        continue;
      }

      const sql = fs.readFileSync(migration.file, 'utf8');
      console.log(`  ▶  Running ${migration.name}...`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await markRun(client, migration.name);
        await client.query('COMMIT');
        console.log(`  ✅ ${migration.name} — complete`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ❌ ${migration.name} failed: ${err.message}`);
        throw err;
      }
    }

    console.log('\n✅ All migrations complete\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
