import { Hono } from 'hono';
import type { SkillRegistry } from '../../core/skill-registry.ts';
import type { SkillTier } from '../../shared/types.ts';

const PUBLIC_TIERS: Set<SkillTier> = new Set(['base', 'service']);

export function createSkillRoutes(registry: SkillRegistry) {
  const app = new Hono();

  app.get('/skills', (c) => {
    const tierParam = c.req.query('tier') as SkillTier | undefined;

    if (tierParam && PUBLIC_TIERS.has(tierParam)) {
      return c.json({ skills: registry.listByTier(tierParam) });
    }

    return c.json({ skills: registry.listSelectable() });
  });

  app.get('/skills/:id', (c) => {
    const id = c.req.param('id');
    const meta = registry.getMetadata(id);
    if (!meta || !PUBLIC_TIERS.has(meta.tier)) {
      return c.json({ error: 'Skill not found' }, 404);
    }
    const content = registry.getContent(id);
    return c.json({ skill: { ...meta, content } });
  });

  return app;
}
