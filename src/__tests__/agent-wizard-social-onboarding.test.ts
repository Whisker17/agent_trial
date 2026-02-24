import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('agent wizard social onboarding', () => {
  const wizardPath = path.resolve(import.meta.dir, '../frontend/pages/AgentWizard.tsx');
  const source = fs.readFileSync(wizardPath, 'utf8');

  it('renders a dedicated social apps step', () => {
    expect(source.includes('StepSocial')).toBe(true);
  });

  it('sends skillArgs in createAgent payload', () => {
    expect(source.includes('skillArgs:')).toBe(true);
  });
});
