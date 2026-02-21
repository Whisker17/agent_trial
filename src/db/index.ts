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
