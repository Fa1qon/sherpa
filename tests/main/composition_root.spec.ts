import { describe, test, expect } from 'vitest';
import { buildContainer, PORT } from '../../src/main/composition_root';
import { ProjectService } from '../../src/main/services/project_service';
import { SettingsService } from '../../src/main/services/settings_service';
import { MethodologyService } from '../../src/main/services/methodology_service';

describe('composition root', () => {
  test('registers project + settings + methodology services', () => {
    const c = buildContainer();
    expect(c.has(PORT.project)).toBe(true);
    expect(c.has(PORT.settings)).toBe(true);
    expect(c.has(PORT.methodology)).toBe(true);
  });

  test('resolved services are real instances', () => {
    const c = buildContainer();
    expect(c.resolve(PORT.project)).toBeInstanceOf(ProjectService);
    expect(c.resolve(PORT.settings)).toBeInstanceOf(SettingsService);
    expect(c.resolve(PORT.methodology)).toBeInstanceOf(MethodologyService);
  });

  test('buildContainer is idempotent (returns fresh containers)', () => {
    const c1 = buildContainer();
    const c2 = buildContainer();
    expect(c1).not.toBe(c2);
    expect(c1.resolve(PORT.project)).not.toBe(c2.resolve(PORT.project));
  });
});
