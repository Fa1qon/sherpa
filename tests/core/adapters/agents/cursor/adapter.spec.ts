import { describe, test, expect } from 'vitest';
import { CursorAdapter } from '../../../../../src/core/adapters/agents/cursor/adapter';
import type { AgentMessage } from '../../../../../src/core/domain/agent';

describe('CursorAdapter', () => {
  test('providerId is cursor', () => { expect(new CursorAdapter().providerId).toBe('cursor'); });
  test('binaryName is cursor', () => { expect(new CursorAdapter().binaryName).toBe('cursor'); });
  test('buildArgs passes -p text and --output-format stream-json', () => {
    const args = new CursorAdapter().buildArgs({ cwd: '/tmp' }, 'task here', '/tmp/sp.txt');
    expect(args).toContain('-p');
    expect(args).toContain('task here');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
  });
  test('buildArgs passes --resume when resumeSessionId set', () => {
    const args = new CursorAdapter().buildArgs({ cwd: '/tmp', resumeSessionId: 'chat-abc' }, 'follow up', '/tmp/sp.txt');
    expect(args).toContain('--resume');
    expect(args).toContain('chat-abc');
  });
  test('handleLine emits agent message for assistant content', () => {
    const msgs: AgentMessage[] = [];
    new CursorAdapter().handleLine({ type: 'message', role: 'assistant', content: 'Cursor says hi' }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toBe('Cursor says hi');
  });
  test('extractSessionId reads chatId from result event', () => {
    expect(new CursorAdapter().extractSessionId({ type: 'result', chatId: 'chat-xyz' })).toBe('chat-xyz');
  });
  test('buildCredentialEnv maps apiKey to CURSOR_API_KEY', () => {
    expect(new CursorAdapter().buildCredentialEnv({ type: 'apikey', apiKey: 'cursor-key' })).toEqual({ CURSOR_API_KEY: 'cursor-key' });
  });
});
