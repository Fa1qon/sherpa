// src/core/domain/settings.ts
// Settings domain — split into UserSettings (per-machine, ~/.sherpa/global.config.json)
// and ProjectSettings (per-project, <project>/.sherpa/sherpa.config.json).
// Project values override user-scope where overlap exists.

import type { EffortLevel } from './task';
import type { InvolvementPreset } from './involvement';
import type { ProxyEntry, ProxyAssignments } from './proxy';
import { isProxyEntry, isProxyAssignments } from './proxy';

export type Theme = 'dark' | 'light' | 'auto';
export type Language = 'en' | 'ru';

export type PermissionMode = 'bypass' | 'acceptEdits' | 'auto';
const PERMISSION_MODES: readonly PermissionMode[] = ['bypass', 'acceptEdits', 'auto'] as const;

export type ComplianceOutputMode = 'off' | 'file' | 'clipboard' | 'both';

const AGENT_CLIS = [
  'claude-code',
  'codex',
  'opencode',
  'gemini',
  'goose',
  'amp',
  'cursor',
  'copilot',
  'pi',
  'qwen-code',
  'kimi',
  'aider',
] as const;
export type AgentCli = (typeof AGENT_CLIS)[number];

export interface AgentCredential {
  readonly type: 'apikey' | 'oauth';
  readonly apiKey?: string;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly expiresAt?: number;
}

export interface CostTrackingSettings {
  readonly showCost: boolean;
  readonly pricePerMillionInputTokens: number;
  readonly pricePerMillionOutputTokens: number;
}

export interface UserSettings {
  readonly theme: Theme;
  readonly language: Language;
  /** Default agent CLI selection for new projects. */
  readonly defaultAgentCli: AgentCli;
  readonly costTracking: CostTrackingSettings;
  /** Where auto-run compliance reports are delivered. Default: 'file'. */
  readonly complianceOutputMode: ComplianceOutputMode;
  /** Show the Event log (journal) panel in TaskWorkspace. Default: false. */
  readonly showEventLog: boolean;
  /** Named proxy configurations. Absent = no proxies defined. */
  readonly proxyEntries?: readonly ProxyEntry[];
  /** Per-target proxy assignment. Absent = all direct. */
  readonly proxyAssignments?: ProxyAssignments;
  /** Per-agent credentials (API keys or OAuth tokens). Absent = no credentials stored. */
  readonly agentCredentials?: Readonly<Partial<Record<AgentCli, AgentCredential>>>;
}

export interface ProjectSettings {
  /** Relative path under project root; default '.sherpa/core/methodologies'. */
  readonly methodologiesPath: string;
  /** Relative path; default '.sherpa/cases'. */
  readonly casesPath: string;
  /** Relative path; default '.sherpa/core/reviewers'. */
  readonly reviewersPath: string;
  /** Optional override of UserSettings.defaultAgentCli for this project. */
  readonly agentCli?: AgentCli;
  /** Optional override of UserSettings.language for this project. */
  readonly language?: Language;
  /** Controls Claude Code's --permission-mode for this project.
   *  'bypass' = no prompts (default), 'acceptEdits' = ask before file writes,
   *  'auto' = Claude Code default heuristics. */
  readonly permissionMode?: PermissionMode;
  /** Default effort level for new tasks in this project. */
  readonly defaultEffort?: EffortLevel;
  readonly defaultInvolvement?: InvolvementPreset;
  /** When false (default), the agent may only read/write inside the project folder. */
  readonly allowOutsideProjectAccess?: boolean;
}

const THEMES: readonly Theme[] = ['dark', 'light', 'auto'] as const;
const LANGUAGES: readonly Language[] = ['en', 'ru'] as const;

const COMPLIANCE_OUTPUT_MODES: readonly ComplianceOutputMode[] = [
  'off',
  'file',
  'clipboard',
  'both',
] as const;

export function defaultUserSettings(): UserSettings {
  return {
    theme: 'auto',
    language: 'en',
    defaultAgentCli: 'claude-code',
    costTracking: {
      showCost: false,
      pricePerMillionInputTokens: 0,
      pricePerMillionOutputTokens: 0,
    },
    complianceOutputMode: 'file',
    showEventLog: false,
  };
}

