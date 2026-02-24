import BetterSqlite3 from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DATABASE_PATH || 'data/gateway.db';

type QueryHandle = {
  get: (...params: any[]) => any;
  all: (...params: any[]) => any[];
};

type RunResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

export interface DatabaseClient {
  exec: (sql: string) => void;
  run: (sql: string, params?: unknown[] | unknown) => RunResult;
  query: (sql: string) => QueryHandle;
  close: () => void;
}

class BetterSqlite3Adapter implements DatabaseClient {
  constructor(private readonly db: BetterSqlite3.Database) {}

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params?: unknown[] | unknown): RunResult {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...normalizeParams(params));
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  query(sql: string): QueryHandle {
    const stmt = this.db.prepare(sql);
    return {
      get: (...params: any[]) => stmt.get(...params),
      all: (...params: any[]) => stmt.all(...params),
    };
  }

  close(): void {
    this.db.close();
  }
}

function normalizeParams(params?: unknown[] | unknown): unknown[] {
  if (params === undefined) return [];
  return Array.isArray(params) ? params : [params];
}

let _db: DatabaseClient | null = null;

export function getDatabase(): DatabaseClient {
  if (_db) return _db;

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const raw = new BetterSqlite3(DB_PATH);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  _db = new BetterSqlite3Adapter(raw);

  runMigrations(_db);
  return _db;
}

function runMigrations(db: DatabaseClient): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
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
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      content       TEXT NOT NULL DEFAULT '',
      version       TEXT NOT NULL DEFAULT '1.0.0',
      tier          TEXT NOT NULL DEFAULT 'base',
      author_agent  TEXT,
      author_user   TEXT,
      visibility    TEXT NOT NULL DEFAULT 'private',
      tags          TEXT NOT NULL DEFAULT '[]',
      requires_tools TEXT NOT NULL DEFAULT '[]',
      arguments     TEXT NOT NULL DEFAULT '{}',
      contract      TEXT,
      fork_of       TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_skills_visibility ON skills(visibility)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_skills_tier ON skills(tier)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_skills_author_agent ON skills(author_agent)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_plugins (
      id                TEXT PRIMARY KEY,
      agent_id          TEXT NOT NULL,
      skill_id          TEXT NOT NULL,
      name              TEXT NOT NULL,
      description       TEXT NOT NULL DEFAULT '',
      source_code       TEXT NOT NULL DEFAULT '',
      status            TEXT NOT NULL DEFAULT 'draft',
      active_version_id TEXT,
      error_msg         TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_plugins_agent_id ON agent_plugins(agent_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_plugins_skill_id ON agent_plugins(skill_id)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_plugin_versions (
      id          TEXT PRIMARY KEY,
      plugin_id   TEXT NOT NULL,
      version     INTEGER NOT NULL,
      source_code TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'draft',
      error_msg   TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(plugin_id, version)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_plugin_versions_plugin_id ON agent_plugin_versions(plugin_id)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_apis (
      id              TEXT PRIMARY KEY,
      agent_id        TEXT NOT NULL,
      name            TEXT NOT NULL,
      description     TEXT NOT NULL,
      endpoint        TEXT NOT NULL,
      schema          TEXT,
      skill_ids       TEXT NOT NULL DEFAULT '[]',
      tags            TEXT NOT NULL DEFAULT '[]',
      price_per_call  TEXT,
      payment_token   TEXT,
      status          TEXT NOT NULL DEFAULT 'draft',
      call_count      INTEGER NOT NULL DEFAULT 0,
      avg_response_ms REAL,
      success_rate    REAL,
      last_active_at  TEXT,
      min_reputation  INTEGER,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_marketplace_apis_agent_id ON marketplace_apis(agent_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_marketplace_apis_status ON marketplace_apis(status)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_chat_messages (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL,
      role        TEXT NOT NULL,
      text        TEXT NOT NULL,
      actions     TEXT NOT NULL DEFAULT '[]',
      is_error    INTEGER NOT NULL DEFAULT 0,
      timestamp   INTEGER NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )
  `);
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_agent_timestamp ON agent_chat_messages(agent_id, timestamp)',
  );

  const cols = db.query("PRAGMA table_info(agents)").all() as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));

  if (!colNames.has('user_id')) {
    db.exec('ALTER TABLE agents ADD COLUMN user_id TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id)');
  }

  if (!colNames.has('on_chain_meta')) {
    db.exec("ALTER TABLE agents ADD COLUMN on_chain_meta TEXT NOT NULL DEFAULT '{}'");
  }
}

export function closeDatabase(): void {
  _db?.close();
  _db = null;
}
