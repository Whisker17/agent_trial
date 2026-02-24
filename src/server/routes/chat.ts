import { Hono } from "hono";
import type { AgentManager } from "../../core/agent-manager.ts";
import * as repo from "../../db/repository.ts";

export function createChatRoutes(manager: AgentManager) {
  const app = new Hono();

  app.get("/agents/:id/chat/sessions", async (c) => {
    const id = c.req.param("id");
    const record = repo.getAgent(id);
    if (!record) return c.json({ error: "Agent not found" }, 404);

    const sessions = repo.listChatSessions(id).map((session) => ({
      id: session.id,
      title: session.title,
      lastMessageAt: session.lastMessageAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));

    return c.json({ sessions });
  });

  app.post("/agents/:id/chat/sessions", async (c) => {
    const id = c.req.param("id");
    const record = repo.getAgent(id);
    if (!record) return c.json({ error: "Agent not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title : undefined;
    const session = repo.createChatSession({ agentId: id, title });

    return c.json(
      {
        session: {
          id: session.id,
          title: session.title,
          lastMessageAt: session.lastMessageAt,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
      },
      201,
    );
  });

  app.delete("/agents/:id/chat/sessions/:sessionId", async (c) => {
    const id = c.req.param("id");
    const sessionId = c.req.param("sessionId");
    const record = repo.getAgent(id);
    if (!record) return c.json({ error: "Agent not found" }, 404);

    const deleted = repo.deleteChatSession(id, sessionId);
    if (!deleted) return c.json({ error: "Chat session not found" }, 404);

    return c.json({ success: true });
  });

  app.get("/agents/:id/chat", async (c) => {
    const id = c.req.param("id");
    const record = repo.getAgent(id);
    if (!record) return c.json({ error: "Agent not found" }, 404);

    const sessionIdParam = c.req.query("sessionId");
    const sessionId =
      typeof sessionIdParam === "string" && sessionIdParam.trim() !== ""
        ? sessionIdParam
        : undefined;

    let session: repo.PersistedChatSession | null = null;
    if (sessionId) {
      session = repo.getChatSession(id, sessionId);
      if (!session) return c.json({ error: "Chat session not found" }, 404);
    } else {
      session = repo.listChatSessions(id)[0] ?? null;
    }

    const messages = session
      ? repo.listChatMessages(id, session.id).map((message) => ({
          id: message.id,
          sessionId: message.sessionId,
          role: message.role,
          text: message.text,
          timestamp: message.timestamp,
          actions: message.actions,
          error: message.error,
        }))
      : [];

    return c.json({
      session: session
        ? {
            id: session.id,
            title: session.title,
            lastMessageAt: session.lastMessageAt,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          }
        : null,
      messages,
    });
  });

  app.post("/agents/:id/chat", async (c) => {
    const id = c.req.param("id");
    const record = repo.getAgent(id);

    if (!record) return c.json({ error: "Agent not found" }, 404);
    if (!manager.isRunning(id)) {
      return c.json({ error: "Agent is not running. Start it first." }, 409);
    }

    const body = await c.req.json();
    const { message, userId, sessionId: incomingSessionId } = body;

    if (typeof message !== "string" || message.trim().length === 0) {
      return c.json({ error: "message is required" }, 400);
    }

    const normalizedMessage = message.trim();
    const normalizedSessionId =
      typeof incomingSessionId === "string" &&
      incomingSessionId.trim().length > 0
        ? incomingSessionId
        : undefined;

    let session: repo.PersistedChatSession;
    try {
      session = repo.ensureChatSession(id, normalizedSessionId);
    } catch {
      return c.json({ error: "Chat session not found" }, 404);
    }

    try {
      repo.createChatMessage({
        agentId: id,
        sessionId: session.id,
        role: "user",
        text: normalizedMessage,
      });

      const text = await manager.chat(
        id,
        normalizedMessage,
        userId,
        session.id,
      );
      repo.createChatMessage({
        agentId: id,
        sessionId: session.id,
        role: "agent",
        text,
        actions: [],
      });

      if (session.title === "New chat") {
        const generatedTitle = normalizedMessage.slice(0, 60);
        const updated = repo.updateChatSession({
          id: session.id,
          agentId: id,
          title: generatedTitle,
        });
        if (updated) session = updated;
      } else {
        const touched = repo.updateChatSession({
          id: session.id,
          agentId: id,
          lastMessageAt: Date.now(),
        });
        if (touched) session = touched;
      }

      return c.json({
        response: { text, actions: [], sessionId: session.id },
        session: {
          id: session.id,
          title: session.title,
          lastMessageAt: session.lastMessageAt,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
      });
    } catch (err: any) {
      const errorMessage = err?.message || "Chat failed";
      repo.createChatMessage({
        agentId: id,
        sessionId: session.id,
        role: "agent",
        text: `Error: ${errorMessage}`,
        error: true,
      });
      return c.json({ error: err.message || "Chat failed" }, 500);
    }
  });

  return app;
}
