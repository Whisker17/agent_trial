import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import matter from 'gray-matter';
import type { SkillMetadata, Skill } from '../shared/types.ts';

const SYSTEM_DIR = '_system';

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

  private scanDirectory(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        this.scanDirectory(fullPath);
        continue;
      }

      if (!entry.endsWith('.md')) continue;

      const rawContent = readFileSync(fullPath, 'utf-8');
      const { data, content } = matter(rawContent);

      const relPath = relative(this.skillsDir, fullPath);
      const isSystem = relPath.startsWith(SYSTEM_DIR + '/') || relPath.startsWith(SYSTEM_DIR + '\\');
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
        isSystem,
      };

      this.skills.set(id, { metadata, content: content.trim() });
    }
  }

  listSelectable(): SkillMetadata[] {
    return [...this.skills.values()]
      .filter((s) => !s.metadata.isSystem)
      .map((s) => s.metadata);
  }

  listSystem(): SkillMetadata[] {
    return [...this.skills.values()]
      .filter((s) => s.metadata.isSystem)
      .map((s) => s.metadata);
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
      .filter((s) => s.metadata.isSystem)
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
