import { afterEach, describe, expect, it, mock } from 'bun:test';

async function loadCreateChatRoutes(repoMock: Record<string, unknown>) {
  mock.module('../db/repository.ts', () => repoMock);
  const module = await import(`../server/routes/chat.ts?seed=${Date.now()}-${Math.random()}`);
  return module.createChatRoutes;
}

describe('chat history routes', () => {
  afterEach(() => {
    mock.restore();
  });

  it('returns persisted chat history for an agent', async () => {
    const createChatRoutes = await loadCreateChatRoutes({
      getAgent: () => ({ id: 'agent-1' }),
      listChatMessages: () => [
        {
          id: 'u-1',
          role: 'user',
          text: 'hello',
          timestamp: 1710000000000,
          actions: [],
          error: false,
        },
        {
          id: 'a-1',
          role: 'agent',
          text: 'hi there',
          timestamp: 1710000001000,
          actions: ['wave'],
          error: false,
        },
      ],
      createChatMessage: mock(),
    });

    const manager = {
      isRunning: () => false,
      chat: mock(async () => 'unused'),
    };
    const app = createChatRoutes(manager as any);

    const res = await app.request('/agents/agent-1/chat');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { messages: Array<Record<string, unknown>> };
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toMatchObject({
      id: 'u-1',
      role: 'user',
      text: 'hello',
      timestamp: 1710000000000,
      actions: [],
      error: false,
    });
    expect(body.messages[1]).toMatchObject({
      id: 'a-1',
      role: 'agent',
      text: 'hi there',
      timestamp: 1710000001000,
      actions: ['wave'],
      error: false,
    });
  });

  it('stores both user and agent messages when chatting', async () => {
    const createChatMessage = mock();
    const createChatRoutes = await loadCreateChatRoutes({
      getAgent: () => ({ id: 'agent-1' }),
      listChatMessages: () => [],
      createChatMessage,
    });

    const manager = {
      isRunning: () => true,
      chat: mock(async () => 'pong'),
    };
    const app = createChatRoutes(manager as any);

    const res = await app.request('/agents/agent-1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ping' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { response: { text: string; actions: string[] } };
    expect(body.response).toEqual({ text: 'pong', actions: [] });

    expect(createChatMessage).toHaveBeenCalledTimes(2);
    expect(createChatMessage.mock.calls[0]?.[0]).toMatchObject({
      agentId: 'agent-1',
      role: 'user',
      text: 'ping',
    });
    expect(createChatMessage.mock.calls[1]?.[0]).toMatchObject({
      agentId: 'agent-1',
      role: 'agent',
      text: 'pong',
      actions: [],
    });
  });
});
