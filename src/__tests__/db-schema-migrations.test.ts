import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const dbIndexPath = path.resolve(import.meta.dir, '../db/index.ts');

function readDbIndex(): string {
  return fs.readFileSync(dbIndexPath, 'utf8');
}

describe('database schema migrations', () => {
  it('creates runtime tables required by repository queries', () => {
    const source = readDbIndex();

    expect(source).toContain('CREATE TABLE IF NOT EXISTS skills');
    expect(source).toContain('CREATE TABLE IF NOT EXISTS agent_plugins');
    expect(source).toContain('CREATE TABLE IF NOT EXISTS agent_plugin_versions');
    expect(source).toContain('CREATE TABLE IF NOT EXISTS marketplace_apis');
    expect(source).toContain('CREATE TABLE IF NOT EXISTS agent_chat_messages');
  });
});
