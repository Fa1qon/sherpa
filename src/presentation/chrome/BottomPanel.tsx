import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useBottomPanel } from '../../renderer/store/bottom_panel';
import { Splitter } from './Splitter';
import styles from './BottomPanel.module.css';

export function BottomPanel(): ReactElement | null {
  const isOpen = useBottomPanel((s) => s.isOpen);
  const height = useBottomPanel((s) => s.height);
  const setHeight = useBottomPanel((s) => s.setHeight);
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <>
      <Splitter
        direction="horizontal"
        onResize={(delta) => setHeight(height - delta)}
      />
      <div className={styles.panel} style={{ height }}>
        <div className={styles.empty}>{t('bottomPanel.empty', 'Нижняя панель')}</div>
      </div>
    </>
  );
}
