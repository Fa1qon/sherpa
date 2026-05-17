// Flat config (ESLint 9+).
//
// Mirrors `.eslintrc.json` (kept for AC-T-L1-01-3 grep compatibility per
// METH-070 spec). Both files MUST stay in sync — flat config is what
// ESLint 9 actually loads; `.eslintrc.json` is the spec-prescribed
// machine-readable record of dependency-direction enforcement.
//
// Hexagonal-Lite dependency rule (ADR-001): domain/application/ports
// modules MUST NOT import from src/main/* or src/renderer/*.

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      'out/**',
      'bin/**',
      '.sherpa-build/**',
      'tests/visual/baselines/**',
      'tests/fixtures/**',
      'coverage/**',
      'build/**',
      '.vite/**',
    ],
  },
  js.configs.recommended,
  {
    // Default linterOptions: don't flag pre-existing eslint-disable directives
    // for rules that are not enabled (T-L0-05 files may have stale directives
    // such as `eslint-disable no-console` that were anticipating future config).
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    // Apply Node + browser globals to all source/test files (TS, JS, MJS).
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    settings: {
      // Resolver for `eslint-plugin-import`. Required so the
      // `import/no-restricted-paths` rule can resolve TS-only imports
      // (`.ts` / `.tsx` extensions) and judge whether each import lands
      // inside a forbidden zone (ADR-001). Without this setting the rule
      // silently skips unresolved specifiers.
      'import/resolver': {
        node: {
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
        },
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TypeScript handles undef + redeclare semantics natively (function
      // overloads, ambient namespaces such as `NodeJS.Timeout`); the base
      // ESLint rules produce false positives on valid TS, so delegate to
      // tsc / @typescript-eslint per official guidance.
      'no-undef': 'off',
      'no-redeclare': 'off',
      // Disable the base rule in favour of @typescript-eslint/no-unused-vars
      // which understands TS interface method signatures, function-type
      // declarations, and overloads. Same `_`-prefix convention applies.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['src/main/*', 'src/renderer/*'],
              message:
                'Domain/application/ports must NOT import from main or renderer (Hexagonal-Lite dependency rule per ADR-001)',
            },
          ],
        },
      ],
      // ADR-001 dependency-direction enforcement (T-L6-E AC-1). Mirror of
      // the `import/no-restricted-paths` zones declared in `.eslintrc.json`.
      // Each zone forbids `from` → `target` imports. Together they wall off
      // domain (no inward deps), application (only ports + domain + infra),
      // ports (no adapter / main / renderer / presentation), adapters
      // (no main / renderer / presentation), and the main↔renderer/presentation
      // boundary which must cross only via Electron IPC.
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src/core/domain', from: './src/core/application', message: 'ADR-001: core/domain MUST NOT import from core/application' },
            { target: './src/core/domain', from: './src/core/adapters', message: 'ADR-001: core/domain MUST NOT import from core/adapters' },
            { target: './src/core/domain', from: './src/core/ports', message: 'ADR-001: core/domain MUST NOT import from core/ports' },
            { target: './src/core/domain', from: './src/core/infrastructure', message: 'ADR-001: core/domain MUST NOT import from core/infrastructure' },
            { target: './src/core/domain', from: './src/main', message: 'ADR-001: core/domain MUST NOT import from src/main' },
            { target: './src/core/domain', from: './src/renderer', message: 'ADR-001: core/domain MUST NOT import from src/renderer' },
            { target: './src/core/domain', from: './src/presentation', message: 'ADR-001: core/domain MUST NOT import from src/presentation' },
            { target: './src/core/application', from: './src/core/adapters', message: 'ADR-001: core/application MUST NOT import from core/adapters (depend only on ports)' },
            { target: './src/core/application', from: './src/main', message: 'ADR-001: core/application MUST NOT import from src/main' },
            { target: './src/core/application', from: './src/renderer', message: 'ADR-001: core/application MUST NOT import from src/renderer' },
            { target: './src/core/application', from: './src/presentation', message: 'ADR-001: core/application MUST NOT import from src/presentation' },
            { target: './src/core/ports', from: './src/core/adapters', message: 'ADR-001: core/ports MUST NOT import from core/adapters' },
            { target: './src/core/ports', from: './src/core/application', message: 'ADR-001: core/ports MUST NOT import from core/application' },
            { target: './src/core/ports', from: './src/main', message: 'ADR-001: core/ports MUST NOT import from src/main' },
            { target: './src/core/ports', from: './src/renderer', message: 'ADR-001: core/ports MUST NOT import from src/renderer' },
            { target: './src/core/ports', from: './src/presentation', message: 'ADR-001: core/ports MUST NOT import from src/presentation' },
            { target: './src/core/adapters', from: './src/main', message: 'ADR-001: core/adapters MUST NOT import from src/main' },
            { target: './src/core/adapters', from: './src/renderer', message: 'ADR-001: core/adapters MUST NOT import from src/renderer' },
            { target: './src/core/adapters', from: './src/presentation', message: 'ADR-001: core/adapters MUST NOT import from src/presentation' },
            { target: './src/main', from: './src/renderer', message: 'ADR-001: src/main MUST NOT import from src/renderer (presentation boundary; use IPC)' },
            { target: './src/main', from: './src/presentation', message: 'ADR-001: src/main MUST NOT import from src/presentation (presentation boundary; use IPC)' },
            // Renderer / presentation may type-import the IPC channel
            // contracts (`src/main/ipc/channels.ts`) — those are erased at
            // runtime and form the shared DTO surface that both sides agree
            // on. Runtime imports from src/main are still forbidden.
            { target: './src/renderer', from: './src/main', except: ['./ipc/channels.ts'], message: 'ADR-001: src/renderer MUST NOT import from src/main (presentation boundary; use IPC). Type-only imports of src/main/ipc/channels.ts are allowed.' },
            { target: './src/presentation', from: './src/main', except: ['./ipc/channels.ts'], message: 'ADR-001: src/presentation MUST NOT import from src/main (presentation boundary; use IPC). Type-only imports of src/main/ipc/channels.ts are allowed.' },
          ],
        },
      ],
    },
  },
];
