import { Hono } from 'hono';
import type { AgentManager } from '../../core/agent-manager.ts';
import * as repo from '../../db/repository.ts';

export function createChatRoutes(manager: AgentManager) {
  const app = new Hono();

  app.post('/agents/:id/chat', async (c) => {
    const id = c.req.param('id');
    const record = repo.getAgent(id);

    if (!record) return c.json({ error: 'Agent not found' }, 404);
    if (!manager.isRunning(id)) {
      return c.json({ error: 'Agent is not running. Start it first.' }, 409);
    }

    const body = await c.req.json();
    const { message, userId } = body;

    if (!message) {
      return c.json({ error: 'message is required' }, 400);
    }

    try {
      const text = await manager.chat(id, message, userId);
      return c.json({
        response: { text, actions: [] },
      });
    } catch (err: any) {
      return c.json({ error: err.message || 'Chat failed' }, 500);
    }
  });

  return app;
}
