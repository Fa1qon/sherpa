import { describe, it, expect, beforeEach } from 'vitest';
import { useQuickSearch } from '../../../src/renderer/store/quick_search';

describe('useQuickSearch', () => {
  beforeEach(() => useQuickSearch.setState({ open: false }));

  it('open_() sets open true', () => {
    useQuickSearch.getState().open_();
    expect(useQuickSearch.getState().open).toBe(true);
  });

  it('close() sets open false', () => {
    useQuickSearch.setState({ open: true });
    useQuickSearch.getState().close();
    expect(useQuickSearch.getState().open).toBe(false);
  });

  it('toggle() flips open', () => {
    useQuickSearch.getState().toggle();
    expect(useQuickSearch.getState().open).toBe(true);
    useQuickSearch.getState().toggle();
    expect(useQuickSearch.getState().open).toBe(false);
  });
});
