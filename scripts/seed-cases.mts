/**
 * Seed test cases into a Sherpa project DB.
 * Usage: npx tsx scripts/seed-cases.mts <project-path>
 *
 * Runs in plain Node (no Electron). Both better-sqlite3 and sqlite-vec
 * ship pre-built binaries that are Node-compatible.
 */

import { ProjectDatabase } from '../src/core/adapters/project_database.js';
import { CaseService } from '../src/main/services/case_service.js';
import { EmbeddingService } from '../src/main/services/embedding_service.js';

const projectPath = process.argv[2];
if (!projectPath) {
  console.error('Usage: npx tsx scripts/seed-cases.mts <project-path>');
  process.exit(1);
}

const CASES = [
  {
    title: 'Fix typo in variable declaration (cosnt → const)',
    summary: 'TypeScript files had cosnt instead of const — syntax error, fails to compile.',
    content: `## Problem\nFile src/foo.ts line 6: \`cosnt greeting = "hello";\`\n\n## Solution\nReplace \`cosnt\` with \`const\`. Run \`tsc --noEmit\` to verify no errors remain.\n\n## Root cause\nKeyboard typo introduced during initial scaffolding; not caught by editor spellcheck.`,
    tags: ['typescript', 'syntax', 'bug'],
    confidence: 'high' as const,
  },
  {
    title: 'Semantic bug: add() subtracts instead of adding',
    summary: 'Function add(a, b) returned a - b instead of a + b. Unit tests expose it.',
    content: `## Problem\nIn src/foo.ts the \`add\` function body was \`return a - b\` — wrong operator.\n\n## Solution\nChange to \`return a + b\`.\n\n## Lesson\nAlways write a unit test before committing arithmetic functions: \`expect(add(2, 3)).toBe(5)\`.`,
    tags: ['typescript', 'logic-bug', 'arithmetic'],
    confidence: 'high' as const,
  },
  {
    title: 'TypeScript: noEmit check before every commit',
    summary: 'Run tsc --noEmit in CI/pre-commit hook to catch type errors before they land.',
    content: `## Pattern\nAdd to package.json scripts:\n\`\`\`json\n"typecheck": "tsc --noEmit"\n\`\`\`\nAnd add a pre-commit hook or CI step that runs \`npm run typecheck\`.\n\n## Why\nTypeScript compile errors are caught at the point of introduction, not discovered by reviewers.`,
    tags: ['typescript', 'ci', 'best-practice'],
    confidence: 'high' as const,
  },
  {
    title: 'Export barrel pattern for small modules',
    summary: 'Use a single index.ts to re-export public API; hides internal file layout.',
    content: `## Pattern\nCreate \`src/index.ts\`:\n\`\`\`ts\nexport { greeting, add } from './foo';\n\`\`\`\nConsumers import from \`src\` instead of \`src/foo\`.\n\n## Benefit\nInternal refactors (renaming files) don\\'t break external imports.`,
    tags: ['typescript', 'architecture', 'module'],
    confidence: 'medium' as const,
  },
  {
    title: 'Property-based testing for numeric functions',
    summary: 'Use fast-check to verify arithmetic invariants across random inputs.',
    content: `## Problem\nManual test cases miss edge cases for numeric functions.\n\n## Solution\n\`\`\`ts\nimport * as fc from 'fast-check';\n\ntest('add is commutative', () => {\n  fc.assert(fc.property(fc.integer(), fc.integer(), (a, b) => add(a, b) === add(b, a)));\n});\n\`\`\`\n\n## When to use\nAny pure function over numbers, strings, or data structures.`,
    tags: ['testing', 'property-based', 'fast-check'],
    confidence: 'medium' as const,
  },
  {
    title: 'ESLint: catch common TS anti-patterns automatically',
    summary: 'Configure @typescript-eslint/no-explicit-any and related rules to enforce type safety.',
    content: `## Config snippet\n\`\`\`json\n{\n  "rules": {\n    "@typescript-eslint/no-explicit-any": "error",\n    "@typescript-eslint/explicit-function-return-type": "warn",\n    "eqeqeq": ["error", "always"]\n  }\n}\n\`\`\`\n\n## Why\nLinter errors surface at write time (in IDE) rather than at review time.`,
    tags: ['typescript', 'eslint', 'code-quality'],
    confidence: 'high' as const,
  },
  {
    title: 'Vitest unit tests for utility functions',
    summary: 'Minimal vitest setup for a TypeScript project without a bundler.',
    content: `## Setup\n\`\`\`\nnpm i -D vitest\n\`\`\`\n\`vitest.config.ts\`:\n\`\`\`ts\nimport { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: { environment: 'node' } });\n\`\`\`\n\n## First test (tests/foo.spec.ts)\n\`\`\`ts\nimport { add } from '../src/foo';\ntest('add 2+3=5', () => expect(add(2, 3)).toBe(5));\n\`\`\``,
    tags: ['testing', 'vitest', 'setup'],
    confidence: 'high' as const,
  },
  {
    title: 'Git pre-commit hook via simple-git-hooks',
    summary: 'Lightweight pre-commit hook that runs typecheck + lint without husky overhead.',
    content: `## Setup\n\`\`\`\nnpm i -D simple-git-hooks lint-staged\n\`\`\`\nIn package.json:\n\`\`\`json\n"simple-git-hooks": {\n  "pre-commit": "npx lint-staged"\n},\n"lint-staged": {\n  "*.ts": ["tsc --noEmit", "eslint --fix"]\n}\n\`\`\`\nThen: \`npx simple-git-hooks\``,
    tags: ['git', 'pre-commit', 'quality'],
    confidence: 'medium' as const,
  },
  {
    title: 'Strict TypeScript config for new projects',
    summary: 'tsconfig.json with strict: true + additional safety flags for maximum type safety.',
    content: `## tsconfig.json\n\`\`\`json\n{\n  "compilerOptions": {\n    "strict": true,\n    "noUncheckedIndexedAccess": true,\n    "exactOptionalPropertyTypes": true,\n    "noImplicitReturns": true,\n    "target": "ES2022",\n    "module": "Node16",\n    "moduleResolution": "Node16"\n  }\n}\n\`\`\``,
    tags: ['typescript', 'config', 'strict'],
    confidence: 'high' as const,
  },
  {
    title: 'Debugging: isolate logic from I/O to simplify testing',
    summary: 'Pure functions are easier to test. Extract business logic out of functions that perform I/O.',
    content: `## Anti-pattern\n\`\`\`ts\nfunction processFile(path: string) {\n  const data = fs.readFileSync(path); // I/O + logic mixed\n  return data.toString().toUpperCase();\n}\n\`\`\`\n\n## Better\n\`\`\`ts\nexport function transform(data: string): string { return data.toUpperCase(); }\nfunction processFile(path: string) { return transform(fs.readFileSync(path, 'utf-8')); }\n\`\`\`\nNow \`transform\` is trivially testable.`,
    tags: ['architecture', 'testing', 'separation-of-concerns'],
    confidence: 'high' as const,
  },
];

async function main() {
  console.log(`Seeding cases into project: ${projectPath}`);
  const db = new ProjectDatabase(projectPath);
  const svc = new CaseService(db);

  console.log('Loading embedding model (first run downloads ~22MB)...');
  const embedder = new EmbeddingService();

  let created = 0;
  for (const input of CASES) {
    const c = svc.create(input);
    const text = `${c.title} ${c.summary} ${c.content}`;
    const emb = await embedder.embed(text);
    svc.upsertEmbedding(c.id, emb);
    created++;
    console.log(`  [${created}/${CASES.length}] ${c.title}`);
  }

  await embedder.dispose();
  db.close();

  console.log(`\nDone. ${created} cases seeded into ${projectPath}/.sherpa/sherpa.db`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
