import { readdir, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import type { Pool } from 'pg';

const MIGRATION_LOCK_ID = '8247632190147';
const migrationsDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));

export async function runMigrations(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  const appliedFiles: string[] = [];
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock($1::bigint)', [MIGRATION_LOCK_ID]);
    lockAcquired = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationFiles = (await readdir(migrationsDirectory))
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [file]
      );
      if (applied.rowCount) continue;

      const sql = await readFile(`${migrationsDirectory}/${file}`, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        appliedFiles.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return appliedFiles;
  } finally {
    try {
      if (lockAcquired) {
        await client.query('SELECT pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_ID]);
      }
    } finally {
      client.release();
    }
  }
}
