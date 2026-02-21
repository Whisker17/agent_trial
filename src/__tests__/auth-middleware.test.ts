import { afterEach, describe, expect, it } from 'bun:test';
import { authMiddleware } from '../server/middleware/auth.ts';

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function buildUnverifiableToken(sub: string): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({
      sub,
      iss: 'privy.io',
      aud: 'test-app-id',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  return `${header}.${payload}.invalidsig`;
}

function makeMockContext(token: string) {
  const values = new Map<string, unknown>();
  let jsonResponse: { body: unknown; status: number } | null = null;

  const ctx = {
    req: {
      header: (name: string) => (name === 'Authorization' ? `Bearer ${token}` : undefined),
    },
    set: (key: string, value: unknown) => {
      values.set(key, value);
    },
    get: (key: string) => values.get(key),
    json: (body: unknown, status: number) => {
      jsonResponse = { body, status };
      return jsonResponse;
    },
  };

  return {
    ctx,
    values,
    getResponse: () => jsonResponse,
  };
}

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DEV_USER_ID: process.env.DEV_USER_ID,
  PRIVY_APP_ID: process.env.PRIVY_APP_ID,
  PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
  PRIVY_ALLOW_UNVERIFIED_TOKENS: process.env.PRIVY_ALLOW_UNVERIFIED_TOKENS,
};

afterEach(() => {
  process.env.NODE_ENV = originalEnv.NODE_ENV;
  process.env.DEV_USER_ID = originalEnv.DEV_USER_ID;
  process.env.PRIVY_APP_ID = originalEnv.PRIVY_APP_ID;
  process.env.PRIVY_APP_SECRET = originalEnv.PRIVY_APP_SECRET;
  process.env.PRIVY_ALLOW_UNVERIFIED_TOKENS = originalEnv.PRIVY_ALLOW_UNVERIFIED_TOKENS;
});

describe('authMiddleware fallback behavior', () => {
  it('allows unverified Privy token in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEV_USER_ID = '';
    process.env.PRIVY_APP_ID = 'test-app-id';
    process.env.PRIVY_APP_SECRET = 'test-app-secret';
    process.env.PRIVY_ALLOW_UNVERIFIED_TOKENS = 'true';

    const token = buildUnverifiableToken('did:privy:test-user');
    const { ctx, values, getResponse } = makeMockContext(token);

    let nextCalled = false;
    await authMiddleware(
      ctx as any,
      async () => {
        nextCalled = true;
      },
    );

    expect(nextCalled).toBe(true);
    expect(values.get('userId')).toBe('did:privy:test-user');
    expect(getResponse()).toBeNull();
  });

  it('rejects unverified Privy token in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEV_USER_ID = '';
    process.env.PRIVY_APP_ID = 'test-app-id';
    process.env.PRIVY_APP_SECRET = 'test-app-secret';
    process.env.PRIVY_ALLOW_UNVERIFIED_TOKENS = 'true';

    const token = buildUnverifiableToken('did:privy:test-user');
    const { ctx, getResponse } = makeMockContext(token);

    let nextCalled = false;
    await authMiddleware(
      ctx as any,
      async () => {
        nextCalled = true;
      },
    );

    expect(nextCalled).toBe(false);
    expect(getResponse()?.status).toBe(401);
  });
});
