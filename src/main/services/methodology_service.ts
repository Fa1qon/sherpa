// src/main/services/methodology_service.ts
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import type {
  MethodologyPort,
  MethodologySummary,
  LoadMethodologyResult,
} from '../../core/ports/methodology_port';
import type { Methodology } from '../../core/domain/methodology';
import { parseMethodology, serializeMethodologyYaml, parseMethodologyYaml } from '../../core/methodology';
import { atomicWrite } from '../../core/infrastructure/atomic_write';

const METHODOLOGIES_REL = path.join('.sherpa', 'core', 'methodologies');

export class MethodologyService implements MethodologyPort {
  async list(projectPath: string): Promise<MethodologySummary[]> {
    const dir = path.join(projectPath, METHODOLOGIES_REL);
    let entries: string[];
    try {
      entries = await fsp.readdir(dir);
    } catch {
      return [];
    }

    // Collect ids; prefer .yaml over .md when both exist.
    const seen = new Map<string, string>(); // id-stem → filename
    for (const entry of entries) {
      if (entry.endsWith('.yaml')) {
        const stem = entry.slice(0, -5);
        seen.set(stem, entry);
      } else if (entry.endsWith('.md') && !seen.has(entry.slice(0, -3))) {
        seen.set(entry.slice(0, -3), entry);
      }
    }

    const summaries: MethodologySummary[] = [];
    for (const [, filename] of seen) {
      const fullPath = path.join(dir, filename);
      try {
        const source = await fsp.readFile(fullPath, 'utf8');
        const r = filename.endsWith('.yaml')
          ? parseMethodologyYaml(source, fullPath)
          : parseMethodology(source, fullPath);
        if (r.ok) {
          summaries.push({
            id: r.methodology.id,
            version: r.methodology.version,
            name: r.methodology.name,
            description: r.methodology.description,
            sourcePath: fullPath,
            warnings: r.warnings,
          });
        }
      } catch {
        // skip unreadable files
      }
    }
    return summaries;
  }

  async load(projectPath: string, id: string): Promise<LoadMethodologyResult> {
    const dir = path.join(projectPath, METHODOLOGIES_REL);
    // Try exact-name match first (fast path: filename == id).
    const yamlPath = path.join(dir, `${id}.yaml`);
    const mdPath = path.join(dir, `${id}.md`);
    let source: string;
    let isYaml: boolean;
    try {
      source = await fsp.readFile(yamlPath, 'utf8');
      isYaml = true;
    } catch {
      try {
        source = await fsp.readFile(mdPath, 'utf8');
        isYaml = false;
      } catch {
        // Slow-path: filename may differ from id (e.g. feature_dev.yaml has id: feature-dev).
        // Scan the directory and find the first file whose parsed id matches.
        const found = await this.findByScanning(dir, id);
        if (!found) return { ok: false, error: { kind: 'not-found' } };
        return found.isYaml
          ? parseMethodologyYaml(found.source, found.filePath)
          : parseMethodology(found.source, found.filePath);
      }
    }
    return isYaml
      ? parseMethodologyYaml(source, yamlPath)
      : parseMethodology(source, mdPath);
  }

  private async findByScanning(
    dir: string,
    id: string,
  ): Promise<{ source: string; filePath: string; isYaml: boolean } | null> {
    let entries: string[];
    try {
      entries = await fsp.readdir(dir);
    } catch {
      return null;
    }
    for (const entry of entries) {
      const isYaml = entry.endsWith('.yaml');
      if (!isYaml && !entry.endsWith('.md')) continue;
      const filePath = path.join(dir, entry);
      try {
        const source = await fsp.readFile(filePath, 'utf8');
        // Cheap id extraction — avoid full parse just to check the id field.
        const idMatch = source.match(/^id:\s*(.+)$/m);
        if (idMatch && idMatch[1]!.trim() === id) {
          return { source, filePath, isYaml };
        }
      } catch {
        // skip unreadable
      }
    }
    return null;
  }

  async save(projectPath: string, m: Methodology): Promise<void> {
    const dir = path.join(projectPath, METHODOLOGIES_REL);
    const yamlPath = path.join(dir, `${m.id}.yaml`);
    await fsp.mkdir(dir, { recursive: true });
    await atomicWrite(yamlPath, serializeMethodologyYaml(m));
    // Remove legacy .md if present (migration: once saved as yaml, md is stale).
    const mdPath = path.join(dir, `${m.id}.md`);
    try { await fsp.unlink(mdPath); } catch { /* not present, ignore */ }
  }
}
