import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const packageJsonPath = path.resolve(import.meta.dir, '../../package.json');
const packageLockPath = path.resolve(import.meta.dir, '../../package-lock.json');

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

describe('dependency constraints', () => {
  it('pins @elizaos/plugin-ollama to a non-postinstall version for npm ci stability', () => {
    const packageJson = readJson(packageJsonPath);
    const dependencies = packageJson.dependencies as Record<string, string>;
    expect(dependencies['@elizaos/plugin-ollama']).toBe('1.0.8');

    const packageLock = readJson(packageLockPath);
    const packages = packageLock.packages as Record<string, { version?: string }>;
    expect(packages['node_modules/@elizaos/plugin-ollama']?.version).toBe('1.0.8');
  });
});
