import type { ComponentType } from 'react';

export type ViewerLoadMode = 'text' | 'binary';

export interface ViewerProps {
  content: string;        // text or base64 (depends on loadMode)
  ext: string;
  projectPath: string;
  relPath: string;
  onSave?(content: string): Promise<void>;
}

export interface LoadedViewer {
  Viewer: ComponentType<ViewerProps>;
}

export interface ViewerEntry {
  id: string;
  extensions: readonly string[];
  loadMode: ViewerLoadMode;
  loader: () => Promise<LoadedViewer>;
  displayName: string;
  priority?: number;
}

const registry = new Map<string, ViewerEntry>();

export function registerViewer(entry: ViewerEntry): void {
  if (entry.extensions.length === 0) {
    throw new Error(`Viewer "${entry.id}" must declare non-empty extensions`);
  }
  if (registry.has(entry.id)) {
    throw new Error(`Viewer with id "${entry.id}" is duplicate`);
  }
  registry.set(entry.id, entry);
}

export function resolveViewer(ext: string): ViewerEntry | null {
  const target = ext.toLowerCase();
  let best: ViewerEntry | null = null;
  for (const entry of registry.values()) {
    if (!entry.extensions.some(e => e.toLowerCase() === target)) continue;
    if (best === null || (entry.priority ?? 0) > (best.priority ?? 0)) {
      best = entry;
    }
  }
  return best;
}

export function listViewers(): ViewerEntry[] {
  return Array.from(registry.values());
}

export function clearViewers(): void {
  registry.clear();
}
