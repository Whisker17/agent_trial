import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Agent wizard wallet balance refresh', () => {
  const wizardPath = path.resolve(import.meta.dir, '../frontend/pages/AgentWizard.tsx');
  const source = fs.readFileSync(wizardPath, 'utf8');

  it('invalidates wallet balance query after deployment flow', () => {
    expect(source.includes("invalidateQueries({ queryKey: ['walletBalance'] })")).toBe(true);
  });
});
