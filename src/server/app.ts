import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/bun';
import { existsSync } from 'node:fs';
import { SkillRegistry } from '../core/skill-registry.ts';
import { AgentManager } from '../core/agent-manager.ts';
import { createSkillRoutes } from './routes/skills.ts';
import { createAgentRoutes } from './routes/agents.ts';
import { createChatRoutes } from './routes/chat.ts';

export function createApp() {
  const app = new Hono();
  const registry = new SkillRegistry();
  const manager = new AgentManager(registry);

  app.use('*', cors());
  app.use('*', logger());

  app.get('/api/health', (c) =>
    c.json({
      status: 'ok',
      skills: registry.size,
      runningAgents: manager.getRunningAgentIds().length,
      timestamp: new Date().toISOString(),
    }),
  );

  app.route('/api', createSkillRoutes(registry));
  app.route('/api', createAgentRoutes(manager));
  app.route('/api', createChatRoutes(manager));

  if (existsSync('dist/frontend')) {
    app.use('/*', serveStatic({ root: 'dist/frontend' }));
    app.get('*', serveStatic({ path: 'dist/frontend/index.html' }));
  }

  return { app, registry, manager };
}
