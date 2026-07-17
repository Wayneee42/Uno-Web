import '../config/env.js';
import { createPostgresPool } from './pool.js';
import { runMigrations } from './migrationRunner.js';

const pool = createPostgresPool();
if (!pool) {
  throw new Error('DATABASE_URL is required to run database migrations');
}

try {
  const appliedFiles = await runMigrations(pool);
  if (appliedFiles.length === 0) console.log('Database schema is up to date');
  for (const file of appliedFiles) console.log(`Applied migration ${file}`);
} finally {
  await pool.end();
}
