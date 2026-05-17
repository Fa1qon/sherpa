#!/usr/bin/env node
/**
 * T-L6-E AC-5 / NF19 — i18n parity check.
 *
 * Asserts that `src/renderer/locales/en.json` and `src/renderer/locales/ru.json`
 * declare the **identical** set of translation keys. Missing keys on either
 * side cause the CI gate to fail.
 *
 * Why a Node script (not bash):
 *   Cross-platform portability (Windows/macOS/Linux runner matrix). JSON
 *   parsing is trivial in Node and there are no shell quirks around
 *   diff/comm output formatting.
 *
 * Locale-file contract (per the renderer convention used since L4):
 *   Top-level flat key namespace ("welcome.hero.title", "kanban.task.delete",
 *   etc.). Nested objects are not used; this script therefore only compares
 *   `Object.keys` at depth 1. If we ever switch to nested resources, expand
 *   the comparison to a recursive walk.
 *
 * Exit codes:
 *   0 — parity (every key in en is also in ru and vice versa)
 *   1 — gap found (printed to stderr); CI fails
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const enPath = path.join(root, 'src/renderer/locales/en.json');
const ruPath = path.join(root, 'src/renderer/locales/ru.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));

const enKeys = Object.keys(en).sort();
const ruKeys = Object.keys(ru).sort();
const enSet = new Set(enKeys);
const ruSet = new Set(ruKeys);

const onlyInEn = enKeys.filter((k) => !ruSet.has(k));
const onlyInRu = ruKeys.filter((k) => !enSet.has(k));

if (onlyInEn.length || onlyInRu.length) {
  console.error('i18n parity FAIL (NF19):');
  if (onlyInEn.length) {
    console.error(`  ${onlyInEn.length} key(s) only in en.json:`);
    for (const k of onlyInEn) console.error(`    - ${k}`);
  }
  if (onlyInRu.length) {
    console.error(`  ${onlyInRu.length} key(s) only in ru.json:`);
    for (const k of onlyInRu) console.error(`    - ${k}`);
  }
  process.exit(1);
}

console.log(`OK: i18n parity (NF19) — ${enKeys.length} keys in both en.json and ru.json`);
