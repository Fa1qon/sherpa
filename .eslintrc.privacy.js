/**
 * Privacy invariant ESLint config (T-L6-E / NF16 / NF17).
 *
 * Adds **privacy-specific** rules that are intentionally stricter than the
 * everyday lint pass.
 *
 *   - NF16 (local-first data residency): no production code may import a
 *     networking primitive (node:net / node:http / node:https) or a
 *     general-purpose HTTP client (node-fetch / axios / got / undici / ky).
 *     Cloud calls must NOT exist outside an explicitly-marked adapter.
 *
 *   - NF17 (telemetry opt-in manual): no `console.log` / `.info` / `.debug`
 *     in production source — audit logging goes through
 *     `core/adapters/hook/sherpa_hooks/audit_log.ts` (sherpa.audit.log hook
 *     per ADR-010), never raw stdout/stderr.
 *
 * Run via:  npm run check:privacy
 *
 * Scope:
 *   Only `src/core/**` and `src/main/**` — these are production modules that
 *   ship inside the bundled Electron app. `src/renderer/`, `src/presentation/`,
 *   and `tests/` are exempt: renderer is sandboxed by Electron contextBridge,
 *   presentation is pure UI with no I/O, tests legitimately need console for
 *   diagnostics. `scripts/` is build tooling (CI only — never bundled).
 *
 * Cross-reference:
 *   - scripts/check-no-cloud-adapter.sh — runtime grep for cloud_* directories
 *   - scripts/check-no-telemetry-endpoint.sh — runtime grep for telemetry SaaS
 *   - .eslintrc.json / eslint.config.mjs — dependency-direction (ADR-001)
 *
 * Format note:
 *   File is written as an ESLint 9 **flat config** because `package.json`
 *   sets `"type": "module"`, which forces `.js` to be parsed as ESM. The
 *   filename `.eslintrc.privacy.js` is preserved per the T-L6-E spec
 *   (creates contract). This file is what ESLint 9 actually loads when
 *   invoked as `eslint -c .eslintrc.privacy.js …`.
 */
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
      'tests/**',
      'src/renderer/**',
      'src/presentation/**',
      'scripts/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  {
    // Pre-existing eslint-disable directives across the codebase target rules
    // that are NOT enabled in this privacy-only config (e.g. no-console for
    // bootstrap-warn paths, no-var-requires for sqlite native loader). The
    // resulting "Unused eslint-disable directive" warnings are not violations
    // — silence them so the privacy job exits clean on a clean codebase.
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}', 'src/main/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',

      // NF16 — no networking primitives / HTTP clients in production source.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'node:net', message: 'NF16: production code must not open raw network sockets' },
            { name: 'node:http', message: 'NF16: production code must not initiate HTTP — use the audit/hook port' },
            { name: 'node:https', message: 'NF16: production code must not initiate HTTPS — use the audit/hook port' },
            { name: 'http', message: 'NF16: production code must not initiate HTTP' },
            { name: 'https', message: 'NF16: production code must not initiate HTTPS' },
            { name: 'net', message: 'NF16: production code must not open raw network sockets' },
            { name: 'node-fetch', message: 'NF16: HTTP clients are forbidden in production source' },
            { name: 'axios', message: 'NF16: HTTP clients are forbidden in production source' },
            { name: 'got', message: 'NF16: HTTP clients are forbidden in production source' },
            { name: 'undici', message: 'NF16: HTTP clients are forbidden in production source' },
            { name: 'ky', message: 'NF16: HTTP clients are forbidden in production source' },
          ],
        },
      ],

      // NF17 — no routine console output in production. `warn` / `error`
      // remain available for fatal bootstrap diagnostics.
      'no-console': [
        'error',
        { allow: ['warn', 'error'] },
      ],
    },
  },
];
