import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import matter from 'gray-matter';
import type {
  SkillMetadata,
  SkillTier,
  Skill,
  SkillRecord,
} from '../shared/types.ts';
import * as repo from '../db/repository.ts';

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

  private skillRecordToSkill(record: SkillRecord): Skill {
    const metadata: SkillMetadata = {
      id: record.id,
      name: record.name,
      description: record.description,
      version: record.version,
      author: record.authorAgent || record.authorUser || '',
      tags: record.tags,
      requiresTools: record.requiresTools,
      arguments: record.arguments,
      tier: record.tier,
      isSystem: record.tier === 'system',
    };
    return { metadata, content: record.content };
  }

  private getDbSkill(id: string): Skill | undefined {
    const record = repo.getSkillRecord(id);
    return record ? this.skillRecordToSkill(record) : undefined;
  }

  listByTier(tier: SkillTier): SkillMetadata[] {
    return [...this.skills.values()]
      .filter((s) => s.metadata.tier === tier)
      .map((s) => s.metadata);
  }

  listSelectable(): SkillMetadata[] {
    const fsSkills = [...this.skills.values()]
      .filter((s) => s.metadata.tier === 'base' || s.metadata.tier === 'service')
      .map((s) => s.metadata);
    const dbSkills = repo.listSkillRecords({ visibility: 'public' }).map((r) =>
      this.skillRecordToSkill(r).metadata,
    );
    const seen = new Set(fsSkills.map((s) => s.id));
    const merged = [...fsSkills];
    for (const s of dbSkills) {
      if (!seen.has(s.id)) merged.push(s);
    }
    return merged;
  }

  listSystem(): SkillMetadata[] {
    return this.listByTier('system');
  }

  getSkill(id: string): Skill | undefined {
    const fsSkill = this.skills.get(id);
    if (fsSkill) return fsSkill;
    return this.getDbSkill(id);
  }

  getContent(id: string): string | undefined {
    const fsSkill = this.skills.get(id);
    if (fsSkill) return fsSkill.content;
    return this.getDbSkill(id)?.content;
  }

  getMetadata(id: string): SkillMetadata | undefined {
    const fsSkill = this.skills.get(id);
    if (fsSkill) return fsSkill.metadata;
    return this.getDbSkill(id)?.metadata;
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
    const dbRecords = repo.listSkillRecords();
    const fsIds = new Set(this.skills.keys());
    const dbOnlyCount = dbRecords.filter((r) => !fsIds.has(r.id)).length;
    return this.skills.size + dbOnlyCount;
  }

  createSkill(params: Parameters<typeof repo.createSkill>[0]): SkillRecord {
    return repo.createSkill(params);
  }

  updateSkill(
    id: string,
    fields: Parameters<typeof repo.updateSkill>[1],
  ): SkillRecord | null {
    return repo.updateSkill(id, fields);
  }

  deleteSkill(id: string): boolean {
    return repo.deleteSkill(id);
  }

  listByAgent(agentId: string): SkillMetadata[] {
    return repo.listSkillsByAgent(agentId).map((r) => this.skillRecordToSkill(r).metadata);
  }

  listPublic(): SkillMetadata[] {
    const fsSkills = [...this.skills.values()]
      .filter((s) => s.metadata.tier === 'base' || s.metadata.tier === 'service')
      .map((s) => s.metadata);
    const dbSkills = repo.listSkillRecords({ visibility: 'public' }).map((r) =>
      this.skillRecordToSkill(r).metadata,
    );
    const seen = new Set(fsSkills.map((s) => s.id));
    const merged = [...fsSkills];
    for (const s of dbSkills) {
      if (!seen.has(s.id)) merged.push(s);
    }
    return merged;
  }

  forkSkill(params: Parameters<typeof repo.forkSkill>[0]): SkillRecord {
    return repo.forkSkill(params);
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
