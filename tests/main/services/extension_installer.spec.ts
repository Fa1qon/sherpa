// tests/main/services/extension_installer.spec.ts
// Extension Framework Plan 05 Task 3 — ExtensionInstaller tests.
//
// `installFromZip` is the most interesting code path but requires a real
// zip archive to exercise. Rather than add a zip-encoder dependency just
// for tests, we construct a minimal STORED-method zip in-memory using the
// PKZIP "stored" (no-compression) format — yauzl reads both stored and
// deflate, so a stored zip is the smallest test artefact we can produce
// without pulling another package.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';

import { ExtensionInstaller } from '../../../src/main/services/extension_installer';

interface TmpFixture {
  root: string;
  cleanup(): Promise<void>;
}

async function makeTmp(): Promise<TmpFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sherpa-installer-'));
  return {
    root,
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

const VALID_MANIFEST = (id: string): Record<string, unknown> => ({
  id,
  name: 'Test',
  version: '0.1.0',
  engines: { sherpa: '>=0.23.0' },
  entry: { main: 'main.js' },
});

// ---------------------------------------------------------------------------
// Minimal zip builder (deflate method). PK headers per APPNOTE.TXT.
// Sufficient for yauzl to round-trip a couple of small files.
// ---------------------------------------------------------------------------
interface ZipFile {
  name: string;
  data: Buffer;
}

function crc32(buf: Buffer): number {
  // zlib's crc32 lives in node:zlib since v18.
  return zlib.crc32(buf);
}

function buildZip(files: ZipFile[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const compressed = zlib.deflateRawSync(f.data);
    const crc = crc32(f.data);

    // Local file header
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0, 6); // flags
    lfh.writeUInt16LE(8, 8); // method: deflate
    lfh.writeUInt16LE(0, 10); // mod time
    lfh.writeUInt16LE(0, 12); // mod date
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressed.length, 18);
    lfh.writeUInt32LE(f.data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    localParts.push(lfh, nameBuf, compressed);

    // Central directory header
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0, 8); // flags
    cdh.writeUInt16LE(8, 10); // method
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compressed.length, 20);
    cdh.writeUInt32LE(f.data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30); // extra
    cdh.writeUInt16LE(0, 32); // comment
    cdh.writeUInt16LE(0, 34); // disk number
    cdh.writeUInt16LE(0, 36); // internal attrs
    cdh.writeUInt32LE(0, 38); // external attrs
    cdh.writeUInt32LE(offset, 42); // relative offset of local header
    centralParts.push(cdh, nameBuf);

    offset += lfh.length + nameBuf.length + compressed.length;
  }

  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, central, eocd]);
}

async function writeFixtureDir(
  parent: string,
  id: string,
  files: Record<string, string>,
): Promise<string> {
  const dir = path.join(parent, id);
  await fs.mkdir(dir, { recursive: true });
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents, 'utf8');
  }
  return dir;
}

