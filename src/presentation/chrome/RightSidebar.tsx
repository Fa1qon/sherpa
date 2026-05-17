import { Component, type ReactElement, type ReactNode, type ErrorInfo } from 'react';
import { usePanelRegistry } from '../../renderer/store/panel_registry';
import { useRightSidebar } from '../../renderer/store/right_sidebar';
import { useNavigation } from '../../renderer/store/navigation';
import { Splitter } from './Splitter';
import styles from './RightSidebar.module.css';

// Catches render errors in individual panels so one broken panel
// can't unmount the entire React tree.
interface PanelErrorBoundaryProps {
  panelId: string;
  children: ReactNode;
}
interface PanelErrorBoundaryState {
  error: Error | null;
}
class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[RightSidebar] Panel "${this.props.panelId}" crashed:`, error, info);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 10, fontSize: 11, color: 'var(--fg-error, #e05252)', wordBreak: 'break-word' }}>
          Panel error: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export function RightSidebar(): ReactElement | null {
  const isOpen = useRightSidebar((s) => s.isOpen);
  const width = useRightSidebar((s) => s.width);
  const collapsedSections = useRightSidebar((s) => s.collapsedSections);
  const toggleSection = useRightSidebar((s) => s.toggleSection);
  const setWidth = useRightSidebar((s) => s.setWidth);
  const toggle = useRightSidebar((s) => s.toggle);

  const activeTabId = useNavigation((s) => s.activeTabId);
  const tabs = useNavigation((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeKind = activeTab?.kind ?? null;

  const getSlot = usePanelRegistry((s) => s.getSlot);
  const contributions = activeKind ? getSlot(`sidebar.right:${activeKind}`) : [];

  if (contributions.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      {isOpen && (
        <Splitter onResize={(delta) => setWidth(width - delta)} />
      )}
      {isOpen ? (
        <aside className={styles.sidebar} style={{ width }}>
          {contributions.map((c) => {
            const isCollapsed = collapsedSections.has(c.id);
            const Component = c.component;
            const headerContribs = getSlot(`panel.header:${c.id}`);
            return (
              <div key={c.id} className={styles.section}>
                <div className={styles.sectionHeader}>
                  <button
                    type="button"
                    className={styles.sectionToggle}
                    onClick={() => toggleSection(c.id)}
                  >
                    <span className={styles.chevron} data-collapsed={isCollapsed}>›</span>
                    <span className={styles.sectionTitle}>{c.title ?? c.id}</span>
                  </button>
                  {headerContribs.length > 0 && (
                    <div className={styles.sectionActions}>
                      {headerContribs.map((hc) => {
                        const HC = hc.component;
                        return <HC key={hc.id} />;
                      })}
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <div className={styles.sectionBody}>
                    <PanelErrorBoundary panelId={c.id}>
                      <Component />
                    </PanelErrorBoundary>
                  </div>
                )}
              </div>
            );
          })}
        </aside>
      ) : (
        <div
          className={styles.toggleHandle}
          onClick={toggle}
          role="button"
          tabIndex={0}
          aria-label="Open right panel"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(); }}
        >
          ‹
        </div>
      )}
    </div>
  );
}
