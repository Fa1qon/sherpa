import { defineConfig } from 'vitest/config';

// Two projects: node-environment for main / core / scripts tests,
// jsdom-environment for renderer (React) tests. Vitest 4 dropped
// `environmentMatchGlobs`; `projects` is the supported replacement.
//
// Coverage configuration (T-L6-A AC-T-L6-A-1, AC-T-L6-A-2):
//   - Provider: v8 (built into Node — pure perf, no Babel transform).
//   - Scope: src/core/adapters/** (Phase 6 scope per phase-6-quality.md;
//     src/main, src/renderer, src/presentation excluded — those phases
//     have their own coverage targets).
//   - Threshold: 80% lines + 80% branches (NF13).
//   - Run with: `npx vitest run --coverage` once `@vitest/coverage-v8` is
//     installed. The package is in the lock graph but not materialised in
//     node_modules at the time of T-L6-A landing (DEVIATION in BUILD_LOG).
//     To enable locally:  npm install --save-dev @vitest/coverage-v8@^4.1.5

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/core/adapters/**/*.ts'],
      exclude: [
        'src/core/adapters/**/index.ts',
        'src/core/adapters/**/*.d.ts',
        'src/core/adapters/docs/**',
      ],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
    projects: [
      {
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
          exclude: [
            'tests/visual/**',
            'tests/scripts/**',
            'tests/fixtures/**',
            'tests/renderer/**',
            'tests/presentation/**',
            // F-flow Playwright Electron specs run via `npx playwright test`
            // (tests/integration/playwright.config.ts). Cross-port + use-case
            // integration specs (T-L6-B) live в `tests/integration/cross_port`
            // and `tests/integration/use_cases` and are vitest-runnable.
            'tests/integration/flows/**',
            'tests/integration/_helpers/**',
            'tests/integration/playwright.config.ts',
            // Playwright Electron e2e specs (Task 19) — run via `npm run test:e2e`
            'tests/e2e/**',
            'node_modules/**',
          ],
        },
      },
      {
        test: {
          name: 'renderer',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
          include: [
            'tests/renderer/**/*.spec.ts',
            'tests/renderer/**/*.spec.tsx',
            'tests/presentation/**/*.spec.ts',
            'tests/presentation/**/*.spec.tsx',
          ],
          exclude: ['node_modules/**'],
        },
      },
      {
        // T-L6-F — Performance benchmarks. Bench files are isolated under
        // tests/benchmark/ with the `.bench.ts` suffix so they do NOT match
        // the spec-suffix includes of the `node`/`renderer` projects above.
        // Each bench file self-skips by default unless invoked with an
        // explicit `tests/benchmark/` filter (see SHOULD_RUN guard inside
        // each .bench.ts). Run via:
        //   npx vitest run tests/benchmark/
        // The jsdom environment is selected here because ui_lag.bench.ts
        // renders React components; the RAG and project-open benches do
        // not touch the DOM and tolerate the jsdom environment fine.
        test: {
          name: 'benchmark',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
          include: ['tests/benchmark/**/*.bench.ts'],
          exclude: ['node_modules/**'],
          // Benchmarks measure 30-100 iterations of relatively heavy
          // operations (rendering, vector search, project open). The
          // default 5s vitest timeout is too tight for the RAG bench
          // which seeds 10k embeddings before measuring.
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
