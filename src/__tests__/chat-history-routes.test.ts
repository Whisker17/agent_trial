import { afterEach, describe, expect, it, mock } from "bun:test";

async function loadCreateChatRoutes(repoMock: Record<string, unknown>) {
  mock.module("../db/repository.ts", () => repoMock);
  const module = await import(
    `../server/routes/chat.ts?seed=${Date.now()}-${Math.random()}`
  );
  return module.createChatRoutes;
}

describe("chat history routes", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns chat sessions for an agent", async () => {
    const createChatRoutes = await loadCreateChatRoutes({
      getAgent: () => ({ id: "agent-1" }),
      listChatSessions: () => [
        {
          id: "s-1",
          agentId: "agent-1",
          title: "First chat",
          lastMessageAt: 1710000001000,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      listChatMessages: () => [
        {
          id: "u-1",
          sessionId: "s-1",
          role: "user",
          text: "hello",
          timestamp: 1710000000000,
          actions: [],
          error: false,
        },
        {
          id: "a-1",
          role: "agent",
          text: "hi there",
          timestamp: 1710000001000,
          actions: ["wave"],
          error: false,
        },
      ],
      getChatSession: () => null,
      ensureChatSession: () => ({ id: "s-1", title: "First chat" }),
      updateChatSession: () => null,
      createChatMessage: mock(),
      createChatSession: mock(),
    });

    const manager = {
      isRunning: () => false,
      chat: mock(async () => "unused"),
    };
    const app = createChatRoutes(manager as any);

    const res = await app.request("/agents/agent-1/chat/sessions");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      sessions: Array<Record<string, unknown>>;
    };
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({
      id: "s-1",
      title: "First chat",
      lastMessageAt: 1710000001000,
    });
  });

  it("returns messages scoped to selected session", async () => {
    const createChatRoutes = await loadCreateChatRoutes({
      getAgent: () => ({ id: "agent-1" }),
      listChatSessions: () => [],
      getChatSession: () => ({
        id: "s-1",
        agentId: "agent-1",
        title: "Scoped chat",
        lastMessageAt: 1710000001000,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      }),
      listChatMessages: () => [
        {
          id: "u-1",
          sessionId: "s-1",
          role: "user",
          text: "hello",
          timestamp: 1710000000000,
          actions: [],
          error: false,
        },
      ],
      ensureChatSession: () => ({
        id: "s-1",
        agentId: "agent-1",
        title: "Scoped chat",
        lastMessageAt: 1710000001000,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      }),
      createChatMessage: mock(),
      updateChatSession: () => null,
      createChatSession: mock(),
    });

    const manager = {
      isRunning: () => false,
      chat: mock(async () => "unused"),
    };
    const app = createChatRoutes(manager as any);

    const res = await app.request("/agents/agent-1/chat?sessionId=s-1");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      session: { id: string };
      messages: Array<{ sessionId: string }>;
    };
    expect(body.session.id).toBe("s-1");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.sessionId).toBe("s-1");
  });

  it("creates a new session for an agent", async () => {
    const createChatSession = mock(() => ({
      id: "s-new",
      agentId: "agent-1",
      title: "New chat",
      lastMessageAt: 1710000002000,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    }));
    const createChatRoutes = await loadCreateChatRoutes({
      getAgent: () => ({ id: "agent-1" }),
      listChatSessions: () => [],
      createChatSession,
      getChatSession: () => null,
      listChatMessages: () => [],
      ensureChatSession: () => ({
        id: "s-new",
        agentId: "agent-1",
        title: "New chat",
        lastMessageAt: 1710000002000,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      }),
      createChatMessage: mock(),
      updateChatSession: () => null,
    });

    const manager = {
      isRunning: () => false,
      chat: mock(async () => "unused"),
    };
    const app = createChatRoutes(manager as any);

    const res = await app.request("/agents/agent-1/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Custom title" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { session: { id: string } };
    expect(body.session.id).toBe("s-new");
    expect(createChatSession).toHaveBeenCalledWith({
      agentId: "agent-1",
      title: "Custom title",
    });
  });

  it("stores both user and agent messages when chatting in selected session", async () => {
    const createChatMessage = mock();
    const updateChatSession = mock(() => ({
      id: "s-1",
      agentId: "agent-1",
      title: "ping",
      lastMessageAt: 1710000001000,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    }));
    const createChatRoutes = await loadCreateChatRoutes({
      getAgent: () => ({ id: "agent-1" }),
      listChatSessions: () => [],
      listChatMessages: () => [],
      getChatSession: () => null,
      createChatSession: mock(),
      ensureChatSession: () => ({
        id: "s-1",
        agentId: "agent-1",
        title: "New chat",
        lastMessageAt: 1710000000000,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      }),
      createChatMessage,
      updateChatSession,
    });

    const manager = {
      isRunning: () => true,
      chat: mock(async () => "pong"),
    };
    const app = createChatRoutes(manager as any);

    const res = await app.request("/agents/agent-1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ping", sessionId: "s-1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      response: { text: string; actions: string[]; sessionId: string };
      session: { id: string; title: string };
    };
    expect(body.response).toEqual({
      text: "pong",
      actions: [],
      sessionId: "s-1",
    });
    expect(body.session.id).toBe("s-1");

    expect(createChatMessage).toHaveBeenCalledTimes(2);
    expect(createChatMessage.mock.calls[0]?.[0]).toMatchObject({
      agentId: "agent-1",
      sessionId: "s-1",
      role: "user",
      text: "ping",
    });
    expect(createChatMessage.mock.calls[1]?.[0]).toMatchObject({
      agentId: "agent-1",
      sessionId: "s-1",
      role: "agent",
      text: "pong",
      actions: [],
    });
    expect(manager.chat).toHaveBeenCalledWith("agent-1", "ping", undefined, "s-1");
    expect(updateChatSession).toHaveBeenCalled();
  });
});
