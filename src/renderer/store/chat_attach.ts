import { create } from 'zustand';

interface ChatAttachState {
  readonly pending: string | null;
  setPending(text: string): void;
  consume(): string | null;
}

export const useChatAttach = create<ChatAttachState>((set, get) => ({
  pending: null,
  setPending: (text) => set({ pending: text }),
  consume: () => {
    const p = get().pending;
    if (p !== null) set({ pending: null });
    return p;
  },
}));
