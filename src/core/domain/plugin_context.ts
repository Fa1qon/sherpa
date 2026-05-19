import type { PluginHookPoint } from './pipeline_plugin';

export interface PluginExecutionContext {
  hook: PluginHookPoint;
  task: {
    id: string;
    methodologyId?: string;
    workdir: string;
  };
  stage?: {
    id: string;
    status?: 'success' | 'failed' | 'skipped';
  };
  gate?: {
    id: string;
    result: 'pass' | 'fail' | 'pending';
    reason?: string;
  };
  artifact?: {
    path: string;
    size: number;
  };
  event: Record<string, unknown>;
  timestamp: number;
}
