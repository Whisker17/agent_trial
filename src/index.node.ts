import { serve } from '@hono/node-server';
import { noProxyFetch } from './core/no-proxy-fetch.ts';
import { createApp } from './server/app.ts';
import { getDatabase } from './db/index.ts';

// Force all outbound HTTP calls through our transport implementation.
globalThis.fetch = noProxyFetch;

process.env.NO_PROXY = '*';
process.env.no_proxy = '*';
for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
  delete process.env[k];
}

const PORT = Number(process.env.PORT) || 3000;

getDatabase();

const { app, registry, manager } = createApp();

const server = serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    console.log(`Started development server: http://${info.address}:${info.port}`);
  },
);

async function shutdown() {
  console.log('\nShutting down...');
  await manager.stopAll();
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`
  ┌─────────────────────────────────────────┐
  │       Mantle AaaS Gateway v0.1.0        │
  ├─────────────────────────────────────────┤
  │  API Server:  http://localhost:${PORT}      │
  │  Skills:      ${String(registry.size).padEnd(25)}│
  │  Database:    data/gateway.db           │
  └─────────────────────────────────────────┘
`);
