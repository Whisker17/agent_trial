import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

describe("chat session deletion repository behavior", () => {
  it("deletes the chat session and its messages", () => {
    const script = `
      import fs from "node:fs";
      import os from "node:os";
      import path from "node:path";

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mantle-chat-delete-"));
      const dbPath = path.join(tempDir, "runtime.db");
      process.env.DATABASE_PATH = dbPath;

      const repo = await import("./db/repository.ts");
      const dbModule = await import("./db/index.ts");

      repo.createAgent({
        id: "agent-1",
        name: "Agent One",
        persona: "persona",
        modelProvider: "openrouter",
        skills: [],
        skillArgs: {},
        walletAddress: "0x1234567890123456789012345678901234567890",
        encryptedPrivateKey: "encrypted",
        creatorAddress: null,
        userId: null,
      });

      const session = repo.createChatSession({
        agentId: "agent-1",
        title: "Delete me",
      });

      repo.createChatMessage({
        agentId: "agent-1",
        sessionId: session.id,
        role: "user",
        text: "hello",
      });

      const deleted = repo.deleteChatSession("agent-1", session.id);
      const db = dbModule.getDatabase();

      const sessionCount = db
        .query("SELECT COUNT(*) as total FROM agent_chat_sessions WHERE agent_id = ?")
        .get("agent-1");
      const messageCount = db
        .query("SELECT COUNT(*) as total FROM agent_chat_messages WHERE agent_id = ? AND session_id = ?")
        .get("agent-1", session.id);

      dbModule.closeDatabase();
      fs.rmSync(tempDir, { recursive: true, force: true });

      console.log(
        JSON.stringify({
          deleted,
          sessionsRemaining: Number(sessionCount?.total ?? 0),
          messagesRemaining: Number(messageCount?.total ?? 0),
        }),
      );
    `;

    const result = spawnSync("node", ["--import", "tsx", "-e", script], {
      cwd: path.resolve(import.meta.dir, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const output = result.stdout.trim().split("\n").pop();
    expect(output).toBeTruthy();

    const parsed = JSON.parse(output!);
    expect(parsed.deleted).toBe(true);
    expect(parsed.sessionsRemaining).toBe(0);
    expect(parsed.messagesRemaining).toBe(0);
  });
});
