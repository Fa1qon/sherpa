import { useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useFiles } from '../../renderer/store/files';
import { useNavigation } from '../../renderer/store/navigation';
import { useProject } from '../../renderer/store/project';
import type { DirEntry } from '../../core/ports/files_port';
import { getFileType } from '../fileviewer/fileType';
import styles from './FilesPanel.module.css';
import { FileIcon } from './FileIcons';

export function FilesPanel(): ReactElement {
  const { t } = useTranslation();
  const project = useProject((s) => s.current);
  const projectPath = useFiles((s) => s.projectPath);
  const setProjectPath = useFiles((s) => s.setProjectPath);
  const loadDir = useFiles((s) => s.loadDir);

  useEffect(() => {
    if (!project) return;
    if (projectPath !== project.path) {
      setProjectPath(project.path);
      void loadDir('');
    }
  }, [project, projectPath, setProjectPath, loadDir]);

  if (!project) {
    return <div className={styles.empty}>{t('sidebar.noProject')}</div>;
  }
  return (
    <div className={styles.panel}>
      <header className={styles.projectHeader} title={project.path}>
        <span className={styles.projectName}>{project.name}</span>
        <span className={styles.projectPath}>{shortPath(project.path)}</span>
      </header>
      <div className={styles.tree}>
        <DirChildren relPath="" depth={0} />
      </div>
    </div>
  );
}

function shortPath(p: string): string {
  // Compact "C:\Users\fa1qon\very\long\path" → "…/long/path" for the header
  // subtitle. Full path stays in the title attribute on hover.
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 2) return p;
  return `…/${parts.slice(-2).join('/')}`;
}

function DirChildren({ relPath, depth }: { relPath: string; depth: number }): ReactElement | null {
  const entries = useFiles((s) => s.tree.get(relPath));
  if (!entries) return null;
  return (
    <>
      {entries.map((e) => (
        <Node key={e.relPath} entry={e} depth={depth} />
      ))}
    </>
  );
}

function Node({ entry, depth }: { entry: DirEntry; depth: number }): ReactElement {
  const expanded = useFiles((s) => s.expanded.has(entry.relPath));
  const toggle = useFiles((s) => s.toggle);
  const openTab = useNavigation((s) => s.openTab);
  const isFile = entry.kind === 'file';
  const ext = isFile ? extOf(entry.name) : '';

  const handleClick = (): void => {
    if (entry.kind === 'directory') {
      void toggle(entry.relPath);
    } else {
      if (getFileType(ext) === 'binary') return;
      openTab({ kind: 'file', params: { relPath: entry.relPath }, title: entry.name });
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.node}
        data-kind={entry.kind}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={handleClick}
      >
        {entry.kind === 'directory' ? (
          <span className={styles.chevron} aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        ) : (
          <span className={styles.chevronSpacer} aria-hidden="true" />
        )}
        <span className={styles.icon} aria-hidden="true">
          <FileIcon entry={entry} expanded={expanded} />
        </span>
        <span className={styles.name}>{entry.name}</span>
        {ext && <span className={styles.extChip} aria-hidden="true">{ext}</span>}
      </button>
      {entry.kind === 'directory' && expanded && (
        <DirChildren relPath={entry.relPath} depth={depth + 1} />
      )}
    </>
  );
}

function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx <= 0 || idx === name.length - 1) return '';
  return name.slice(idx + 1).toLowerCase();
}
