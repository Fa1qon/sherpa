import { type ReactElement } from 'react';
import type { ViewerProps } from '../viewer_registry';
import { MarkmapBlock } from './MarkmapBlock';
import { parseFrontmatter } from './frontmatter';
import styles from './MarkmapBlock.module.css';

export function MarkmapViewer({ content }: ViewerProps): ReactElement {
  const { body } = parseFrontmatter(content);
  return (
    <div className={styles.standaloneWrapper}>
      <MarkmapBlock source={body} />
    </div>
  );
}
