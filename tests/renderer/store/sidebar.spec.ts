import { describe, test, expect, beforeEach } from 'vitest';
import { useSideBar } from '../../../src/renderer/store/sidebar';

beforeEach(() => {
  useSideBar.setState({ activity: null, width: 280 });
});

describe('useSideBar', () => {
  test('1. initial state: activity null, width 280', () => {
    const s = useSideBar.getState();
    expect(s.activity).toBeNull();
    expect(s.width).toBe(280);
  });

  test('2. setActivity("files") updates activity', () => {
    useSideBar.getState().setActivity('files');
    expect(useSideBar.getState().activity).toBe('files');
  });

  test('3. setWidth(400) updates width', () => {
    useSideBar.getState().setWidth(400);
    expect(useSideBar.getState().width).toBe(400);
  });

  test('4. toggle("files") from null sets activity to "files"', () => {
    useSideBar.getState().toggle('files');
    expect(useSideBar.getState().activity).toBe('files');
  });

  test('5. toggle("files") from activity="files" collapses to null', () => {
    useSideBar.setState({ activity: 'files' });
    useSideBar.getState().toggle('files');
    expect(useSideBar.getState().activity).toBeNull();
  });

  test('6. toggle("files") from activity="library" switches to "files" (not collapse)', () => {
    useSideBar.setState({ activity: 'library' });
    useSideBar.getState().toggle('files');
    expect(useSideBar.getState().activity).toBe('files');
  });
});
