// src/presentation/screens/Library/EditToolbar.tsx
import { useEffect, useCallback, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Methodology, Stage } from '../../../core/domain/methodology';
import { validateMethodology } from '../../../core/methodology';

interface Props {
  mode: 'view' | 'edit';
  draft: Methodology | null;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToggleMode: () => void;
  onChange: (next: Methodology) => void;
  onSave: () => Promise<void>;
  onUndo: () => void;
  onRedo: () => void;
  onValidate: () => void;
  onAutoLayout: () => void;
}

function nextStageId(stages: readonly Stage[]): string {
  for (let i = 1; i < 10000; i++) {
    const id = `stage_${i}`;
    if (!stages.some((s) => s.id === id)) return id;
  }
  return `stage_${Date.now()}`;
}

export function EditToolbar(props: Props): ReactElement {
  const { t } = useTranslation();

  const validation = props.draft ? validateMethodology(props.draft) : { ok: true as const };
  const saveDisabled = !validation.ok || !props.dirty;

  const addStage = useCallback(() => {
    if (!props.draft) return;
    const id = nextStageId(props.draft.stages);
    const stage: Stage = {
      id,
      name: `Stage ${id.replace('stage_', '')}`,
      mode: 'auto',
      contract: { input: [], output: { path: `${id}.md` } },
    };
    props.onChange({ ...props.draft, stages: [...props.draft.stages, stage] });
  }, [props]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (!saveDisabled) void props.onSave();
      } else if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        if (props.canUndo) props.onUndo();
      } else if ((e.key === 'z' || e.key === 'Z') && e.shiftKey) {
        e.preventDefault();
        if (props.canRedo) props.onRedo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props, saveDisabled]);

  return (
    <div
      data-testid="edit-toolbar"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', borderBottom: '1px solid var(--border-default)',
      }}
    >
      <div style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
        <button
          onClick={() => props.mode === 'edit' && props.onToggleMode()}
          data-active={props.mode === 'view'}
          style={{
            padding: '4px 10px', fontSize: 12, cursor: 'pointer',
            background: props.mode === 'view' ? 'var(--bg-pressed)' : 'transparent',
            border: 'none', color: 'var(--fg-default)',
          }}
        >{t('library.mode.view', 'View')}</button>
        <button
          onClick={() => props.mode === 'view' && props.onToggleMode()}
          data-active={props.mode === 'edit'}
          style={{
            padding: '4px 10px', fontSize: 12, cursor: 'pointer',
            background: props.mode === 'edit' ? 'var(--bg-pressed)' : 'transparent',
            border: 'none', color: 'var(--fg-default)',
          }}
        >{t('library.mode.edit', 'Edit')}</button>
      </div>

      {props.mode === 'edit' && (
        <>
          <span style={{ flex: 1 }} />
          <button onClick={props.onUndo} disabled={!props.canUndo} title="⌘Z">{t('library.edit.undo', 'Undo')}</button>
          <button onClick={props.onRedo} disabled={!props.canRedo} title="⌘⇧Z">{t('library.edit.redo', 'Redo')}</button>
          <button onClick={addStage}>{t('library.edit.addStage', '+ Stage')}</button>
          <button onClick={props.onAutoLayout}>{t('library.edit.autoLayout', 'Auto-layout')}</button>
          <button onClick={props.onValidate}>{t('library.edit.validate', 'Validate')}</button>
          <button
            onClick={() => { void props.onSave(); }}
            disabled={saveDisabled}
            title="⌘S"
            style={{
              background: !saveDisabled ? 'var(--accent)' : undefined,
              color: !saveDisabled ? '#fff' : undefined,
            }}
          >{t('library.edit.save', 'Save')}{props.dirty ? ' •' : ''}</button>
        </>
      )}
    </div>
  );
}
