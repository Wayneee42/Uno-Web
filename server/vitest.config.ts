import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@uno-web/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  test: {
    environment: 'node',
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
