import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseMethodology } from '../../../src/core/methodology/parse';

const CORPUS_DIR = 'C:\\Projects\\sherpa\\.sherpa\\core\\methodologies';

const runCorpus = existsSync(CORPUS_DIR);

describe.runIf(runCorpus)('parser corpus smoke', () => {
  const files = runCorpus ? readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.md')) : [];

  for (const filename of files) {
    test(`parses ${filename} without crash`, () => {
      const source = readFileSync(join(CORPUS_DIR, filename), 'utf8');
      // Either ok:true (parsed cleanly OR with warnings) or ok:false with a typed error
      // — what we DON'T want is a thrown exception.
      const r = parseMethodology(source, join(CORPUS_DIR, filename));
      if (r.ok) {
        // Methodology should have at least one stage
        expect(r.methodology.stages.length).toBeGreaterThan(0);
      } else {
        // Parse failure is acceptable for now (corpus may not match our parser's
        // assumptions). Don't fail the test — just log for investigation.
        // eslint-disable-next-line no-console
        console.warn(`[corpus] ${filename}: ${r.error.kind} — ${r.error.kind === 'parse-error' ? r.error.message : ''}`);
      }
    });
  }
});
