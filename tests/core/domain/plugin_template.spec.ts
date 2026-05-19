import { describe, it, expect } from 'vitest';
import { substituteString, substituteValue, evaluateCondition } from '../../../src/core/domain/plugin_template';
import type { PluginExecutionContext } from '../../../src/core/domain/plugin_context';

const ctx = {
  hook: 'on_stage_start' as const,
  task: { id: 'T1', workdir: '/p' },
  stage: { id: 'design' },
  event: { foo: 'bar' },
  timestamp: 1000,
} as PluginExecutionContext;

describe('plugin_template', () => {
  it('substitutes simple path', () => {
    expect(substituteString('task={{task.id}}', ctx)).toBe('task=T1');
  });
  it('handles missing path as empty', () => {
    expect(substituteString('{{missing.path}}', ctx)).toBe('');
  });
  it('recursive value substitution', () => {
    const r = substituteValue({ a: '{{task.id}}', nested: { b: '{{stage.id}}' } }, ctx);
    expect(r).toEqual({ a: 'T1', nested: { b: 'design' } });
  });
  it('evaluateCondition equality', () => {
    expect(evaluateCondition('{{stage.id}} == design', ctx)).toBe(true);
    expect(evaluateCondition('{{stage.id}} == other', ctx)).toBe(false);
  });
  it('evaluateCondition inequality', () => {
    expect(evaluateCondition('{{stage.id}} != design', ctx)).toBe(false);
  });
  it('evaluateCondition truthy', () => {
    expect(evaluateCondition('{{event.foo}}', ctx)).toBe(true);
    expect(evaluateCondition('{{missing}}', ctx)).toBe(false);
  });
  it('undefined expr returns true', () => {
    expect(evaluateCondition(undefined, ctx)).toBe(true);
  });
});
