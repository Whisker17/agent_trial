import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const agentsRoutePath = path.resolve(import.meta.dir, '../server/routes/agents.ts');
const agentManagerPath = path.resolve(import.meta.dir, '../core/agent-manager.ts');

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('agent runtime status sync guards', () => {
  it('downgrades stale running status to stopped in list/detail routes', () => {
    const source = readSource(agentsRoutePath);

    expect(source).toContain("else if (r.status === 'running')");
    expect(source).toContain("repo.setAgentStatus(r.id, 'stopped')");
    expect(source).toContain("else if (record.status === 'running')");
    expect(source).toContain("repo.setAgentStatus(id, 'stopped')");
  });

  it('makes stop endpoint idempotent when runtime is already down', () => {
    const source = readSource(agentsRoutePath);

    expect(source).toContain("app.post('/agents/:id/stop'");
    expect(source).not.toContain("return c.json({ error: 'Agent is not running' }, 409)");
    expect(source).toContain("return c.json({ status: 'stopped' })");
  });

  it('reconciles stale running records to stopped on manager boot', () => {
    const source = readSource(agentManagerPath);

    expect(source).toContain('repo.setAllRunningAgentsStopped()');
  });
});
