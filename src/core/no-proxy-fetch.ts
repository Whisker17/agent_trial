/**
 * Fetch implementation using node:https that bypasses Bun's macOS CFNetwork
 * system proxy detection. Bun's native fetch auto-detects system proxy via
 * CFNetwork, causing UnsupportedProxyProtocol errors when a proxy is configured
 * at the OS level. node:https does not go through CFNetwork.
 */
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

export const noProxyFetch: typeof fetch = async (input, init) => {
  const isRequest = typeof input === 'object' && 'url' in input;
  const reqObj = isRequest ? (input as Request) : null;

  const url = typeof input === 'string' ? input : reqObj!.url;
  const parsed = new URL(url);
  const reqFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest;

  const method = init?.method || reqObj?.method || 'GET';

  const headers: Record<string, string> = {};
  const srcHeaders = init?.headers ?? reqObj?.headers;
  if (srcHeaders) {
    new Headers(srcHeaders as HeadersInit).forEach((v, k) => {
      headers[k] = v;
    });
  }

  let body: string | Buffer | undefined;
  const rawBody = init?.body ?? reqObj?.body;
  if (typeof rawBody === 'string') {
    body = rawBody;
  } else if (Buffer.isBuffer(rawBody)) {
    body = rawBody;
  } else if (rawBody instanceof ArrayBuffer) {
    body = Buffer.from(rawBody);
  } else if (rawBody instanceof Uint8Array) {
    body = Buffer.from(rawBody);
  }

  return new Promise<Response>((resolve, reject) => {
    const req = reqFn(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          const responseHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') responseHeaders[k] = v;
          }
          resolve(
            new Response(text, {
              status: res.statusCode ?? 200,
              statusText: res.statusMessage,
              headers: responseHeaders,
            }),
          );
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
};
