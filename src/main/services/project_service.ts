// src/main/services/project_service.ts
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type {
  ProjectPort,
  AddProjectOptions,
  AddProjectResult,
} from '../../core/ports/project_port';
import type { Project, RecentEntry } from '../../core/domain/project';
import { isProject, toRecentEntry } from '../../core/domain/project';
import { atomicWrite } from '../../core/infrastructure/atomic_write';

export interface ProjectServiceOptions {
  /** Override user home (testing). Default: os.homedir(). */
  readonly userHome?: string;
}

interface RecentFile {
  readonly version: 1;
  readonly projects: Project[];
}

const DEFAULT_SHERPA_CONFIG = {
  $schema: 'https://sherpa.dev/schemas/project.json',
  version: 1,
};

export class ProjectService implements ProjectPort {
  private readonly userHome: string;

  constructor(opts: ProjectServiceOptions = {}) {
    this.userHome = opts.userHome ?? process.env.SHERPA_TEST_USER_HOME ?? os.homedir();
  }

  async listRecent(): Promise<RecentEntry[]> {
    const all = await this.readAll();
    return [...all]
      .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''))
      .map(toRecentEntry);
  }

  async addProject(opts: AddProjectOptions): Promise<AddProjectResult> {
    const exists = await this.statSafe(opts.path);
    if (!exists) return { ok: false, error: { kind: 'path-not-found' } };
    if (!exists.isDirectory()) return { ok: false, error: { kind: 'not-a-directory' } };

    const sherpaDir = path.join(opts.path, '.sherpa');
    const sherpaExists = await this.statSafe(sherpaDir);

    if (!sherpaExists) {
      if (!opts.scaffold) {
        return { ok: false, error: { kind: 'sherpa-missing-and-no-scaffold' } };
      }
      try {
        await fsp.mkdir(sherpaDir, { recursive: true });
        await atomicWrite(
          path.join(sherpaDir, 'sherpa.config.json'),
          JSON.stringify(DEFAULT_SHERPA_CONFIG, null, 2),
        );
      } catch (err) {
        return {
          ok: false,
          error: { kind: 'fs-error', message: (err as Error).message },
        };
      }
    }

    // Idempotent on path: bump lastOpenedAt + return existing id if present.
    const all = await this.readAll();
    const normalized = path.resolve(opts.path);
    const existing = all.find((p) => path.resolve(p.path) === normalized);
    const now = new Date().toISOString();

    let updated: Project;
    if (existing) {
      updated = { ...existing, lastOpenedAt: now };
    } else {
      updated = {
        id: randomUUID(),
        name: opts.name ?? path.basename(opts.path),
        path: opts.path,
        addedAt: now,
        lastOpenedAt: now,
      };
    }

    const next = existing
      ? all.map((p) => (p.id === existing.id ? updated : p))
      : [...all, updated];
    await this.writeAll(next);
    return { ok: true, project: updated };
  }

  async open(id: string): Promise<Project | null> {
    const all = await this.readAll();
    const found = all.find((p) => p.id === id);
    if (!found) return null;
    const updated = { ...found, lastOpenedAt: new Date().toISOString() };
    const next = all.map((p) => (p.id === id ? updated : p));
    await this.writeAll(next);
    return updated;
  }

  async removeFromRecent(id: string): Promise<boolean> {
    const all = await this.readAll();
    const found = all.find((p) => p.id === id);
    if (!found) return false;
    const next = all.filter((p) => p.id !== id);
    await this.writeAll(next);
    return true;
  }

  async get(id: string): Promise<Project | null> {
    const all = await this.readAll();
    return all.find((p) => p.id === id) ?? null;
  }

  // --- internals -----------------------------------------------------------

  private recentPath(): string {
    return path.join(this.userHome, '.sherpa', 'recent-projects.json');
  }

  private async readAll(): Promise<Project[]> {
    try {
      const raw = await fsp.readFile(this.recentPath(), 'utf8');
      const parsed = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        Array.isArray((parsed as RecentFile).projects)
      ) {
        return (parsed as RecentFile).projects.filter(isProject);
      }
      return [];
    } catch {
      return [];
    }
  }

  private async writeAll(projects: Project[]): Promise<void> {
    const file = this.recentPath();
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const content: RecentFile = { version: 1, projects };
    await atomicWrite(file, JSON.stringify(content, null, 2));
  }

  private async statSafe(p: string) {
    try {
      return await fsp.stat(p);
    } catch {
      return null;
    }
  }
}
