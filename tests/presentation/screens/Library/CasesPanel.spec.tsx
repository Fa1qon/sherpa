import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CasesPanel } from '../../../../src/presentation/screens/Library/CasesPanel/CasesPanel';

// Mock window.sherpa.cases + events
vi.stubGlobal('window', {
  sherpa: {
    cases: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      delete: vi.fn(),
      ftsSearch: vi.fn().mockResolvedValue([]),
      vectorSearch: vi.fn().mockResolvedValue([]),
      unifiedSearch: vi.fn().mockResolvedValue([]),
    },
    events: {
      onAppEvent: vi.fn().mockReturnValue(() => {}),
    },
  },
});

describe('CasesPanel', () => {
  test('renders search bar and new case button', async () => {
    render(<CasesPanel projectPath="/tmp/test-project" />);
    expect(screen.getByPlaceholderText(/search cases/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /new case/i })).toBeTruthy();
  });

  test('renders FTS and Vector search mode toggles', () => {
    render(<CasesPanel projectPath="/tmp/test-project" />);
    expect(screen.getByText(/text/i)).toBeTruthy();
    expect(screen.getByText(/vector/i)).toBeTruthy();
  });
});
