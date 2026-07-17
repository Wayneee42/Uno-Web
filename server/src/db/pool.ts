import { Pool } from 'pg';
import { logger, normalizeError } from '../utils/logger.js';

export function createPostgresPool(databaseUrl = process.env.DATABASE_URL): Pool | null {
  if (!databaseUrl?.trim()) {
    return null;
  }

  const parsedMax = Number(process.env.DB_POOL_MAX ?? 5);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: Number.isFinite(parsedMax) ? Math.max(1, Math.min(20, parsedMax)) : 5,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
    idleTimeoutMillis: 30_000,
  });

  pool.on('error', error => {
    logger.error('database.pool_error', { error: normalizeError(error) });
  });

  return pool;
}
