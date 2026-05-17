// src/presentation/screens/Library/MethodologyDetail.tsx
import { useCallback, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useMethodology } from '../../../renderer/store/methodology';
import { DagView } from './DagView';
import { EditCanvas } from './EditCanvas';
import { EditToolbar } from './EditToolbar';
import { StageForm } from './StageForm';
import { SidebarResizer } from './SidebarResizer';
import { EdgePopover } from './EdgePopover';
import { ValidationBanner } from './ValidationBanner';
import { validateMethodology, type ValidationResult } from '../../../core/methodology';
import styles from './Library.module.css';

export function MethodologyDetail(): ReactElement {
  const { t } = useTranslation();
  const mode = useMethodology((s) => s.mode);
  const current = useMethodology((s) => s.current);
  const draft = useMethodology((s) => s.draft);
  const dirty = useMethodology((s) => s.dirty);
  const error = useMethodology((s) => s.error);
  const loading = useMethodology((s) => s.loading);
  const past = useMethodology((s) => s.history.past);
  const future = useMethodology((s) => s.history.future);
  const enterEdit = useMethodology((s) => s.enterEdit);
  const exitEdit = useMethodology((s) => s.exitEdit);
  const applyDraft = useMethodology((s) => s.applyDraft);
  const undo = useMethodology((s) => s.undo);
  const redo = useMethodology((s) => s.redo);
  const save = useMethodology((s) => s.save);

  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [selectedEdgeIndex, setSelectedEdgeIndex] = useState<number | null>(null);

  // Plan 7 Task 1 — persisted resizable sidebar width. Read once at mount
  // (lazy initial state), then apply via inline style on the editLayout
  // section so the saved width is honoured the first frame the section
  // mounts (the section is conditional on edit mode, so a useLayoutEffect
  // at the top of this component would not re-run when re-entering edit).
  const layoutRef = useRef<HTMLElement>(null);
  const [savedSidebarW] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem('sherpa.ui.editor.sidebarW');
    } catch {
      return null;
    }
  });
  const editLayoutStyle: CSSProperties | undefined = savedSidebarW
    ? ({ ['--editor-sidebar-w' as string]: savedSidebarW } as CSSProperties)
    : undefined;

  const onToggleMode = useCallback(() => {
    if (mode === 'view') {
      enterEdit();
      setValidation(null);
      setSelectedStageId(null);
      setSelectedEdgeIndex(null);
    } else {
      if (dirty) {
        // eslint-disable-next-line no-alert
        if (!window.confirm(t('library.edit.discardConfirm', 'You have unsaved changes. Discard?'))) return;
      }
      exitEdit();
      setValidation(null);
    }
  }, [mode, dirty, enterEdit, exitEdit, t]);

  const onAutoLayout = useCallback(() => {
    if (!draft) return;
    const { layout: _drop, ...rest } = draft;
    applyDraft({ ...rest });
  }, [draft, applyDraft]);

  const onValidate = useCallback(() => {
    if (!draft) return;
    setValidation(validateMethodology(draft));
  }, [draft]);

  const onDeleteEdge = useCallback(() => {
    if (!draft || selectedEdgeIndex === null) return;
    const nextEdges = draft.edges.filter((_, i) => i !== selectedEdgeIndex);
    applyDraft({ ...draft, edges: nextEdges });
    setSelectedEdgeIndex(null);
  }, [draft, selectedEdgeIndex, applyDraft]);

  if (loading) return <div className={styles.loading}>{t('common.loading')}</div>;
  if (error) return <div className={styles.error}>{error}</div>;
  if (!current) return <div className={styles.empty}>{t('library.pickOne', 'Select a methodology from the list.')}</div>;

  const display = mode === 'edit' && draft ? draft : current;

  return (
    <div className={styles.detailRoot}>
      <header className={styles.detailHeader}>
        <div className={styles.detailHeaderRow}>
          <div className={styles.detailHeaderTitle}>
            <h2>{display.name}</h2>
            <span className={styles.versionBadge}>v{display.version}</span>
          </div>
          <div className={styles.detailHeaderActions}>
          </div>
        </div>
        {display.description && <p>{display.description}</p>}
      </header>

      <EditToolbar
        mode={mode}
        draft={draft}
        dirty={dirty}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onToggleMode={onToggleMode}
        onChange={applyDraft}
        onSave={save}
        onUndo={undo}
        onRedo={redo}
        onValidate={onValidate}
        onAutoLayout={onAutoLayout}
      />

      <ValidationBanner result={validation} />

      {mode === 'edit' && draft && (
        <details style={{ padding: '6px 14px', borderBottom: '1px solid var(--border-default)' }}>
          <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--fg-muted)' }}>
            {t('editor.antiPatterns', 'Anti-patterns (one per line)')}
          </summary>
          <textarea
            rows={3}
            style={{ width: '100%', marginTop: 6, fontSize: 12, boxSizing: 'border-box' }}
            value={(draft.anti_patterns ?? []).join('\n')}
            onChange={(e) =>
              applyDraft({
                ...draft,
                anti_patterns: e.target.value.split('\n').filter(Boolean),
              })
            }
            placeholder={t('editor.antiPatternsPlaceholder', 'Patterns this methodology is NOT suited for...')}
          />
        </details>
      )}

      {mode === 'view' && (
        <section className={styles.canvasContainer}>
          <div className={styles.viewSplit}>
            <div className={styles.viewCanvasWrap}>
              <DagView methodology={current} />
            </div>
          </div>
        </section>
      )}

      {mode === 'edit' && draft && (
        <section className={styles.editLayoutWrap}>
          <section ref={layoutRef} className={styles.editLayout} style={editLayoutStyle}>
            <div className={styles.editCanvasWrap}>
              <EditCanvas
                draft={draft}
                onChange={applyDraft}
                selectedStageId={selectedStageId}
                selectedEdgeIndex={selectedEdgeIndex}
                onSelectStage={setSelectedStageId}
                onSelectEdge={setSelectedEdgeIndex}
              />
              {selectedEdgeIndex !== null && (
                <EdgePopover
                  draft={draft}
                  edgeIndex={selectedEdgeIndex}
                  onChange={applyDraft}
                  onDelete={onDeleteEdge}
                  onClose={() => setSelectedEdgeIndex(null)}
                />
              )}
            </div>
            <aside className={styles.editSidebar}>
              <SidebarResizer rootRef={layoutRef} />
              {selectedStageId && (
                <StageForm draft={draft} stageId={selectedStageId} onChange={applyDraft} />
              )}
            </aside>
          </section>
        </section>
      )}
    </div>
  );
}
