import { describe, expect, it } from 'vitest';
import { resolveServerUrl } from './serverUrl';

describe('resolveServerUrl', () => {
  it('uses an explicit server URL when provided', () => {
    expect(resolveServerUrl('https://uno-server.onrender.com/')).toBe('https://uno-server.onrender.com');
  });

  it('keeps auto mode for localhost development', () => {
    expect(resolveServerUrl('auto', { protocol: 'http:', hostname: 'localhost' })).toBe('http://localhost:3001');
  });

  it('keeps auto mode for LAN development', () => {
    expect(resolveServerUrl(undefined, { protocol: 'http:', hostname: '192.168.1.8' })).toBe('http://192.168.1.8:3001');
  });

  it('requires an explicit URL for public deployments', () => {
    expect(() =>
      resolveServerUrl(undefined, { protocol: 'https:', hostname: 'uno-web.vercel.app' })
    ).toThrow('VITE_SERVER_URL must be set for public deployments.');
  });
});
