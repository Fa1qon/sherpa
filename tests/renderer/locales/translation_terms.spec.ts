import { describe, test, expect } from 'vitest';
import ru from '../../../src/renderer/locales/ru.json';

describe('translation_terms', () => {
  test('ru locale uses гейт not ворота', () => {
    const s = JSON.stringify(ru);
    expect(s).not.toMatch(/ворота|Ворота/);
  });

  test('ru locale prefers документ over артефакт', () => {
    const s = JSON.stringify(ru);
    expect(s).not.toMatch(/артефакт|Артефакт|артефакты|Артефакты/);
  });
});
