// src/main/services/files_service.ts
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { FilesPort, DirEntry } from '../../core/ports/files_port';
import type { EventBus } from './event_bus';

export class FilesService implements FilesPort {
  // Plan 02 — optional EventBus for file.changed events. Default null keeps
  // existing tests constructing `new FilesService()` valid.
  constructor(private readonly bus: EventBus | null = null) {}

  async readDir(projectPath: string, relPath: string): Promise<DirEntry[]> {
    const abs = this.resolveSafe(projectPath, relPath);
    const items = await fsp.readdir(abs, { withFileTypes: true });
    return items.map((d) => ({
      name: d.name,
      relPath: relPath === '' ? d.name : `${relPath}/${d.name}`,
      kind: d.isDirectory() ? 'directory' : 'file',
    }));
  }

  async readFile(projectPath: string, relPath: string): Promise<string> {
    const abs = this.resolveSafe(projectPath, relPath);
    return fsp.readFile(abs, 'utf8');
  }

  async writeFile(projectPath: string, relPath: string, content: string): Promise<void> {
    const abs = this.resolveSafe(projectPath, relPath);
    // Determine created-vs-modified by probing before the write.
    let action: 'created' | 'modified' = 'modified';
    try {
      await fsp.stat(abs);
    } catch {
      action = 'created';
    }
    await fsp.writeFile(abs, content, 'utf8');
    this.bus?.emit({
      type: 'file.changed',
      ts: Date.now(),
      projectPath,
      relPath,
      action,
    });
  }

  async readBinary(projectPath: string, relPath: string): Promise<string> {
    const abs = this.resolveSafe(projectPath, relPath);
    const buf = await fsp.readFile(abs);
    return buf.toString('base64');
  }

  private resolveSafe(projectPath: string, relPath: string): string {
    const root = path.resolve(projectPath);
    const target = path.resolve(root, relPath);
    const rel = path.relative(root, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`path "${relPath}" escapes project root`);
    }
    return target;
  }
}
