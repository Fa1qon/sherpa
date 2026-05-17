import type { ReactElement } from 'react';
import { useProject } from '../../renderer/store/project';
import styles from './StatusItems.module.css';

export function ProjectDisplay(): ReactElement | null {
  const current = useProject((s) => s.current);
  if (!current) return null;
  const name = current.path.split(/[\\/]/).pop() ?? current.path;
  return <span className={styles.item} title={current.path}>{name}</span>;
}
