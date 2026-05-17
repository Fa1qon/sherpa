// Bundle the Electron main process + preload with esbuild.
//
// Why bundling instead of plain `tsc -p tsconfig.main.json`:
//   - tsc preserves the source file structure and leaves every `require()`
//     to be resolved at runtime against `node_modules/`, which means
//     electron-builder ships the whole production dependency graph
//     (vectra → openai/cheerio/grpc/gpt-tokenizer, ~300 MB of dead weight).
//   - esbuild traces actual usage and inlines only the code we touch. After
//     bundling, all bundlable deps move to `devDependencies` and the
//     installer ships only native modules.
//
// External modules:
//   - `electron` / `electron-updater` — Electron runtime APIs.
//   - native modules — must load `.node` from disk at runtime.
//   - `protobufjs` — vectra's ProtobufCodec lazy-requires it inside a
//     try/catch; the missing-module branch is the documented fallback.

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const NATIVE_AND_RUNTIME_EXTERNALS = [
  'electron',
  'electron-updater',
  'better-sqlite3',
  'sqlite-vec',
  'node-pty',
  'protobufjs',
  // @huggingface/transformers loads the ONNX runtime via dynamic require at
  // runtime; onnxruntime-node ships native .node binaries that esbuild cannot
  // bundle. Mark both as external so they are loaded from node_modules/ at
  // runtime (they are unpacked from asar via the **/*.node asarUnpack rule).
  '@huggingface/transformers',
  'onnxruntime-node',
  // playwright-core uses dynamic requires for chromium-bidi that esbuild cannot
  // resolve at bundle time; mark external so it loads from node_modules at runtime.
  'playwright-core',
];

/**
 * Vectra ships a barrel index.js that __exportStars its full surface,
 * including modules that eagerly require openai / cheerio / gpt-tokenizer /
 * @grpc / turndown — adding ~250 MB of dead deps. We use only `LocalIndex`,
 * so this resolver redirects the bare `vectra` specifier to the LocalIndex
 * file directly. esbuild's tree-shaking then sees only LocalIndex's actual
 * imports (uuid, wink-bm25-text-search, wink-nlp, wink-eng-lite-web-model,
 * vectra/lib/{ItemSelector,LocalDocument,storage,codecs}).
 */
const vectraSlimPlugin = {
  name: 'vectra-slim',
  setup(b) {
    const localIndex = path.resolve(root, 'node_modules/vectra/lib/LocalIndex.js');
    b.onResolve({ filter: /^vectra$/ }, () => ({ path: localIndex }));
  },
};

async function bundleMain() {
  await build({
    entryPoints: [path.join(root, 'src/main/index.ts')],
    outfile: path.join(root, 'dist-electron/main/index.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: NATIVE_AND_RUNTIME_EXTERNALS,
    plugins: [vectraSlimPlugin],
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    logLevel: 'warning',
    metafile: false,
  });
}

async function bundlePreload() {
  await build({
    entryPoints: [path.join(root, 'src/main/preload.ts')],
    outfile: path.join(root, 'dist-electron/main/preload.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    logLevel: 'warning',
  });
}

const start = Date.now();
await Promise.all([bundleMain(), bundlePreload()]);
console.log(`[bundle-main] done in ${Date.now() - start}ms`);
