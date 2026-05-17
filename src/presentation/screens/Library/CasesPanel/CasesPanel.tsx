import { useState, useEffect, useCallback, type ReactElement } from 'react';
import type { Case } from '../../../../core/domain/case';
import { useAppEvent } from '../../../../renderer/hooks/useAppEvent';
import styles from './CasesPanel.module.css';

type SearchMode = 'unified' | 'fts' | 'vec';

interface Props {
  projectPath: string;
}

const EMPTY_FORM = {
  title: '',
  summary: '',
  content: '',
  tags: '',
  confidence: 'medium' as Case['confidence'],
};

export function CasesPanel({ projectPath }: Props): ReactElement {
  const [cases, setCases] = useState<Case[]>([]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('unified');
  const [results, setResults] = useState<Case[] | null>(null);
  const [selected, setSelected] = useState<Case | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [vecHint, setVecHint] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!projectPath) { setLoadError('No project open'); return; }
    try {
      const all = await window.sherpa.cases.list(projectPath);
      setCases(all as Case[]);
      setLoadError(null);
    } catch (err) {
      setLoadError(String(err));
      console.error('[CasesPanel] list failed, projectPath=%s', projectPath, err);
    }
  }, [projectPath]);

  useEffect(() => { void reload(); }, [reload]);

  // Auto-reload when cases change via the event bus.
  useAppEvent('case.changed', (ev) => {
    if (ev.projectPath === projectPath) void reload();
  });

  async function handleSearch() {
    if (!query.trim()) { setResults(null); return; }
    if (mode === 'fts') {
      const r = await window.sherpa.cases.ftsSearch(projectPath, query);
      setResults(r as Case[]);
    } else if (mode === 'vec') {
      setVecHint('Initializing vector model…');
      try {
        const r = await window.sherpa.cases.vectorSearch(projectPath, query, 10);
        setResults(r as Case[]);
        setVecHint('');
      } catch {
        setVecHint('Vector search failed. Try text mode.');
      }
    } else {
      setVecHint('Searching…');
      try {
        const r = await window.sherpa.cases.unifiedSearch(projectPath, query, 10);
        setResults(r as Case[]);
        setVecHint('');
      } catch {
        setVecHint('Search failed.');
      }
    }
  }

  async function handleCreate() {
    if (!form.title.trim()) return;
    await window.sherpa.cases.create(projectPath, {
      title: form.title,
      summary: form.summary,
      content: form.content,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      confidence: form.confidence,
    });
    setCreating(false);
    setForm(EMPTY_FORM);
    await reload();
  }

  async function handleDelete(id: string) {
    await window.sherpa.cases.delete(projectPath, id);
    if (selected?.id === id) setSelected(null);
    await reload();
  }

  const displayList = results ?? cases;

  return (
    <div className={styles.root}>
      {/* Search bar */}
      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder="Search cases…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
        />
        <button
          className={mode === 'unified' ? styles.modeActive : styles.mode}
          onClick={() => setMode('unified')}
        >
          Unified
        </button>
        <button
          className={mode === 'fts' ? styles.modeActive : styles.mode}
          onClick={() => setMode('fts')}
        >
          Text
        </button>
        <button
          className={mode === 'vec' ? styles.modeActive : styles.mode}
          onClick={() => setMode('vec')}
        >
          Vector
        </button>
        <button onClick={() => void handleSearch()} className={styles.searchBtn}>
          Search
        </button>
        <button onClick={() => { setCreating(true); setSelected(null); }} className={styles.newBtn}>
          New case
        </button>
      </div>
      {vecHint && <p className={styles.hint}>{vecHint}</p>}
      {loadError && (
        <p className={styles.hint} style={{ color: 'salmon' }}>
          Error: {loadError} (path: {projectPath || '<empty>'})
        </p>
      )}

      <div className={styles.body}>
        {/* Results / list */}
        <div className={styles.list}>
          {displayList.length === 0 && (
            <p className={styles.empty}>{cases.length === 0 ? 'No cases yet.' : 'No cases found.'}</p>
          )}
          {displayList.map((c) => (
            <div
              key={c.id}
              className={`${styles.item} ${selected?.id === c.id ? styles.itemActive : ''}`}
              onClick={() => { setSelected(c); setCreating(false); }}
            >
              <strong>{c.title}</strong>
              {c.summary && <p className={styles.summary}>{c.summary}</p>}
              {c.tags.length > 0 && (
                <div className={styles.tags}>
                  {c.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Editor / preview */}
        <div className={styles.editor}>
          {creating && (
            <div className={styles.form}>
              <label>Title *
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </label>
              <label>Summary
                <input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
              </label>
              <label>Content (markdown)
                <textarea rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              </label>
              <label>Tags (comma-separated)
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </label>
              <label>Confidence
                <select value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value as Case['confidence'] })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <div className={styles.actions}>
                <button onClick={() => void handleCreate()} disabled={!form.title.trim()}>Save</button>
                <button onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          )}
          {selected && !creating && (
            <div className={styles.preview}>
              <h3>{selected.title}</h3>
              {selected.summary && <p className={styles.previewSummary}>{selected.summary}</p>}
              <pre className={styles.previewContent}>{selected.content}</pre>
              {selected.tags.length > 0 && (
                <div className={styles.tags}>
                  {selected.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                </div>
              )}
              <div className={styles.actions}>
                <button onClick={() => void handleDelete(selected.id)} className={styles.deleteBtn}>
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
