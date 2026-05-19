import { isValidPermission } from './extension_permissions';

export interface ExtensionAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface ExtensionSlotRegistration {
  id: string;
  slot: SlotName;
  title?: string;
  icon?: string;
}

export type SlotName =
  | 'sidebar.panel'
  | 'task.toolbar'
  | 'chat.decorator'
  | 'chat.input.addon'
  | 'methodology.editor.stage.tab'
  | 'settings.tab'
  | 'browser.toolbar';

export interface ExtensionToolDef {
  id: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ExtensionSettingDef {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default?: unknown;
  title?: string;
  description?: string;
  options?: string[];
}

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: ExtensionAuthor | string;
  license?: string;
  engines: { sherpa: string };
  permissions?: string[];
  entry: { main?: string; renderer?: string };
  subscriptions?: string[];
  slots?: ExtensionSlotRegistration[];
  tools?: ExtensionToolDef[];
  settings?: ExtensionSettingDef[];
}

const ID_RE = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
const VERSION_RE = /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function parseManifest(raw: string): ExtensionManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in manifest: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Manifest must be a JSON object');
  }
  return parsed as ExtensionManifest;
}

export function validateManifest(m: ExtensionManifest): ValidationResult {
  const errors: string[] = [];

  if (!m.id || typeof m.id !== 'string') errors.push('id is required (string)');
  else if (!ID_RE.test(m.id)) errors.push(`id "${m.id}" must match ${ID_RE.toString()}`);

  if (!m.name || typeof m.name !== 'string') errors.push('name is required (string)');

  if (!m.version || typeof m.version !== 'string') errors.push('version is required (string)');
  else if (!VERSION_RE.test(m.version)) errors.push(`version "${m.version}" must be semver MAJOR.MINOR.PATCH`);

  if (!m.engines || typeof m.engines !== 'object' || typeof m.engines.sherpa !== 'string') {
    errors.push('engines.sherpa is required (semver range string)');
  }

  if (!m.entry || typeof m.entry !== 'object' || (typeof m.entry.main !== 'string' && typeof m.entry.renderer !== 'string')) {
    errors.push('entry.main or entry.renderer is required');
  }

  if (m.permissions !== undefined && !Array.isArray(m.permissions)) {
    errors.push('permissions must be an array of strings');
  } else if (Array.isArray(m.permissions)) {
    m.permissions.forEach((p, i) => {
      if (typeof p !== 'string') errors.push(`permissions[${i}] must be string`);
      else if (!isValidPermission(p)) errors.push(`permissions[${i}] "${p}" is not a known permission`);
    });
  }

  if (m.slots !== undefined) {
    if (!Array.isArray(m.slots)) errors.push('slots must be an array');
    else m.slots.forEach((s, i) => {
      if (!s.id) errors.push(`slots[${i}].id required`);
      if (!s.slot) errors.push(`slots[${i}].slot required`);
    });
  }

  if (m.tools !== undefined) {
    if (!Array.isArray(m.tools)) errors.push('tools must be an array');
    else m.tools.forEach((t, i) => {
      if (!t.id) errors.push(`tools[${i}].id required`);
      if (!t.description) errors.push(`tools[${i}].description required`);
      if (!t.inputSchema || typeof t.inputSchema !== 'object') errors.push(`tools[${i}].inputSchema required`);
    });
  }

  if (m.settings !== undefined) {
    if (!Array.isArray(m.settings)) errors.push('settings must be an array');
  }

  return { ok: errors.length === 0, errors };
}
