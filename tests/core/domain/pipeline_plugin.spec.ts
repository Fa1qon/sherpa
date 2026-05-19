import { describe, it, expect } from 'vitest';
import {
  validatePlugin,
  validatePluginList,
  type PipelinePlugin,
} from '../../../src/core/domain/pipeline_plugin';

describe('validatePlugin', () => {
  it('accepts a valid plugin', () => {
    const p: PipelinePlugin = {
      id: 'slack-notify',
      type: 'webhook',
      hook: 'on_gate_fail',
    };
    const r = validatePlugin(p);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('accepts plugin with all optional fields', () => {
    const p: PipelinePlugin = {
      id: 'full_plugin',
      type: 'mcp',
      hook: 'on_stage_complete',
      when: '{{ stage.status }} == "success"',
      params: { url: 'https://example.com' },
      retry: { maxAttempts: 3, backoffMs: 1000 },
      onError: 'continue',
      enabled: true,
    };
    const r = validatePlugin(p);
    expect(r.ok).toBe(true);
  });

  it('flags missing id', () => {
    const p = { type: 'webhook', hook: 'on_stage_start' } as unknown as PipelinePlugin;
    const r = validatePlugin(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('id is required'))).toBe(true);
  });

  it('flags missing type', () => {
    const p = { id: 'x', hook: 'on_stage_start' } as unknown as PipelinePlugin;
    const r = validatePlugin(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('type must be one of'))).toBe(true);
  });

  it('flags missing hook', () => {
    const p = { id: 'x', type: 'webhook' } as unknown as PipelinePlugin;
    const r = validatePlugin(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('hook must be one of'))).toBe(true);
  });

  it('flags non-kebab/snake id', () => {
    const p: PipelinePlugin = {
      id: 'Bad Id!',
      type: 'webhook',
      hook: 'on_stage_start',
    };
    const r = validatePlugin(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('kebab/snake_case'))).toBe(true);
  });

  it('flags retry.maxAttempts < 1', () => {
    const p: PipelinePlugin = {
      id: 'x',
      type: 'webhook',
      hook: 'on_stage_start',
      retry: { maxAttempts: 0, backoffMs: 100 },
    };
    const r = validatePlugin(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('retry.maxAttempts must be >= 1'))).toBe(true);
  });

  it('flags retry.backoffMs negative', () => {
    const p: PipelinePlugin = {
      id: 'x',
      type: 'webhook',
      hook: 'on_stage_start',
      retry: { maxAttempts: 3, backoffMs: -1 },
    };
    const r = validatePlugin(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('retry.backoffMs must be >= 0'))).toBe(true);
  });

  it('flags bad onError value', () => {
    const p = {
      id: 'x',
      type: 'webhook',
      hook: 'on_stage_start',
      onError: 'bogus',
    } as unknown as PipelinePlugin;
    const r = validatePlugin(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('onError must be'))).toBe(true);
  });
});

describe('validatePluginList', () => {
  it('returns ok for empty list', () => {
    const r = validatePluginList([]);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('flags duplicate id across list', () => {
    const list: PipelinePlugin[] = [
      { id: 'dup', type: 'webhook', hook: 'on_stage_start' },
      { id: 'dup', type: 'mcp', hook: 'on_stage_complete' },
    ];
    const r = validatePluginList(list);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('duplicate id "dup"'))).toBe(true);
  });

  it('prefixes child errors with plugins[i]', () => {
    const list = [
      { id: 'ok-one', type: 'webhook', hook: 'on_stage_start' } as PipelinePlugin,
      { type: 'webhook', hook: 'on_stage_start' } as unknown as PipelinePlugin,
    ];
    const r = validatePluginList(list);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.startsWith('plugins[1]:'))).toBe(true);
  });

  it('accepts list with multiple valid plugins', () => {
    const list: PipelinePlugin[] = [
      { id: 'a', type: 'webhook', hook: 'on_stage_start' },
      { id: 'b', type: 'mcp', hook: 'on_stage_complete' },
    ];
    const r = validatePluginList(list);
    expect(r.ok).toBe(true);
  });
});
