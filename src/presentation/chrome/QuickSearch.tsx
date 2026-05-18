import { useEffect, useState, useRef, type ReactElement, type KeyboardEvent } from 'react';
import { useQuickSearch } from '../../renderer/store/quick_search';
import { useProject } from '../../renderer/store/project';
import { useNavigation } from '../../renderer/store/navigation';
import styles from './QuickSearch.module.css';

interface FileEntry {
  relPath: string;
  name: string;
}

async function collectFiles(
  projectPath: string,
  relPath: string,
  acc: FileEntry[],
  depth: number,
): Promise<void> {
  if (depth > 8) return;
  try {
    const entries = await window.sherpa.files.readDir(projectPath, relPath);
    for (const e of entries) {
      if (e.kind === 'file') {
        acc.push({ relPath: e.relPath, name: e.name });
      } else if (e.kind === 'directory') {
        await collectFiles(projectPath, e.relPath, acc, depth + 1);
      }
    }
  } catch {
    // ignore unreadable dirs
  }
}

function filterFiles(files: FileEntry[], query: string): FileEntry[] {
  if (!query.trim()) return files.slice(0, 50);
  const q = query.toLowerCase();
  return files.filter((f) => f.relPath.toLowerCase().includes(q)).slice(0, 50);
}

export function QuickSearch(): ReactElement | null {
  const open = useQuickSearch((s) => s.open);
  const close = useQuickSearch((s) => s.close);
  const project = useProject((s) => s.current);
  const openTab = useNavigation((s) => s.openTab);
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !project) return;
    setQuery('');
    setSelected(0);
    const acc: FileEntry[] = [];
    void collectFiles(project.path, '', acc, 0).then(() => setFiles(acc));
  }, [open, project]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const results = filterFiles(files, query);

  const openFile = (f: FileEntry): void => {
    openTab({ kind: 'file', params: { relPath: f.relPath }, title: f.name });
    close();
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      const f = results[selected];
      if (f) openFile(f);
    }
  };

  return (
    <>
      <div className={styles.backdrop} onClick={close} />
      <div className={styles.modal} role="dialog" aria-label="Quick file search">
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
          onKeyDown={onInputKey}
          placeholder="Поиск файлов… (Ctrl+P)"
          data-testid="quick-search-input"
        />
        <ul className={styles.list} role="listbox">
          {results.map((f, i) => (
            <li
              key={f.relPath}
              role="option"
              aria-selected={i === selected}
              className={i === selected ? styles.itemActive : styles.item}
              onMouseDown={() => openFile(f)}
            >
              <span className={styles.itemName}>{f.name}</span>
              <span className={styles.itemPath}>{f.relPath}</span>
            </li>
          ))}
          {results.length === 0 && (
            <li className={styles.empty}>Файлы не найдены</li>
          )}
        </ul>
      </div>
    </>
  );
}
