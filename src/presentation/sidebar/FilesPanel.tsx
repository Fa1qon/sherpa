import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useFiles } from '../../renderer/store/files';
import { useNavigation } from '../../renderer/store/navigation';
import { useProject } from '../../renderer/store/project';
import { useTask } from '../../renderer/store/task';
import { useChatAttach } from '../../renderer/store/chat_attach';
import type { DirEntry } from '../../core/ports/files_port';
import { getFileType } from '../fileviewer/fileType';
import styles from './FilesPanel.module.css';
import { FileIcon } from './FileIcons';

interface CtxMenu {
  entry: DirEntry;
  x: number;
  y: number;
}

export function FilesPanel(): ReactElement {
  const { t } = useTranslation();
  const project = useProject((s) => s.current);
  const projectPath = useFiles((s) => s.projectPath);
  const setProjectPath = useFiles((s) => s.setProjectPath);
  const loadDir = useFiles((s) => s.loadDir);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  useEffect(() => {
    if (!project) return;
    if (projectPath !== project.path) {
      setProjectPath(project.path);
      void loadDir('');
    }
  }, [project, projectPath, setProjectPath, loadDir]);

  // Close context menu on outside mousedown
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (): void => setCtxMenu(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

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
        <DirChildren relPath="" depth={0} onCtx={setCtxMenu} />
      </div>
      {ctxMenu && (
        <FileContextMenu
          menu={ctxMenu}
          projectPath={project.path}
          onClose={() => setCtxMenu(null)}
        />
      )}
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

function DirChildren({
  relPath,
  depth,
  onCtx,
}: {
  relPath: string;
  depth: number;
  onCtx: (menu: CtxMenu) => void;
}): ReactElement | null {
  const entries = useFiles((s) => s.tree.get(relPath));
  if (!entries) return null;
  return (
    <>
      {entries.map((e) => (
        <Node key={e.relPath} entry={e} depth={depth} onCtx={onCtx} />
      ))}
    </>
  );
}

function Node({
  entry,
  depth,
  onCtx,
}: {
  entry: DirEntry;
  depth: number;
  onCtx: (menu: CtxMenu) => void;
}): ReactElement {
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

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    onCtx({ entry, x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <button
        type="button"
        className={styles.node}
        data-kind={entry.kind}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable={isFile}
        onDragStart={(e) => {
          if (!isFile) return;
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('sherpa/relPath', entry.relPath);
        }}
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
        <DirChildren relPath={entry.relPath} depth={depth + 1} onCtx={onCtx} />
      )}
    </>
  );
}

function FileContextMenu({
  menu,
  projectPath,
  onClose,
}: {
  menu: CtxMenu;
  projectPath: string;
  onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { entry } = menu;
  const openTab = useNavigation((s) => s.openTab);
  const currentTask = useTask((s) => s.current);
  const isFile = entry.kind === 'file';
  const ext = isFile ? extOf(entry.name) : '';
  const isTextFile = isFile && getFileType(ext) !== 'binary';

  const handleOpen = (): void => {
    openTab({ kind: 'file', params: { relPath: entry.relPath }, title: entry.name });
    onClose();
  };

  const handleCopyPath = (): void => {
    void navigator.clipboard.writeText(entry.relPath);
    onClose();
  };

  const handleSendToChat = (): void => {
    void (async () => {
      try {
        const content = await window.sherpa.files.readFile(projectPath, entry.relPath);
        const block = `\`\`\`${ext || entry.name}\n${content}\n\`\`\``;
        useChatAttach.getState().setPending(block);
      } catch {
        // silently ignore read errors
      }
      onClose();
    })();
  };

  return (
    <div
      className={styles.ctxMenu}
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {isTextFile && (
        <button type="button" className={styles.ctxItem} onClick={handleOpen}>
          {t('files.ctx.open', 'Открыть')}
        </button>
      )}
      <button type="button" className={styles.ctxItem} onClick={handleCopyPath}>
        {t('files.ctx.copyPath', 'Копировать путь')}
      </button>
      {isTextFile && currentTask && (
        <button type="button" className={styles.ctxItem} onClick={handleSendToChat}>
          {t('files.ctx.sendToChat', 'Отправить в чат')}
        </button>
      )}
    </div>
  );
}

function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx <= 0 || idx === name.length - 1) return '';
  return name.slice(idx + 1).toLowerCase();
}
