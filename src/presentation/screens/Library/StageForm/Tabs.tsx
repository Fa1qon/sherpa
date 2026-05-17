// Tabs.tsx — minimal tabbed container, no external library.
import { useState, type ReactElement, type ReactNode } from 'react';
import styles from './StageForm.module.css';

export interface TabDef {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
  readonly badge?: number | string;
}

export function Tabs({
  tabs,
  initialId,
}: {
  tabs: readonly TabDef[];
  initialId?: string;
}): ReactElement {
  const [active, setActive] = useState(initialId ?? tabs[0]?.id ?? '');
  return (
    <div className={styles.tabsRoot}>
      <div className={styles.tabBar} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={styles.tabButton}
            data-active={active === t.id}
            onClick={() => setActive(t.id)}
          >
            {t.label}
            {t.badge != null && <span className={styles.tabBadge}>{t.badge}</span>}
          </button>
        ))}
      </div>
      <div className={styles.tabPanel} role="tabpanel">
        {tabs.find((t) => t.id === active)?.content}
      </div>
    </div>
  );
}
