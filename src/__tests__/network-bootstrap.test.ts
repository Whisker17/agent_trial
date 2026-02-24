import { afterEach, describe, expect, it } from 'bun:test';
import { configureNetworkBootstrap } from '../core/network-bootstrap';
import { noProxyFetch } from '../core/no-proxy-fetch';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe('network bootstrap', () => {
  it('uses local profile to keep proxy env and configure env proxy mode', () => {
    process.env = {
      ...originalEnv,
      NETWORK_PROFILE: 'local',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      HTTP_PROXY: 'http://127.0.0.1:7890',
      NO_PROXY: '*',
      no_proxy: '*',
    };
    delete process.env.FORCE_NO_PROXY_BYPASS;
    delete process.env.NODE_USE_ENV_PROXY;

    const mode = configureNetworkBootstrap();

    expect(mode).toBe('proxy');
    expect(process.env.HTTPS_PROXY).toBe('http://127.0.0.1:7890');
    expect(process.env.HTTP_PROXY).toBe('http://127.0.0.1:7890');
    expect(process.env.NODE_USE_ENV_PROXY).toBe('1');
    expect(process.env.NO_PROXY).toBeUndefined();
    expect(process.env.no_proxy).toBeUndefined();
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('uses vps profile to force direct network and clear proxy env', () => {
    process.env = {
      ...originalEnv,
      NETWORK_PROFILE: 'vps',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      http_proxy: 'http://127.0.0.1:7890',
      NO_PROXY: '*',
      no_proxy: '*',
      NODE_USE_ENV_PROXY: '1',
    };
    delete process.env.FORCE_NO_PROXY_BYPASS;

    const mode = configureNetworkBootstrap();

    expect(mode).toBe('direct');
    expect(process.env.HTTPS_PROXY).toBeUndefined();
    expect(process.env.http_proxy).toBeUndefined();
    expect(process.env.NODE_USE_ENV_PROXY).toBeUndefined();
    expect(process.env.NO_PROXY).toBeUndefined();
    expect(process.env.no_proxy).toBeUndefined();
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('keeps proxy env by default and enables node env proxy mode', () => {
    process.env = {
      ...originalEnv,
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      http_proxy: 'http://127.0.0.1:7890',
    };
    delete process.env.NETWORK_PROFILE;
    delete process.env.FORCE_NO_PROXY_BYPASS;
    delete process.env.NODE_USE_ENV_PROXY;

    const mode = configureNetworkBootstrap();

    expect(mode).toBe('proxy');
    expect(process.env.HTTPS_PROXY).toBe('http://127.0.0.1:7890');
    expect(process.env.http_proxy).toBe('http://127.0.0.1:7890');
    expect(process.env.NODE_USE_ENV_PROXY).toBe('1');
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('forces no-proxy mode when FORCE_NO_PROXY_BYPASS is true', () => {
    process.env = {
      ...originalEnv,
      FORCE_NO_PROXY_BYPASS: 'true',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      http_proxy: 'http://127.0.0.1:7890',
    };
    delete process.env.NETWORK_PROFILE;

    const mode = configureNetworkBootstrap();

    expect(mode).toBe('no-proxy');
    expect(process.env.HTTPS_PROXY).toBeUndefined();
    expect(process.env.http_proxy).toBeUndefined();
    expect(process.env.NO_PROXY).toBe('*');
    expect(process.env.no_proxy).toBe('*');
    expect(globalThis.fetch).toBe(noProxyFetch);
  });
});
