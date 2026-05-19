// src/main/services/extension_installer.ts
// Extension Framework Plan 05 Task 3 — install extensions from a .zip
// archive or a source directory; uninstall removes the extension folder.
//
// .zip extract flow:
//   1. Pick a tmp staging dir under `rootDir/.tmp-install-<ts>/`.
//   2. yauzl streams every entry into the staging dir.
//   3. Read + validate the manifest from the staging dir root.
//   4. If valid, rename staging dir → `<rootDir>/<manifest.id>/`,
//      replacing any prior install. If invalid, rm staging and return errors.
//
// Directory install is the same shape minus the unzip step — we copy
// recursively to avoid linking the user's source dir into userData.

import path from 'node:path';
import { promises as fs } from 'node:fs';
import yauzl from 'yauzl';

import {
  parseManifest,
  validateManifest,
} from '../../core/domain/extension_manifest';

export interface InstallResult {
  ok: boolean;
  extensionId?: string;
  errors?: string[];
}

export class ExtensionInstaller {
  constructor(private readonly rootDir: string) {}

  /** Install from a .zip file. The zip's root must contain `sherpa.extension.json`. */
  async installFromZip(zipPath: string): Promise<InstallResult> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const tmpDir = path.join(this.rootDir, `.tmp-install-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    try {
      await this.extractZip(zipPath, tmpDir);
    } catch (err) {
      await safeRemove(tmpDir);
      return {
        ok: false,
        errors: [
          `Failed to extract zip: ${err instanceof Error ? err.message : String(err)}`,
        ],
      };
    }

    const manifestPath = path.join(tmpDir, 'sherpa.extension.json');
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, 'utf8');
    } catch {
      await safeRemove(tmpDir);
      return {
        ok: false,
        errors: ['Missing sherpa.extension.json at the root of the zip'],
      };
    }

    let manifest;
    try {
      manifest = parseManifest(raw);
    } catch (err) {
      await safeRemove(tmpDir);
      return {
        ok: false,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }

    const v = validateManifest(manifest);
    if (!v.ok) {
      await safeRemove(tmpDir);
      return { ok: false, errors: v.errors };
    }

    const targetDir = path.join(this.rootDir, manifest.id);
    await safeRemove(targetDir);
    await fs.rename(tmpDir, targetDir);
    return { ok: true, extensionId: manifest.id };
  }

  /** Install from a directory by copying contents under `<rootDir>/<id>/`. */
  async installFromDir(sourceDir: string): Promise<InstallResult> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const manifestPath = path.join(sourceDir, 'sherpa.extension.json');
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, 'utf8');
    } catch {
      return {
        ok: false,
        errors: [`Missing sherpa.extension.json in ${sourceDir}`],
      };
    }

    let manifest;
    try {
      manifest = parseManifest(raw);
    } catch (err) {
      return {
        ok: false,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }

    const v = validateManifest(manifest);
    if (!v.ok) return { ok: false, errors: v.errors };

    const targetDir = path.join(this.rootDir, manifest.id);
    await safeRemove(targetDir);
    await copyDir(sourceDir, targetDir);
    return { ok: true, extensionId: manifest.id };
  }

  /** Remove `<rootDir>/<extensionId>/` recursively. Silent if missing. */
  async uninstall(extensionId: string): Promise<void> {
    const dir = path.join(this.rootDir, extensionId);
    await safeRemove(dir);
  }

  /** Compute the target install path for an extension id (used by callers
   *  that want to call `loader.loadOne(targetDir)` after a successful install). */
  installPath(extensionId: string): string {
    return path.join(this.rootDir, extensionId);
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private extractZip(zipPath: string, outDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) {
          reject(err ?? new Error('zip open failed'));
          return;
        }

        zipfile.on('end', resolve);
        zipfile.on('error', reject);

        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          // Zip-slip guard: refuse entries that try to escape outDir.
          const entryPath = path.join(outDir, entry.fileName);
          const rel = path.relative(outDir, entryPath);
          if (rel.startsWith('..') || path.isAbsolute(rel)) {
            reject(new Error(`Zip entry escapes outDir: ${entry.fileName}`));
            zipfile.close();
            return;
          }
          if (/\/$/.test(entry.fileName)) {
            fs.mkdir(entryPath, { recursive: true })
              .then(() => zipfile.readEntry())
              .catch(reject);
            return;
          }
          fs.mkdir(path.dirname(entryPath), { recursive: true })
            .then(() => {
              zipfile.openReadStream(entry, (readErr, stream) => {
                if (readErr || !stream) {
                  reject(readErr ?? new Error('zip stream failed'));
                  return;
                }
                const chunks: Buffer[] = [];
                stream.on('data', (c: Buffer) => chunks.push(c));
                stream.on('end', () => {
                  fs.writeFile(entryPath, Buffer.concat(chunks))
                    .then(() => zipfile.readEntry())
                    .catch(reject);
                });
                stream.on('error', reject);
              });
            })
            .catch(reject);
        });
      });
    });
  }
}

async function safeRemove(target: string): Promise<void> {
  try {
    await fs.rm(target, { recursive: true, force: true });
  } catch {
    // Best effort.
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}
