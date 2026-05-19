export type PluginHookPoint =
  | 'on_stage_start'
  | 'on_stage_complete'
  | 'on_artifact_created'
  | 'on_gate_pass'
  | 'on_gate_fail'
  | 'on_task_complete'
  | 'on_task_fail';

export type PluginType = 'webhook' | 'mcp' | 'transform' | 'notify' | 'integration' | 'generation';

export type PluginErrorPolicy = 'continue' | 'abort' | 'retry';

export interface PluginRetry {
  maxAttempts: number;
  backoffMs: number;
}

export interface PipelinePlugin {
  id: string;
  type: PluginType;
  hook: PluginHookPoint;
  when?: string;
  params?: Record<string, unknown>;
  retry?: PluginRetry;
  onError?: PluginErrorPolicy;
  enabled?: boolean;
}

const HOOK_POINTS: readonly PluginHookPoint[] = [
  'on_stage_start', 'on_stage_complete',
  'on_artifact_created',
  'on_gate_pass', 'on_gate_fail',
  'on_task_complete', 'on_task_fail',
];

const PLUGIN_TYPES: readonly PluginType[] = [
  'webhook', 'mcp', 'transform', 'notify', 'integration', 'generation',
];

export interface ValidationResult { ok: boolean; errors: string[]; }

export function validatePlugin(p: PipelinePlugin): ValidationResult {
  const errors: string[] = [];
  if (!p.id || typeof p.id !== 'string') errors.push('id is required');
  else if (!/^[a-z0-9][a-z0-9_-]*$/.test(p.id)) errors.push(`id "${p.id}" must be kebab/snake_case`);
  if (!p.type || !(PLUGIN_TYPES as readonly string[]).includes(p.type)) errors.push(`type must be one of ${PLUGIN_TYPES.join('|')}`);
  if (!p.hook || !(HOOK_POINTS as readonly string[]).includes(p.hook)) errors.push(`hook must be one of ${HOOK_POINTS.join('|')}`);
  if (p.retry !== undefined) {
    if (typeof p.retry.maxAttempts !== 'number' || p.retry.maxAttempts < 1) errors.push('retry.maxAttempts must be >= 1');
    if (typeof p.retry.backoffMs !== 'number' || p.retry.backoffMs < 0) errors.push('retry.backoffMs must be >= 0');
  }
  if (p.onError !== undefined && !['continue', 'abort', 'retry'].includes(p.onError)) errors.push('onError must be continue|abort|retry');
  return { ok: errors.length === 0, errors };
}

export function validatePluginList(plugins: PipelinePlugin[]): ValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [i, p] of plugins.entries()) {
    const r = validatePlugin(p);
    if (!r.ok) errors.push(...r.errors.map(e => `plugins[${i}]: ${e}`));
    if (seen.has(p.id)) errors.push(`plugins[${i}]: duplicate id "${p.id}"`);
    seen.add(p.id);
  }
  return { ok: errors.length === 0, errors };
}

export { HOOK_POINTS, PLUGIN_TYPES };
