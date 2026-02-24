import { Hono } from 'hono';
import type { AgentManager } from '../../core/agent-manager.ts';
import * as repo from '../../db/repository.ts';

export function createChatRoutes(manager: AgentManager) {
  const app = new Hono();

  app.get('/agents/:id/chat', async (c) => {
    const id = c.req.param('id');
    const record = repo.getAgent(id);
    if (!record) return c.json({ error: 'Agent not found' }, 404);

    const messages = repo.listChatMessages(id).map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      timestamp: message.timestamp,
      actions: message.actions,
      error: message.error,
    }));

    return c.json({ messages });
  });

  app.post('/agents/:id/chat', async (c) => {
    const id = c.req.param('id');
    const record = repo.getAgent(id);

    if (!record) return c.json({ error: 'Agent not found' }, 404);
    if (!manager.isRunning(id)) {
      return c.json({ error: 'Agent is not running. Start it first.' }, 409);
    }

    const body = await c.req.json();
    const { message, userId } = body;

    if (typeof message !== 'string' || message.trim().length === 0) {
      return c.json({ error: 'message is required' }, 400);
    }

    const normalizedMessage = message.trim();

    try {
      repo.createChatMessage({
        agentId: id,
        role: 'user',
        text: normalizedMessage,
      });

      const text = await manager.chat(id, normalizedMessage, userId);
      repo.createChatMessage({
        agentId: id,
        role: 'agent',
        text,
        actions: [],
      });

      return c.json({
        response: { text, actions: [] },
      });
    } catch (err: any) {
      const errorMessage = err?.message || 'Chat failed';
      repo.createChatMessage({
        agentId: id,
        role: 'agent',
        text: `Error: ${errorMessage}`,
        error: true,
      });
      return c.json({ error: err.message || 'Chat failed' }, 500);
    }
  });

  return app;
}
