// After tsc compiles src/main + src/core to CommonJS in dist-electron/, the
// parent package.json declares "type": "module", which would tell Node to
// load the emitted .js files as ESM and fail. We drop a stub package.json
// at dist-electron/package.json with "type": "commonjs" to scope the
// compiled output back to CJS without changing the project type.
//
// Idempotent: overwrites the stub each build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const target = path.join(repoRoot, 'dist-electron', 'package.json');

const stub = {
  name: 'sherpa-ui-client-main',
  private: true,
  type: 'commonjs',
};

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(stub, null, 2) + '\n', 'utf8');
console.log(`[write-cjs-pkg] wrote ${target}`);
