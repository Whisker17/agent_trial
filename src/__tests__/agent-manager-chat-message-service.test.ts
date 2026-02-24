import { describe, expect, it, mock } from 'bun:test';
import { AgentManager } from '../core/agent-manager.ts';

const SESSION_ID = '8e620272-0e86-4cbc-ab1e-57a99689a80c';

function createManagerWithRuntime(runtime: unknown): AgentManager {
  const manager = Object.create(AgentManager.prototype) as AgentManager;
  (manager as any).running = new Map([
    ['agent-1', { runtime, startedAt: new Date() }],
  ]);
  return manager;
}

describe('agent manager chat message pipeline', () => {
  it('uses messageService.handleMessage and returns callback text', async () => {
    const generateText = mock(async () => ({ text: 'raw tool invocation output' }));
    const ensureConnection = mock(async () => {});
    const handleMessage = mock(async (_runtime, _message, callback) => {
      if (callback) {
        await callback({
          text: '{"name":"__unlock_blockchain_analysis__","arguments":"{}"}',
        });
        await callback({ text: 'Wallet balance is 1.25 MNT on Mantle Sepolia.' });
      }

      return {
        didRespond: true,
        responseContent: { text: 'intermediate tool planning text' },
        responseMessages: [],
        state: { values: {}, data: {}, text: '' },
        mode: 'actions',
      };
    });

    const runtime = {
      agentId: 'agent-1',
      messageService: { handleMessage },
      ensureConnection,
      generateText,
    };
    const manager = createManagerWithRuntime(runtime);

    const result = await manager.chat(
      'agent-1',
      'check my wallet balance',
      'alice',
      SESSION_ID,
    );

    expect(result).toBe('Wallet balance is 1.25 MNT on Mantle Sepolia.');
    expect(generateText).not.toHaveBeenCalled();
    expect(ensureConnection).toHaveBeenCalledTimes(1);
    expect(ensureConnection.mock.calls[0]?.[0]).toMatchObject({
      roomId: SESSION_ID,
      worldId: SESSION_ID,
      source: 'client_chat',
    });

    expect(handleMessage).toHaveBeenCalledTimes(1);
    expect(handleMessage.mock.calls[0]?.[1]).toMatchObject({
      roomId: SESSION_ID,
      content: {
        source: 'client_chat',
        text: 'check my wallet balance',
      },
    });
  });

  it('falls back to responseContent text when callback text is unavailable', async () => {
    const handleMessage = mock(async () => ({
      didRespond: true,
      responseContent: { text: 'Final answer from response content' },
      responseMessages: [],
      state: { values: {}, data: {}, text: '' },
      mode: 'simple',
    }));

    const runtime = {
      agentId: 'agent-1',
      messageService: { handleMessage },
      ensureConnection: mock(async () => {}),
      generateText: mock(async () => ({ text: 'raw tool invocation output' })),
    };
    const manager = createManagerWithRuntime(runtime);

    const result = await manager.chat('agent-1', 'hello', undefined, SESSION_ID);
    expect(result).toBe('Final answer from response content');
  });

  it('uses responseMessages text before intermediate responseContent text', async () => {
    const handleMessage = mock(async () => ({
      didRespond: true,
      responseContent: { text: 'intermediate tool planning text' },
      responseMessages: [
        {
          entityId: SESSION_ID,
          roomId: SESSION_ID,
          content: { text: 'Final answer from response messages' },
        },
      ],
      state: { values: {}, data: {}, text: '' },
      mode: 'actions',
    }));

    const runtime = {
      agentId: 'agent-1',
      messageService: { handleMessage },
      ensureConnection: mock(async () => {}),
      generateText: mock(async () => ({ text: 'raw tool invocation output' })),
    };
    const manager = createManagerWithRuntime(runtime);

    const result = await manager.chat('agent-1', 'hello', undefined, SESSION_ID);
    expect(result).toBe('Final answer from response messages');
  });
});
