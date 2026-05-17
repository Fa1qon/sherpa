import { type ReactElement } from 'react';
import { usePanelRegistry } from '../../renderer/store/panel_registry';
import styles from './StatusBar.module.css';

export function StatusBar(): ReactElement {
  const getSlot = usePanelRegistry((s) => s.getSlot);
  const leftItems = getSlot('statusbar.left');
  const rightItems = getSlot('statusbar.right');

  return (
    <div className={styles.statusBar} role="status">
      <div className={styles.left}>
        {leftItems.map((c) => {
          const Component = c.component;
          return <Component key={c.id} />;
        })}
      </div>
      <div className={styles.right}>
        {rightItems.map((c) => {
          const Component = c.component;
          return <Component key={c.id} />;
        })}
      </div>
    </div>
  );
}
