import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DATABASE_PATH || 'data/gateway.db';

let _db: Database | null = null;

export function getDatabase(): Database {
  if (_db) return _db;

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH, { create: true });
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');

  runMigrations(_db);
  return _db;
}

function runMigrations(db: Database): void {
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
}

export function closeDatabase(): void {
  _db?.close();
  _db = null;
}
