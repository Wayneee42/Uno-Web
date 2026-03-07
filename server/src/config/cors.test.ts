import { describe, expect, it } from 'vitest';
import { resolveSocketCorsOrigin } from './cors.js';

describe('resolveSocketCorsOrigin', () => {
  it('falls back to localhost when origin is missing', () => {
    expect(resolveSocketCorsOrigin()).toBe('http://localhost:3000');
  });

  it('supports wildcard origin', () => {
    expect(resolveSocketCorsOrigin('*')).toBe(true);
  });

  it('normalizes a single origin', () => {
    expect(resolveSocketCorsOrigin('https://uno-web.vercel.app/')).toBe('https://uno-web.vercel.app');
  });

  it('splits and deduplicates multiple origins', () => {
    expect(resolveSocketCorsOrigin('https://uno-web.vercel.app/, https://uno-web.vercel.app, https://uno.example.com/')).toEqual([
      'https://uno-web.vercel.app',
      'https://uno.example.com',
    ]);
  });
});

