import { describe, expect, it } from 'bun:test';
import { getApiProxyTarget } from '../../vite.config';

describe('Vite API proxy target', () => {
  it('uses localhost target by default', () => {
    expect(getApiProxyTarget({} as NodeJS.ProcessEnv)).toBe('http://localhost:3000');
  });

  it('uses explicit VITE_API_PROXY_TARGET when provided', () => {
    expect(
      getApiProxyTarget({
        VITE_API_PROXY_TARGET: 'http://backend:3000',
      } as NodeJS.ProcessEnv),
    ).toBe('http://backend:3000');
  });

  it('falls back to localhost when override is blank', () => {
    expect(
      getApiProxyTarget({
        VITE_API_PROXY_TARGET: '   ',
      } as NodeJS.ProcessEnv),
    ).toBe('http://localhost:3000');
  });
});
