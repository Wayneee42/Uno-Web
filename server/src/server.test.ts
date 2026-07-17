import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@uno-web/shared';
import { attachErrorMiddleware, createApp } from './server.js';

describe('server http error handling', () => {
  it('reports liveness and history availability separately', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      history: expect.stringMatching(/^(available|degraded)$/),
    });
  });

  it('returns a normalized internal error response for thrown route errors', async () => {
    const app = createApp();

    app.get('/boom', () => {
      throw new Error('boom');
    });

    attachErrorMiddleware(app);

    const response = await request(app).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: 'Internal server error',
      code: ERROR_CODES.INTERNAL_ERROR,
    });
  });
});

