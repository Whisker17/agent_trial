import { createRequire } from 'node:module';
import { noProxyFetch } from './no-proxy-fetch.ts';

const PROXY_ENV_KEYS = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'ALL_PROXY',
  'all_proxy',
] as const;

const NO_PROXY_ENV_KEYS = ['NO_PROXY', 'no_proxy'] as const;

export type NetworkBootstrapMode = 'proxy' | 'direct' | 'no-proxy';
export type NetworkProfile = 'local' | 'vps';

type ConfigureNetworkBootstrapOptions = {
  defaultForceNoProxy?: boolean;
  defaultProfile?: NetworkProfile;
};

function parseBooleanFlag(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function resolveProxyUrl(env: NodeJS.ProcessEnv): string | undefined {
  for (const key of PROXY_ENV_KEYS) {
    const value = env[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function clearProxyEnv(env: NodeJS.ProcessEnv): void {
  for (const key of PROXY_ENV_KEYS) {
    delete env[key];
  }
}

function clearNoProxyEnv(env: NodeJS.ProcessEnv): void {
  for (const key of NO_PROXY_ENV_KEYS) {
    delete env[key];
  }
}

function parseNetworkProfile(value: string | undefined): NetworkProfile | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['local', 'local-cn', 'cn', 'proxy'].includes(normalized)) return 'local';
  if (['vps', 'vps-us', 'us', 'direct'].includes(normalized)) return 'vps';
  return undefined;
}

function configureUndiciProxyForRequire(requireImpl: NodeJS.Require): void {
  try {
    const undici = requireImpl('undici') as {
      EnvHttpProxyAgent?: new () => unknown;
      setGlobalDispatcher?: (dispatcher: unknown) => void;
    };
    if (!undici.EnvHttpProxyAgent || !undici.setGlobalDispatcher) {
      return;
    }
    undici.setGlobalDispatcher(new undici.EnvHttpProxyAgent());
  } catch {
    // Ignore unsupported/missing undici copies.
  }
}

function configureUndiciProxyFromEnv(): void {
  const rootRequire = createRequire(import.meta.url);
  configureUndiciProxyForRequire(rootRequire);

  // discord.js resolves its own nested undici@6; configure that copy too.
  try {
    const discordEntry = rootRequire.resolve('discord.js');
    const discordRequire = createRequire(discordEntry);
    configureUndiciProxyForRequire(discordRequire);
  } catch {
    // Discord may not be installed/enabled in all setups.
  }
}

export function configureNetworkBootstrap(
  options: ConfigureNetworkBootstrapOptions = {},
): NetworkBootstrapMode {
  const forceNoProxyFromEnv = parseBooleanFlag(process.env.FORCE_NO_PROXY_BYPASS);
  const forceNoProxy = forceNoProxyFromEnv ?? options.defaultForceNoProxy ?? false;

  if (forceNoProxy) {
    globalThis.fetch = noProxyFetch;
    process.env.NO_PROXY = '*';
    process.env.no_proxy = '*';
    clearProxyEnv(process.env);
    return 'no-proxy';
  }

  const profile = parseNetworkProfile(process.env.NETWORK_PROFILE) ?? options.defaultProfile;
  if (profile === 'vps') {
    clearProxyEnv(process.env);
    delete process.env.NODE_USE_ENV_PROXY;
    clearNoProxyEnv(process.env);
    return 'direct';
  }

  const proxyUrl = resolveProxyUrl(process.env);
  if (proxyUrl || profile === 'local') {
    process.env.NODE_USE_ENV_PROXY = process.env.NODE_USE_ENV_PROXY || '1';
    for (const key of NO_PROXY_ENV_KEYS) {
      if (process.env[key] === '*') delete process.env[key];
    }
    configureUndiciProxyFromEnv();
  }

  return 'proxy';
}