describe('ExtensionInstaller', () => {
  let tmp: TmpFixture;
  let rootDir: string;
  let installer: ExtensionInstaller;

  beforeEach(async () => {
    tmp = await makeTmp();
    rootDir = path.join(tmp.root, 'extensions');
    installer = new ExtensionInstaller(rootDir);
  });

  afterEach(async () => {
    await tmp.cleanup();
  });

  // -------------------------------------------------------------------
  // installFromDir
  // -------------------------------------------------------------------
  describe('installFromDir', () => {
    it('copies a valid extension into <rootDir>/<id>/', async () => {
      const sourceParent = path.join(tmp.root, 'src');
      const sourceDir = await writeFixtureDir(sourceParent, 'ext-source', {
        'sherpa.extension.json': JSON.stringify(VALID_MANIFEST('com.test.x')),
        'main.js': 'exports.activate = () => {};',
        'README.md': 'hi',
      });
      const result = await installer.installFromDir(sourceDir);
      expect(result.ok).toBe(true);
      expect(result.extensionId).toBe('com.test.x');

      const target = path.join(rootDir, 'com.test.x');
      expect(
        await fs.readFile(path.join(target, 'sherpa.extension.json'), 'utf8'),
      ).toContain('"com.test.x"');
      expect(await fs.readFile(path.join(target, 'main.js'), 'utf8')).toContain('activate');
    });

    it('errors when manifest is missing', async () => {
      const sourceParent = path.join(tmp.root, 'src');
      const sourceDir = await writeFixtureDir(sourceParent, 'no-manifest', {
        'main.js': '',
      });
      const result = await installer.installFromDir(sourceDir);
      expect(result.ok).toBe(false);
      expect(result.errors?.[0]).toMatch(/Missing sherpa.extension.json/);
    });

    it('errors when manifest fails validation', async () => {
      const sourceParent = path.join(tmp.root, 'src');
      const sourceDir = await writeFixtureDir(sourceParent, 'bad', {
        'sherpa.extension.json': JSON.stringify({
          id: 'BAD!',
          name: 'x',
          version: 'x',
        }),
      });
      const result = await installer.installFromDir(sourceDir);
      expect(result.ok).toBe(false);
      expect(result.errors && result.errors.length).toBeGreaterThan(0);
    });

    it('errors when manifest is non-JSON', async () => {
      const sourceParent = path.join(tmp.root, 'src');
      const sourceDir = await writeFixtureDir(sourceParent, 'syntax', {
        'sherpa.extension.json': '{not json',
      });
      const result = await installer.installFromDir(sourceDir);
      expect(result.ok).toBe(false);
      expect(result.errors?.[0]).toMatch(/Invalid JSON/);
    });
  });

  // -------------------------------------------------------------------
  // installFromZip
  // -------------------------------------------------------------------
  describe('installFromZip', () => {
    it('extracts and installs a valid zip', async () => {
      const manifest = JSON.stringify(VALID_MANIFEST('com.test.zip'));
      const zipBuf = buildZip([
        { name: 'sherpa.extension.json', data: Buffer.from(manifest) },
        { name: 'main.js', data: Buffer.from('exports.activate = () => {};') },
      ]);
      const zipPath = path.join(tmp.root, 'ext.zip');
      await fs.writeFile(zipPath, zipBuf);

      const result = await installer.installFromZip(zipPath);
      expect(result.ok).toBe(true);
      expect(result.extensionId).toBe('com.test.zip');

      const installed = await fs.readFile(
        path.join(rootDir, 'com.test.zip', 'sherpa.extension.json'),
        'utf8',
      );
      expect(installed).toContain('com.test.zip');
    });

    it('reports error when zip is missing a manifest', async () => {
      const zipBuf = buildZip([
        { name: 'main.js', data: Buffer.from('exports.activate = () => {};') },
      ]);
      const zipPath = path.join(tmp.root, 'ext.zip');
      await fs.writeFile(zipPath, zipBuf);
      const result = await installer.installFromZip(zipPath);
      expect(result.ok).toBe(false);
      expect(result.errors?.[0]).toMatch(/Missing sherpa.extension.json/);
    });

    it('reports error when manifest in zip is invalid', async () => {
      const zipBuf = buildZip([
        {
          name: 'sherpa.extension.json',
          data: Buffer.from(JSON.stringify({ id: 'BAD!', name: 'x', version: 'x' })),
        },
      ]);
      const zipPath = path.join(tmp.root, 'ext.zip');
      await fs.writeFile(zipPath, zipBuf);
      const result = await installer.installFromZip(zipPath);
      expect(result.ok).toBe(false);
    });

    it('reports error when path is not a zip', async () => {
      const notZip = path.join(tmp.root, 'not.zip');
      await fs.writeFile(notZip, 'just text');
      const result = await installer.installFromZip(notZip);
      expect(result.ok).toBe(false);
      expect(result.errors?.[0]).toMatch(/Failed to extract zip/);
    });
  });

  // -------------------------------------------------------------------
  // uninstall + installPath
  // -------------------------------------------------------------------
  describe('uninstall + installPath', () => {
    it('uninstall removes the extension folder', async () => {
      const sourceParent = path.join(tmp.root, 'src');
      const sourceDir = await writeFixtureDir(sourceParent, 'src', {
        'sherpa.extension.json': JSON.stringify(VALID_MANIFEST('com.test.rm')),
      });
      await installer.installFromDir(sourceDir);
      const targetDir = path.join(rootDir, 'com.test.rm');
      await fs.access(targetDir);
      await installer.uninstall('com.test.rm');
      await expect(fs.access(targetDir)).rejects.toBeDefined();
    });

    it('uninstall on missing id is silent', async () => {
      await expect(installer.uninstall('com.never.installed')).resolves.toBeUndefined();
    });

    it('installPath returns rootDir + extensionId', () => {
      expect(installer.installPath('com.x')).toBe(path.join(rootDir, 'com.x'));
    });
  });
});
