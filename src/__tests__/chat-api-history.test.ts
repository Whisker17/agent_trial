import { afterEach, describe, expect, it, mock } from 'bun:test';
import { fetchChatHistory, setAuthTokenGetter } from '../frontend/api';

const originalFetch = globalThis.fetch;

describe('chat history api', () => {
  afterEach(() => {
    setAuthTokenGetter(async () => null);
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  it('loads chat history from the agent chat endpoint', async () => {
    const fetchMock = mock(async () =>
      new Response(
        JSON.stringify({
          messages: [
            {
              id: 'm-1',
              role: 'user',
              text: 'hello',
              timestamp: 1710000000000,
              actions: [],
              error: false,
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    setAuthTokenGetter(async () => 'token-123');
    globalThis.fetch = fetchMock as typeof fetch;

    const messages = await fetchChatHistory('agent-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/agents/agent-1/chat');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.method).toBe('GET');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers).toEqual({
      Authorization: 'Bearer token-123',
    });
    expect(messages).toEqual([
      {
        id: 'm-1',
        role: 'user',
        text: 'hello',
        timestamp: 1710000000000,
        actions: [],
        error: false,
      },
    ]);
  });
});
