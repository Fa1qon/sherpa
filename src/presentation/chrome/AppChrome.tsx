// src/presentation/chrome/AppChrome.tsx
import { useState, useEffect, useRef, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelRight } from 'lucide-react';
import { MENUS, type MenuDef, type MenuEntry } from './menus';
import { useNavigation } from '../../renderer/store/navigation';
import { useProject } from '../../renderer/store/project';
import { useRightSidebar } from '../../renderer/store/right_sidebar';
import { usePanelRegistry } from '../../renderer/store/panel_registry';
import '../../renderer/styles/chrome.css';

export interface AppChromeProps {
  onAction(actionId: string): void;
}

export function AppChrome({ onAction }: AppChromeProps): ReactElement {
  const { t } = useTranslation();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const project = useProject((s) => s.current);
  const activeTabId = useNavigation((s) => s.activeTabId);
  const tabs = useNavigation((s) => s.tabs);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const getSlot = usePanelRegistry((s) => s.getSlot);
  const hasRightPanel = activeTab ? getSlot(`sidebar.right:${activeTab.kind}`).length > 0 : false;
  const rightSidebarOpen = useRightSidebar((s) => s.isOpen);
  const toggleRightSidebar = useRightSidebar((s) => s.toggle);

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenu]);

  // Global hotkey handler — minimal Plan 1 set
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd) return;
      // ⌘N — project.new
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onAction('project.new');
        return;
      }
      // ⌘Q — project.quit
      if (e.key.toLowerCase() === 'q') {
        e.preventDefault();
        onAction('project.quit');
        return;
      }
      // Plan 3.5: tab hotkeys
      // ⌘W close active tab
      if (e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const active = useNavigation.getState().activeTabId;
        if (active) useNavigation.getState().closeTab(active);
        return;
      }
      // ⌘1..9 switch to tab N
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = Number.parseInt(e.key, 10) - 1;
        const tabs = useNavigation.getState().tabs;
        if (tabs[idx]) useNavigation.getState().switchTab(tabs[idx]!.id);
        return;
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onAction]);

  const handleSelectItem = (entry: MenuEntry) => {
    if ('separator' in entry) return;
    if (entry.disabled) return;
    onAction(entry.id);
    setOpenMenu(null);
  };

  return (
    <div className="chrome" ref={containerRef}>
      <button
        type="button"
        className="chrome-brand chrome-brand-btn"
        onClick={() => onAction('project.openRecent')}
        title={project ? project.path : 'Sherpa'}
      >
        <img src="icons/icon-dark.png" alt="" className="chrome-brand-icon chrome-brand-icon-dark" />
        <img src="icons/icon-light.png" alt="" className="chrome-brand-icon chrome-brand-icon-light" />
        <span className="chrome-brand-name">
          {project ? (project.path.split(/[\\/]/).pop() ?? 'Sherpa') : 'Sherpa'}
        </span>
      </button>
      <div className="chrome-menu" role="menubar">
        {MENUS.map((menu) => (
          <MenuButton
            key={menu.id}
            menu={menu}
            t={t}
            isOpen={openMenu === menu.id}
            onToggle={() => setOpenMenu((cur) => (cur === menu.id ? null : menu.id))}
            onSelectItem={handleSelectItem}
          />
        ))}
      </div>
      <span className="chrome-spacer" />
      {hasRightPanel && (
        <button
          type="button"
          className="chrome-layout-btn"
          data-active={rightSidebarOpen}
          onClick={toggleRightSidebar}
          title={rightSidebarOpen ? t('tabs.hideRightPanel', 'Скрыть правую панель') : t('tabs.showRightPanel', 'Показать правую панель')}
          aria-label={rightSidebarOpen ? 'Hide right panel' : 'Show right panel'}
        >
          <PanelRight size={14} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

interface MenuButtonProps {
  menu: MenuDef;
  t: (key: string) => string;
  isOpen: boolean;
  onToggle: () => void;
  onSelectItem: (entry: MenuEntry) => void;
}

function MenuButton({ menu, t, isOpen, onToggle, onSelectItem }: MenuButtonProps): ReactElement {
  return (
    <div style={{ position: 'relative' }}>
      <span
        className="chrome-menu-item"
        data-open={isOpen}
        role="menuitem"
        tabIndex={0}
        onClick={onToggle}
      >
        {t(menu.labelKey)}
      </span>
      {isOpen && (
        <div className="menu-popover" role="menu">
          {menu.entries.map((entry, i) =>
            'separator' in entry ? (
              <div key={`sep-${i}`} className="menu-popover-separator" />
            ) : (
              <div
                key={entry.id}
                className="menu-popover-item"
                role="menuitem"
                data-disabled={entry.disabled === true}
                onClick={() => onSelectItem(entry)}
              >
                <span>{t(entry.labelKey)}</span>
                {entry.hotkey && <span className="menu-popover-shortcut">{entry.hotkey}</span>}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
