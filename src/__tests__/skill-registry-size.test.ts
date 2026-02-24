import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('SkillRegistry size getter', () => {
  const registryPath = path.resolve(import.meta.dir, '../core/skill-registry.ts');
  const source = fs.readFileSync(registryPath, 'utf8');

  it('imports repository helpers required by size getter', () => {
    expect(source.includes("import * as repo from '../db/repository.ts';")).toBe(true);
  });

  it('imports SkillRecord type used by mutation methods', () => {
    expect(source.includes('SkillRecord')).toBe(true);
  });
});
