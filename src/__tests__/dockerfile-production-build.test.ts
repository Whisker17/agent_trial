import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const dockerfilePath = path.resolve(import.meta.dir, '../../Dockerfile');

function readDockerfile(): string {
  return fs.readFileSync(dockerfilePath, 'utf8');
}

describe('Dockerfile production build prerequisites', () => {
  it('installs native module build prerequisites required by node-gyp', () => {
    const dockerfile = readDockerfile();

    expect(dockerfile).toContain('ca-certificates');
    expect(dockerfile).toContain('python3');
    expect(dockerfile).toContain('make');
    expect(dockerfile).toContain('g++');
  });

  it('does not pipe bun installer directly from curl to shell', () => {
    const dockerfile = readDockerfile();

    expect(dockerfile).not.toMatch(/curl\s+-fsSL\s+https:\/\/bun\.sh\/install\s+\|\s+bash/);
  });
});
