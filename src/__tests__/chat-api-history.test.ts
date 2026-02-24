import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  createChatSession,
  deleteChatSession,
  fetchChatHistory,
  fetchChatSessions,
  setAuthTokenGetter,
} from "../frontend/api";

const originalFetch = globalThis.fetch;

describe("chat history api", () => {
  afterEach(() => {
    setAuthTokenGetter(async () => null);
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  it("loads session list from the sessions endpoint", async () => {
    const fetchMock = mock(
      async () =>
        new Response(
          JSON.stringify({
            sessions: [
              {
                id: "s-1",
                title: "First chat",
                lastMessageAt: 1710000000000,
                createdAt: "2025-01-01T00:00:00.000Z",
                updatedAt: "2025-01-01T00:00:00.000Z",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );

    setAuthTokenGetter(async () => "token-123");
    globalThis.fetch = fetchMock as typeof fetch;

    const sessions = await fetchChatSessions("agent-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/agents/agent-1/chat/sessions",
    );
    expect(
      (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.method,
    ).toBe("GET");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe("s-1");
  });

  it("creates a new chat session", async () => {
    const fetchMock = mock(
      async () =>
        new Response(
          JSON.stringify({
            session: {
              id: "s-2",
              title: "New chat",
              lastMessageAt: 1710000000500,
              createdAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
            },
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );

    setAuthTokenGetter(async () => "token-123");
    globalThis.fetch = fetchMock as typeof fetch;

    const session = await createChatSession("agent-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/agents/agent-1/chat/sessions",
    );
    expect(
      (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.method,
    ).toBe("POST");
    expect(session.id).toBe("s-2");
  });

  it("loads chat history from the agent chat endpoint", async () => {
    const fetchMock = mock(
      async () =>
        new Response(
          JSON.stringify({
            session: {
              id: "s-1",
              title: "First chat",
              lastMessageAt: 1710000000000,
              createdAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
            },
            messages: [
              {
                id: "m-1",
                sessionId: "s-1",
                role: "user",
                text: "hello",
                timestamp: 1710000000000,
                actions: [],
                error: false,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );

    setAuthTokenGetter(async () => "token-123");
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await fetchChatHistory("agent-1", "s-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/agents/agent-1/chat?sessionId=s-1",
    );
    expect(
      (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.method,
    ).toBe("GET");
    expect(
      (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers,
    ).toEqual({
      Authorization: "Bearer token-123",
    });
    expect(result.session?.id).toBe("s-1");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.sessionId).toBe("s-1");
  });

  it("deletes a chat session", async () => {
    const fetchMock = mock(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );

    setAuthTokenGetter(async () => "token-123");
    globalThis.fetch = fetchMock as typeof fetch;

    await deleteChatSession("agent-1", "s-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/agents/agent-1/chat/sessions/s-1",
    );
    expect(
      (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.method,
    ).toBe("DELETE");
    expect(
      (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers,
    ).toEqual({
      Authorization: "Bearer token-123",
    });
  });
});
