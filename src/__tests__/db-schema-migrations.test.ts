import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dbIndexPath = path.resolve(import.meta.dir, "../db/index.ts");

function readDbIndex(): string {
  return fs.readFileSync(dbIndexPath, "utf8");
}

describe("database schema migrations", () => {
  it("creates runtime tables required by repository queries", () => {
    const source = readDbIndex();

    expect(source).toContain("CREATE TABLE IF NOT EXISTS skills");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS agent_plugins");
    expect(source).toContain(
      "CREATE TABLE IF NOT EXISTS agent_plugin_versions",
    );
    expect(source).toContain("CREATE TABLE IF NOT EXISTS marketplace_apis");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS agent_chat_messages");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS agent_chat_sessions");
    expect(source).toContain(
      "ALTER TABLE agent_chat_messages ADD COLUMN session_id TEXT",
    );
  });

  it("adds missing chat session columns for legacy databases", () => {
    const script = `
      import fs from "node:fs";
      import os from "node:os";
      import path from "node:path";
      import Database from "better-sqlite3";

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mantle-db-"));
      const dbPath = path.join(tempDir, "legacy.db");
      const legacy = new Database(dbPath);
      legacy.exec(\`
        CREATE TABLE agents (
          id                    TEXT PRIMARY KEY,
          name                  TEXT NOT NULL,
          persona               TEXT NOT NULL,
          model_provider        TEXT NOT NULL DEFAULT 'openrouter',
          skills                TEXT NOT NULL DEFAULT '[]',
          skill_args            TEXT NOT NULL DEFAULT '{}',
          wallet_address        TEXT NOT NULL,
          encrypted_private_key TEXT NOT NULL,
          creator_address       TEXT,
          status                TEXT NOT NULL DEFAULT 'created',
          created_at            TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE agent_chat_messages (
          id          TEXT PRIMARY KEY,
          agent_id    TEXT NOT NULL,
          role        TEXT NOT NULL,
          text        TEXT NOT NULL,
          actions     TEXT NOT NULL DEFAULT '[]',
          is_error    INTEGER NOT NULL DEFAULT 0,
          timestamp   INTEGER NOT NULL,
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
        );
        INSERT INTO agents (id, name, persona, model_provider, skills, skill_args, wallet_address, encrypted_private_key, creator_address, status)
        VALUES ('agent-1', 'Agent One', 'persona', 'openrouter', '[]', '{}', '0xabc', 'enc', NULL, 'created');
        INSERT INTO agent_chat_messages (id, agent_id, role, text, actions, is_error, timestamp)
        VALUES ('msg-1', 'agent-1', 'user', 'hello', '[]', 0, 1710000000000);
      \`);
      legacy.close();

      process.env.DATABASE_PATH = dbPath;
      const dbModule = await import("./db/index.ts");
      const db = dbModule.getDatabase();

      const cols = db.query("PRAGMA table_info(agent_chat_messages)").all();
      const hasSessionId = cols.some((col) => col.name === "session_id");
      const backfilled = db.query("SELECT session_id FROM agent_chat_messages WHERE id = ?").get("msg-1");
      const sessions = db.query("SELECT COUNT(*) as total FROM agent_chat_sessions").get();
      dbModule.closeDatabase();
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(JSON.stringify({
        hasSessionId,
        hasBackfilledSession: Boolean(backfilled?.session_id),
        sessionCount: sessions?.total ?? 0
      }));
    `;

    const result = spawnSync("node", ["--import", "tsx", "-e", script], {
      cwd: path.resolve(import.meta.dir, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const output = result.stdout.trim().split("\n").pop();
    expect(output).toBeTruthy();

    const parsed = JSON.parse(output!);
    expect(parsed.hasSessionId).toBe(true);
    expect(parsed.hasBackfilledSession).toBe(true);
    expect(parsed.sessionCount).toBe(1);
  });
});
