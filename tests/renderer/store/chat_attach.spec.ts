import { describe, it, expect, beforeEach } from 'vitest';
import { useChatAttach } from '../../../src/renderer/store/chat_attach';

describe('useChatAttach', () => {
  beforeEach(() => {
    useChatAttach.setState({ pending: null });
  });

  it('setPending stores text', () => {
    useChatAttach.getState().setPending('hello');
    expect(useChatAttach.getState().pending).toBe('hello');
  });

  it('consume returns text and clears it', () => {
    useChatAttach.getState().setPending('hello');
    const result = useChatAttach.getState().consume();
    expect(result).toBe('hello');
    expect(useChatAttach.getState().pending).toBeNull();
  });

  it('consume returns null when nothing pending', () => {
    expect(useChatAttach.getState().consume()).toBeNull();
  });
});
