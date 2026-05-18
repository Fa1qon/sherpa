import { describe, test, expect } from 'vitest';
import { AmpAdapter } from '../../../../../src/core/adapters/agents/amp/adapter';
import type { AgentMessage } from '../../../../../src/core/domain/agent';

describe('AmpAdapter', () => {
  test('providerId is amp', () => { expect(new AmpAdapter().providerId).toBe('amp'); });
  test('buildArgs passes -x text --stream-json', () => {
    const args = new AmpAdapter().buildArgs({ cwd: '/tmp' }, 'do work', '/tmp/sp.txt');
    expect(args).toContain('-x');
    expect(args).toContain('do work');
    expect(args).toContain('--stream-json');
  });
  test('handleLine emits agent message for assistant content (string)', () => {
    const msgs: AgentMessage[] = [];
    new AmpAdapter().handleLine({ type: 'message', role: 'assistant', content: 'Amp response' }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toBe('Amp response');
  });
  test('handleLine emits for array content', () => {
    const msgs: AgentMessage[] = [];
    new AmpAdapter().handleLine({ type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Part 1' }] }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toContain('Part 1');
  });
  test('extractSessionId reads threadId', () => {
    expect(new AmpAdapter().extractSessionId({ type: 'session_end', threadId: 'T-abc' })).toBe('T-abc');
  });
  test('buildCredentialEnv maps apiKey to AMP_API_KEY', () => {
    expect(new AmpAdapter().buildCredentialEnv({ type: 'apikey', apiKey: 'amp-key-123' })).toEqual({ AMP_API_KEY: 'amp-key-123' });
  });
});
