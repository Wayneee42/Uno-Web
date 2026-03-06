import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@uno-web/shared';
import { attachErrorMiddleware, createApp } from './server';

describe('server http error handling', () => {
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
