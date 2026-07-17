import { createPostgresPool } from '../db/pool.js';
import { HistoryService } from './HistoryService.js';
import { PostgresHistoryRepository } from './PostgresHistoryRepository.js';

const pool = createPostgresPool();

export const historyService = new HistoryService(
  pool ? new PostgresHistoryRepository(pool) : null
);
