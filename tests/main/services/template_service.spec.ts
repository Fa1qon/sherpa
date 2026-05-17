import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectDatabase } from '../../../src/core/adapters/project_database';
import { TemplateService } from '../../../src/main/services/template_service';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('TemplateService', () => {
  let svc: TemplateService;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'sherpa-tmpl-test-'));
    svc = new TemplateService(new ProjectDatabase(dir));
  });

  it('creates and retrieves a template', () => {
    const t = svc.create({ name: 'PRD template', content: '# PRD\n\n## Goals' });
    expect(t.id).toMatch(/^tmpl-/);
    expect(svc.get(t.id)?.name).toBe('PRD template');
  });

  it('lists templates', () => {
    svc.create({ name: 'A', content: 'a' });
    svc.create({ name: 'B', content: 'b' });
    expect(svc.list().length).toBe(2);
  });

  it('updates a template', () => {
    const t = svc.create({ name: 'Draft', content: 'v1' });
    const u = svc.update(t.id, { content: 'v2' });
    expect(u?.content).toBe('v2');
  });

  it('deletes a template', () => {
    const t = svc.create({ name: 'Temp', content: 'x' });
    svc.delete(t.id);
    expect(svc.get(t.id)).toBeNull();
  });
});
