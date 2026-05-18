// src/presentation/chrome/TabBar.tsx
import {
  type ReactElement,
  type MouseEvent,
  type DragEvent,
  useState,
  useRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useNavigation, type Tab, type TabKind } from '../../renderer/store/navigation';
import styles from './TabBar.module.css';

const TITLE_KEY: Record<TabKind, string> = {
  task: 'tabs.task',
  settings: 'tabs.settings',
  'project-settings': 'tabs.projectSettings',
  'methodology-editor': 'tabs.methodologyEditor',
  file: 'tabs.file',
  tracker: 'tabs.tracker',
  browser: 'activityBar.browser',
};

export interface TabBarProps {
  /** Called when user clicks × on a dirty tab. Return true to allow close. */
  onCloseDirty?(tab: Tab): boolean;
}

interface ContextMenu {
  tabId: string;
  x: number;
  y: number;
}

export function TabBar({ onCloseDirty }: TabBarProps): ReactElement | null {
  const { t } = useTranslation();
  const tabs = useNavigation((s) => s.tabs);
  const activeTabId = useNavigation((s) => s.activeTabId);
  const switchTab = useNavigation((s) => s.switchTab);
  const closeTab = useNavigation((s) => s.closeTab);
  const reorderTabs = useNavigation((s) => s.reorderTabs);

  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const dragSrcIdx = useRef<number | null>(null);

  if (tabs.length === 0) return null;

  const tabTitle = (tab: Tab): string => {
    if (tab.title) return tab.title;
    if (tab.params?.id) return `${t(TITLE_KEY[tab.kind])}: ${tab.params.id}`;
    if (tab.params?.taskId) return `${t(TITLE_KEY[tab.kind])}: ${tab.params.taskId}`;
    return t(TITLE_KEY[tab.kind]);
  };

  const handleClose = (e: MouseEvent, tab: Tab): void => {
    e.stopPropagation();
    if (tab.dirty && onCloseDirty) {
      if (!onCloseDirty(tab)) return;
    }
    closeTab(tab.id);
    setContextMenu(null);
  };

  const handleMiddleClick = (e: MouseEvent, tab: Tab): void => {
    if (e.button === 1) {
      e.preventDefault();
      handleClose(e, tab);
    }
  };

  const handleContextMenu = (e: MouseEvent, tab: Tab): void => {
    e.preventDefault();
    setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = (): void => setContextMenu(null);

  const handleCloseOthers = (keepId: string): void => {
    for (const tab of tabs) {
      if (tab.id !== keepId) closeTab(tab.id);
    }
    closeContextMenu();
  };

  const handleCloseAll = (): void => {
    for (const tab of tabs) closeTab(tab.id);
    closeContextMenu();
  };

  const onDragStart = (e: DragEvent, idx: number): void => {
    dragSrcIdx.current = idx;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    }
  };

  const onDragOver = (e: DragEvent): void => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    (e.currentTarget as HTMLElement).setAttribute('data-dragover', 'true');
  };

  const onDragLeave = (e: DragEvent): void => {
    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
    (e.currentTarget as HTMLElement).removeAttribute('data-dragover');
  };

  const onDrop = (e: DragEvent, targetIdx: number): void => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).removeAttribute('data-dragover');
    const srcIdx = dragSrcIdx.current;
    if (srcIdx === null || srcIdx === targetIdx) return;
    reorderTabs(srcIdx, targetIdx);
    dragSrcIdx.current = null;
  };

  const onDragEnd = (): void => {
    dragSrcIdx.current = null;
    document
      .querySelectorAll('[data-dragover]')
      .forEach((el) => el.removeAttribute('data-dragover'));
  };

  return (
    <>
      <div className={styles.tabBar} role="tablist">
        <div className={styles.tabList}>
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId;
            const title = tabTitle(tab);
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                data-active={isActive}
                className={styles.tab}
                draggable
                onClick={() => switchTab(tab.id)}
                onAuxClick={(e) => handleMiddleClick(e, tab)}
                onContextMenu={(e) => handleContextMenu(e, tab)}
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, idx)}
                onDragEnd={onDragEnd}
                title={title}
              >
                <span className={styles.tabTitle}>
                  {tab.dirty && (
                    <span className={styles.dirty} aria-hidden="true">
                      ●
                    </span>
                  )}
                  {title}
                </span>
                <button
                  type="button"
                  className={styles.tabClose}
                  aria-label="Close tab"
                  onClick={(e) => handleClose(e, tab)}
                  tabIndex={-1}
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>

      </div>

      {contextMenu && (
        <>
          <div className={styles.contextOverlay} onClick={closeContextMenu} />
          <div
            className={styles.contextMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className={styles.contextItem}
              onClick={(e) => {
                const tab = tabs.find((t) => t.id === contextMenu.tabId);
                if (tab) handleClose(e as unknown as MouseEvent, tab);
              }}
            >
              {t('tabs.close', 'Закрыть')}
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.contextItem}
              onClick={() => handleCloseOthers(contextMenu.tabId)}
            >
              {t('tabs.closeOthers', 'Закрыть остальные')}
            </button>
            <div className={styles.contextSep} />
            <button
              type="button"
              role="menuitem"
              className={styles.contextItem}
              onClick={handleCloseAll}
            >
              {t('tabs.closeAll', 'Закрыть все')}
            </button>
          </div>
        </>
      )}
    </>
  );
}
