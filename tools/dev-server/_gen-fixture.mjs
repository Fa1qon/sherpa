// One-shot helper that emits the sample-core.tar.gz fixture and prints its
// SHA-256 so it can be pasted into sample-manifest.json. Re-run whenever the
// fixture needs to change (the manifest's `sha256` must match the bytes on
// disk or `verifyManifest()` rejects the artifact).
//
// Usage:
//   node tools/dev-server/_gen-fixture.mjs
//
// Output:
//   tools/dev-server/sample-core.tar.gz  (binary, ~50 bytes)
//   prints `sha256: <hex>`               (paste into sample-manifest.json)
//
// This script is intentionally NOT auto-invoked by the dev server itself — it
// is a developer tool. The committed fixture + manifest stay in sync until
// someone deliberately regenerates them.

import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Build a minimal valid POSIX tar archive containing one file:
 *   version.txt  (5 bytes: "0.0.1\n")
 *
 * Tar layout:
 *   - 512-byte header block (file metadata + checksum)
 *   - file contents padded to next 512-byte boundary
 *   - two trailing 512-byte zero blocks marking end-of-archive
 */
function buildTar() {
  const fileName = 'version.txt';
  const fileBody = Buffer.from('0.0.1\n', 'utf8');
  const paddedBodyLen = Math.ceil(fileBody.length / 512) * 512;
  const paddedBody = Buffer.alloc(paddedBodyLen);
  fileBody.copy(paddedBody);

  const header = Buffer.alloc(512);
  // name (offset 0, length 100)
  header.write(fileName, 0, 'utf8');
  // mode (offset 100, length 8) — "000644 \0"
  header.write('000644 \0', 100, 'ascii');
  // uid (offset 108, length 8)
  header.write('000000 \0', 108, 'ascii');
  // gid (offset 116, length 8)
  header.write('000000 \0', 116, 'ascii');
  // size (offset 124, length 12) — octal, space-padded, then NUL
  header.write(fileBody.length.toString(8).padStart(11, '0') + ' ', 124, 'ascii');
  // mtime (offset 136, length 12) — fixed timestamp for byte-stable fixture
  header.write('00000000000 ', 136, 'ascii');
  // checksum field starts as 8 spaces while computing the checksum
  header.write('        ', 148, 'ascii');
  // typeflag (offset 156) — '0' = regular file
  header.write('0', 156, 'ascii');
  // magic (offset 257, length 6) — "ustar\0"
  header.write('ustar\0', 257, 'ascii');
  // version (offset 263, length 2) — "00"
  header.write('00', 263, 'ascii');

  // Compute checksum: sum of all header bytes, treat checksum field as spaces.
  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += header[i];
  // Write checksum: 6 octal digits + NUL + space
  const cksumStr = sum.toString(8).padStart(6, '0') + '\0 ';
  header.write(cksumStr, 148, 'ascii');

  const trailer = Buffer.alloc(1024); // two zero blocks
  return Buffer.concat([header, paddedBody, trailer]);
}

const tar = buildTar();
const gz = gzipSync(tar, { level: 9 });
const outPath = join(__dirname, 'sample-core.tar.gz');
writeFileSync(outPath, gz);

const sha256 = createHash('sha256').update(gz).digest('hex');
console.log(`wrote ${outPath} (${gz.length} bytes)`);
console.log(`sha256: ${sha256}`);
