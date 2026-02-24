import { configureNetworkBootstrap } from './core/network-bootstrap.ts';
import { createApp } from './server/app.ts';
import { getDatabase } from './db/index.ts';

// Bun still needs no-proxy transport by default on macOS CFNetwork setups.
configureNetworkBootstrap({ defaultForceNoProxy: true });

const PORT = Number(process.env.PORT) || 3000;

getDatabase();

const { app, registry, manager } = createApp();

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await manager.stopAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await manager.stopAll();
  process.exit(0);
});

console.log(`
  ┌─────────────────────────────────────────┐
  │       Mantle AaaS Gateway v0.1.0        │
  ├─────────────────────────────────────────┤
  │  API Server:  http://localhost:${PORT}      │
  │  Skills:      ${String(registry.size).padEnd(25)}│
  │  Database:    data/gateway.db           │
  └─────────────────────────────────────────┘
`);

export default {
  port: PORT,
  fetch: app.fetch,
};
