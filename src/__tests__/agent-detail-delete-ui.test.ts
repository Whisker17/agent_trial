import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Agent detail delete UX', () => {
  const agentDetailPath = path.resolve(import.meta.dir, '../frontend/pages/AgentDetail.tsx');
  const source = fs.readFileSync(agentDetailPath, 'utf8');

  it('does not use browser native confirm dialog', () => {
    expect(source.includes('confirm(')).toBe(false);
  });

  it('uses in-app delete dialog component', () => {
    expect(source.includes('DeleteAgentDialog')).toBe(true);
  });
});
