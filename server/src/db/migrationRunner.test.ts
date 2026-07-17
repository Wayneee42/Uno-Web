import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { runMigrations } from './migrationRunner.js';

function createPool(failMigration = false) {
  const statements: string[] = [];
  const release = vi.fn();
  const query = vi.fn(async (statement: string) => {
    statements.push(statement);
    if (failMigration && statement.includes('CREATE TABLE IF NOT EXISTS profiles')) {
      throw new Error('migration failed');
    }
    if (statement.includes('SELECT 1 FROM schema_migrations')) {
      return { rowCount: 0, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  });
  const client = { query, release } as unknown as PoolClient;
  const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
  return { pool, query, release, statements };
}

describe('runMigrations', () => {
  it('serializes and commits unapplied migration files', async () => {
    const { pool, release, statements } = createPool();

    const applied = await runMigrations(pool);

    expect(applied).toContain('001_match_history.sql');
    expect(statements[0]).toContain('pg_advisory_lock');
    expect(statements).toContain('BEGIN');
    expect(statements).toContain('COMMIT');
    expect(statements.at(-1)).toContain('pg_advisory_unlock');
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the connection when a migration fails', async () => {
    const { pool, release, statements } = createPool(true);

    await expect(runMigrations(pool)).rejects.toThrow('migration failed');

    expect(statements).toContain('ROLLBACK');
    expect(statements.at(-1)).toContain('pg_advisory_unlock');
    expect(release).toHaveBeenCalledOnce();
  });
});
