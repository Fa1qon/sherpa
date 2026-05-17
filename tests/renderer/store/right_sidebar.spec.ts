import { describe, it, expect, beforeEach } from 'vitest';
import { useRightSidebar } from '../../../src/renderer/store/right_sidebar';

beforeEach(() => {
  useRightSidebar.setState({ isOpen: true, width: 260, collapsedSections: new Set() });
});

describe('useRightSidebar', () => {
  it('toggle flips isOpen', () => {
    useRightSidebar.getState().toggle();
    expect(useRightSidebar.getState().isOpen).toBe(false);
    useRightSidebar.getState().toggle();
    expect(useRightSidebar.getState().isOpen).toBe(true);
  });

  it('setWidth clamps to [160, 500]', () => {
    useRightSidebar.getState().setWidth(10);
    expect(useRightSidebar.getState().width).toBe(160);
    useRightSidebar.getState().setWidth(9999);
    expect(useRightSidebar.getState().width).toBe(500);
    useRightSidebar.getState().setWidth(300);
    expect(useRightSidebar.getState().width).toBe(300);
  });

  it('toggleSection collapses and expands a section', () => {
    useRightSidebar.getState().toggleSection('task.stages');
    expect(useRightSidebar.getState().collapsedSections.has('task.stages')).toBe(true);
    useRightSidebar.getState().toggleSection('task.stages');
    expect(useRightSidebar.getState().collapsedSections.has('task.stages')).toBe(false);
  });

  it('multiple sections collapse independently', () => {
    useRightSidebar.getState().toggleSection('a');
    useRightSidebar.getState().toggleSection('b');
    expect(useRightSidebar.getState().collapsedSections.has('a')).toBe(true);
    expect(useRightSidebar.getState().collapsedSections.has('b')).toBe(true);
    useRightSidebar.getState().toggleSection('a');
    expect(useRightSidebar.getState().collapsedSections.has('a')).toBe(false);
    expect(useRightSidebar.getState().collapsedSections.has('b')).toBe(true);
  });
});
