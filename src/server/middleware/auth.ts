import type { Context, Next } from 'hono';
import { PrivyClient } from '@privy-io/node';

let privyClient: PrivyClient | null = null;
let privyConfigured = false;
let warnedOnce = false;

function allowUnverifiedTokenFallback(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.PRIVY_ALLOW_UNVERIFIED_TOKENS !== 'false';
}

function initPrivy(): boolean {
  if (privyClient) return true;
  const appId = (process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || '').trim();
  const appSecret = (process.env.PRIVY_APP_SECRET || '').trim();
  if (appId && appSecret) {
    privyClient = new PrivyClient({ appId, appSecret });
    privyConfigured = true;
    return true;
  }
  if (!warnedOnce) {
    console.warn(
      '[auth] PRIVY_APP_SECRET not set — JWT signature verification disabled. Set PRIVY_APP_ID and PRIVY_APP_SECRET for production.',
    );
    warnedOnce = true;
  }
  return false;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const devUserId = process.env.DEV_USER_ID;
  if (devUserId) {
    c.set('userId', devUserId);
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);

  if (initPrivy() && privyClient) {
    try {
      const verifiedClaims = await privyClient.utils().auth().verifyAccessToken(token);
      c.set('userId', verifiedClaims.user_id);
      return next();
    } catch (err) {
      const payload = decodeJwtPayload(token);
      const payloadUserId = payload?.sub;
      const payloadAud = payload?.aud;
      const payloadIss = payload?.iss;
      const configuredAppId = process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || '';
      console.error('[auth] Privy token verification failed:', {
        error: err instanceof Error ? err.message : String(err),
        iss: payloadIss,
        aud: payloadAud,
        configuredAppId,
      });

      // Dev-only fallback to keep local flows unblocked when SDK verification
      // fails due transient network/JWKS issues. Disabled in production.
      if (allowUnverifiedTokenFallback() && typeof payloadUserId === 'string') {
        console.warn(
          '[auth] Falling back to unverified Privy JWT payload in development. Set PRIVY_ALLOW_UNVERIFIED_TOKENS=false to disable.',
        );
        c.set('userId', payloadUserId);
        return next();
      }

      return c.json({ error: 'Invalid or expired token' }, 401);
    }
  }

  const payload = decodeJwtPayload(token);
  const userId = payload?.sub as string | undefined;
  if (!userId) {
    return c.json({ error: 'Invalid token' }, 401);
  }
  c.set('userId', userId);
  return next();
}
