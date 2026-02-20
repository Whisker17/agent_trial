import { Hono } from 'hono';
import type { SkillRegistry } from '../../core/skill-registry.ts';

export function createSkillRoutes(registry: SkillRegistry) {
  const app = new Hono();

  app.get('/skills', (c) => {
    const skills = registry.listSelectable();
    return c.json({ skills });
  });

  app.get('/skills/:id', (c) => {
    const id = c.req.param('id');
    const meta = registry.getMetadata(id);
    if (!meta || meta.isSystem) {
      return c.json({ error: 'Skill not found' }, 404);
    }
    const content = registry.getContent(id);
    return c.json({ skill: { ...meta, content } });
  });

  return app;
}
