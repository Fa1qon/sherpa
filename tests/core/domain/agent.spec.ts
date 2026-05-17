import { describe, test, expect } from 'vitest';
import { isAgentMessage, type AgentMessage, type ToolCall } from '../../../src/core/domain/agent';

describe('agent domain', () => {
  test('isAgentMessage accepts valid', () => {
    const m: AgentMessage = { id: 'a', role: 'user', text: 'hi', timestamp: '2026-05-12T00:00:00Z' };
    expect(isAgentMessage(m)).toBe(true);
  });
  test('isAgentMessage rejects unknown role', () => {
    expect(isAgentMessage({ id: 'a', role: 'magic', text: 'x', timestamp: '2026' })).toBe(false);
  });
  test('isAgentMessage rejects non-object', () => {
    expect(isAgentMessage(null)).toBe(false);
    expect(isAgentMessage('string')).toBe(false);
  });
  test('AgentMessage with toolCall is allowed', () => {
    const tc: ToolCall = { name: 'Read', args: { path: '/x' }, status: 'pending' };
    const m: AgentMessage = { id: 'a', role: 'tool', text: '', toolCall: tc, timestamp: '2026' };
    expect(isAgentMessage(m)).toBe(true);
  });
});
