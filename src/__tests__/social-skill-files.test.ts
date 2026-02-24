import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

function readSkill(fileName: string): string {
  const filePath = path.resolve(import.meta.dir, `../../skills/base/${fileName}`);
  return fs.readFileSync(filePath, 'utf8');
}

describe('social skill markdown files', () => {
  it('has a single non-empty social base skill with valid frontmatter', () => {
    const content = readSkill('social_apps_integration_base.md');
    expect(content.trim().length).toBeGreaterThan(0);
    expect(content.includes('name: social_apps_integration_base')).toBe(true);
    expect(content.includes('description:')).toBe(true);
  });

  it('does not expose per-platform social skill files in base tier', () => {
    const telegramPath = path.resolve(import.meta.dir, '../../skills/base/social_telegram.md');
    const discordPath = path.resolve(import.meta.dir, '../../skills/base/social_discord.md');
    expect(fs.existsSync(telegramPath)).toBe(false);
    expect(fs.existsSync(discordPath)).toBe(false);
  });
});
