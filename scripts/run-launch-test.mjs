// Helper: invokes vitest on the Electron launch smoke spec with the
// opt-in env var set. Cross-platform (no cross-env dependency).

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const vitestBin = path.join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vitest.cmd' : 'vitest',
);

const result = spawnSync(
  vitestBin,
  ['run', 'tests/main/launch.spec.ts'],
  {
    cwd: repoRoot,
    env: { ...process.env, SHERPA_RUN_LAUNCH_TEST: '1' },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

process.exit(result.status ?? 1);
