import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import en from '../../../../src/renderer/locales/en.json';
import type {
  StageDurationEntry,
  GateOutcomeEntry,
  ToolUsageEntry,
} from '../../../../src/core/domain/observability';

// Set up i18n
i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const sampleStageDurations: StageDurationEntry[] = [
  { stageId: 'stage-1', count: 3, avgMs: 500, p50: 480, p95: 750 },
];
const sampleGateOutcomes: GateOutcomeEntry[] = [
  { gateId: 'gate-1', pass: 5, fail: 1, pending: 0 },
];
const sampleToolUsage: ToolUsageEntry[] = [
  { toolName: 'Read', calls: 10, okRate: 100, avgMs: 50 },
];

const mockObservability = {
  stageDurations: vi.fn().mockResolvedValue(sampleStageDurations),
  gateOutcomes: vi.fn().mockResolvedValue(sampleGateOutcomes),
  toolUsage: vi.fn().mockResolvedValue(sampleToolUsage),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockObservability.stageDurations.mockResolvedValue(sampleStageDurations);
  mockObservability.gateOutcomes.mockResolvedValue(sampleGateOutcomes);
  mockObservability.toolUsage.mockResolvedValue(sampleToolUsage);
  (window as { sherpa?: unknown }).sherpa = {
    observability: mockObservability,
  };
});

// Dynamically import after window.sherpa is stubbed
async function renderAnalytics(): Promise<void> {
  const { Analytics } = await import('../../../../src/presentation/screens/Analytics/Analytics');
  render(
    <I18nextProvider i18n={i18n}>
      <Analytics />
    </I18nextProvider>,
  );
}

describe('Analytics screen', () => {
  test('renders title and refresh button', async () => {
    await renderAnalytics();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });

  test('renders all 4 widget headings', async () => {
    await renderAnalytics();
    await waitFor(() => {
      expect(screen.getByText('Stage durations (ms)')).toBeInTheDocument();
      expect(screen.getByText('Gate pass / fail / pending')).toBeInTheDocument();
      expect(screen.getByText('Tool usage')).toBeInTheDocument();
      expect(screen.getByText('Tasks over time')).toBeInTheDocument();
    });
  });

  test('refresh button triggers a fresh fetch', async () => {
    await renderAnalytics();
    const refreshBtn = screen.getByRole('button', { name: /refresh/i });
    // Initial fetch happens on mount
    await waitFor(() => {
      expect(mockObservability.stageDurations).toHaveBeenCalled();
    });
    const callCountBefore = mockObservability.stageDurations.mock.calls.length;
    fireEvent.click(refreshBtn);
    await waitFor(() => {
      expect(mockObservability.stageDurations.mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });

  test('shows no-data message when observability returns empty arrays', async () => {
    mockObservability.stageDurations.mockResolvedValue([]);
    mockObservability.gateOutcomes.mockResolvedValue([]);
    mockObservability.toolUsage.mockResolvedValue([]);
    await renderAnalytics();
    await waitFor(() => {
      const noDataItems = screen.getAllByText('No data');
      expect(noDataItems.length).toBeGreaterThanOrEqual(3);
    });
  });
});
