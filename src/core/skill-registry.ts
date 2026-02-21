import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import matter from 'gray-matter';
import type { SkillMetadata, SkillTier, Skill } from '../shared/types.ts';

const TIER_DIRS: Record<string, SkillTier> = {
  _system: 'system',
  base: 'base',
  service: 'service',
  private: 'private',
};

export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private skillsDir: string;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir || join(process.cwd(), 'skills');
    this.scan();
  }

  scan(): void {
    this.skills.clear();
    if (!existsSync(this.skillsDir)) return;
    this.scanDirectory(this.skillsDir);
  }

  private resolveTier(relPath: string): SkillTier {
    for (const [dir, tier] of Object.entries(TIER_DIRS)) {
      if (relPath.startsWith(dir + '/') || relPath.startsWith(dir + '\\')) {
        return tier;
      }
    }
    return 'base';
  }

  private scanDirectory(dir: string): void {
    const entries = readdirSync(dir);
    const isSkillBundle = entries.includes('SKILL.md');

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!isSkillBundle) {
          this.scanDirectory(fullPath);
        }
        continue;
      }

      if (!entry.endsWith('.md')) continue;
      if (isSkillBundle && entry !== 'SKILL.md') continue;

      const rawContent = readFileSync(fullPath, 'utf-8');
      const { data, content } = matter(rawContent);

      const relPath = relative(this.skillsDir, fullPath);
      const tier = this.resolveTier(relPath);
      const id = data.name || basename(entry, '.md');

      const metadata: SkillMetadata = {
        id,
        name: data.name || id,
        description: data.description || '',
        version: String(data.version || '1.0.0'),
        author: data.author || '',
        homepage: data.homepage,
        tags: Array.isArray(data.tags) ? data.tags : [],
        requiresTools: Array.isArray(data.requires_tools) ? data.requires_tools : [],
        arguments: data.arguments ? normalizeArguments(data.arguments) : undefined,
        tier,
        isSystem: tier === 'system',
      };

      this.skills.set(id, { metadata, content: content.trim() });
    }
  }

  listByTier(tier: SkillTier): SkillMetadata[] {
    return [...this.skills.values()]
      .filter((s) => s.metadata.tier === tier)
      .map((s) => s.metadata);
  }

  listSelectable(): SkillMetadata[] {
    return [...this.skills.values()]
      .filter((s) => s.metadata.tier === 'base' || s.metadata.tier === 'service')
      .map((s) => s.metadata);
  }

  listSystem(): SkillMetadata[] {
    return this.listByTier('system');
  }

  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  getContent(id: string): string | undefined {
    return this.skills.get(id)?.content;
  }

  getMetadata(id: string): SkillMetadata | undefined {
    return this.skills.get(id)?.metadata;
  }

  getSystemContents(): string[] {
    return [...this.skills.values()]
      .filter((s) => s.metadata.tier === 'system')
      .map((s) => s.content);
  }

  resolveSkillContents(ids: string[]): string[] {
    const contents: string[] = [];
    for (const id of ids) {
      const content = this.getContent(id);
      if (content) contents.push(content);
    }
    return contents;
  }

  get size(): number {
    return this.skills.size;
  }
}

function normalizeArguments(
  raw: Record<string, any>,
): Record<string, { description: string; required: boolean }> {
  const result: Record<string, { description: string; required: boolean }> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === 'object' && val !== null) {
      result[key] = {
        description: val.description || '',
        required: val.required === true,
      };
    }
  }
  return result;
}