export function defaultProjectSettings(): ProjectSettings {
  return {
    methodologiesPath: '.sherpa/core/methodologies',
    casesPath: '.sherpa/cases',
    reviewersPath: '.sherpa/core/reviewers',
    permissionMode: 'bypass',
    defaultEffort: 'normal',
    allowOutsideProjectAccess: false,
  };
}

function isAgentCredential(v: unknown): v is AgentCredential {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  if (c.type !== 'apikey' && c.type !== 'oauth') return false;
  if (c.apiKey !== undefined && typeof c.apiKey !== 'string') return false;
  if (c.accessToken !== undefined && typeof c.accessToken !== 'string') return false;
  if (c.refreshToken !== undefined && typeof c.refreshToken !== 'string') return false;
  if (c.expiresAt !== undefined && typeof c.expiresAt !== 'number') return false;
  return true;
}

/**
 * Structural shape guard. Verifies field presence + types only — does NOT
 * validate semantic correctness (e.g., that path strings resolve on disk).
 * Callers needing semantic validation should layer checks on top.
 */
function isCostTrackingSettings(value: unknown): value is CostTrackingSettings {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.showCost === 'boolean' &&
    typeof c.pricePerMillionInputTokens === 'number' &&
    typeof c.pricePerMillionOutputTokens === 'number' &&
    c.pricePerMillionInputTokens >= 0 &&
    c.pricePerMillionOutputTokens >= 0
  );
}

export function isUserSettings(value: unknown): value is UserSettings {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.theme === 'string' &&
    (THEMES as readonly string[]).includes(v.theme) &&
    typeof v.language === 'string' &&
    (LANGUAGES as readonly string[]).includes(v.language) &&
    typeof v.defaultAgentCli === 'string' &&
    (AGENT_CLIS as readonly string[]).includes(v.defaultAgentCli) &&
    isCostTrackingSettings(v.costTracking) &&
    typeof v.complianceOutputMode === 'string' &&
    (COMPLIANCE_OUTPUT_MODES as readonly string[]).includes(v.complianceOutputMode) &&
    typeof v.showEventLog === 'boolean' &&
    (v.proxyEntries === undefined ||
      (Array.isArray(v.proxyEntries) && v.proxyEntries.every(isProxyEntry))) &&
    (v.proxyAssignments === undefined || isProxyAssignments(v.proxyAssignments)) &&
    (v.agentCredentials === undefined ||
      (typeof v.agentCredentials === 'object' &&
        v.agentCredentials !== null &&
        Object.entries(v.agentCredentials as Record<string, unknown>).every(
          ([k, val]) =>
            (AGENT_CLIS as readonly string[]).includes(k) && isAgentCredential(val),
        )))
  );
}

/**
 * Structural shape guard. Verifies field presence + types only — does NOT
 * validate semantic correctness (e.g., that path strings resolve on disk).
 * Callers needing semantic validation should layer checks on top.
 */
export function isProjectSettings(value: unknown): value is ProjectSettings {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.methodologiesPath === 'string' &&
    typeof v.casesPath === 'string' &&
    typeof v.reviewersPath === 'string' &&
    (v.agentCli === undefined ||
      (typeof v.agentCli === 'string' &&
        (AGENT_CLIS as readonly string[]).includes(v.agentCli))) &&
    (v.language === undefined ||
      (typeof v.language === 'string' &&
        (LANGUAGES as readonly string[]).includes(v.language))) &&
    (v.permissionMode === undefined ||
      (typeof v.permissionMode === 'string' &&
        (PERMISSION_MODES as readonly string[]).includes(v.permissionMode))) &&
    (v.defaultEffort === undefined ||
      ['fast', 'normal', 'thorough'].includes(v.defaultEffort as string)) &&
    (v.defaultInvolvement === undefined ||
      (typeof v.defaultInvolvement === 'string' &&
        (['autopilot', 'standard', 'control', 'manual'] as string[]).includes(v.defaultInvolvement))) &&
    (v.allowOutsideProjectAccess === undefined ||
      typeof v.allowOutsideProjectAccess === 'boolean')
  );
}
