// src/presentation/screens/Library/NewMethodologyDialog.tsx
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Methodology } from '../../../core/domain/methodology';
import { useProject } from '../../../renderer/store/project';
import { useMethodology } from '../../../renderer/store/methodology';

interface Props {
  onClose: () => void;
}

function starterMethodology(id: string, name: string): Methodology {
  return {
    id,
    version: '0.1.0',
    name,
    description: '',
    stages: [
      {
        id: 'stage_1', name: 'Stage 1', mode: 'auto',
        contract: { input: [], output: { path: 'stage_1.md' } },
      },
    ],
    edges: [
      { from: 'start', to: 'stage_1', condition: { kind: 'always' } },
      { from: 'stage_1', to: 'end', condition: { kind: 'always' } },
    ],
  };
}

export function NewMethodologyDialog({ onClose }: Props): ReactElement {
  const { t } = useTranslation();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const project = useProject((s) => s.current);
  const refresh = useMethodology((s) => s.refresh);
  const select = useMethodology((s) => s.select);
  const enterEdit = useMethodology((s) => s.enterEdit);

  const canCreate = id.trim().length > 0 && /^[a-z0-9_]+$/i.test(id.trim()) && !!project;

  const create = async (): Promise<void> => {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const m = starterMethodology(id.trim(), name.trim() || id.trim());
      await window.sherpa.methodology.save(project.path, m);
      await refresh();
      await select(m.id);
      enterEdit();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="new-methodology-dialog"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-elevated)', padding: 20, borderRadius: 6,
        minWidth: 360, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <h3>{t('library.edit.newDialog.title', 'New methodology')}</h3>

        <label style={{ fontSize: 12 }}>
          {t('library.edit.newDialog.id', 'id (slug)')}
          <input value={id} onChange={(e) => setId(e.target.value)} style={{ width: '100%' }} autoFocus />
        </label>

        <label style={{ fontSize: 12 }}>
          {t('library.edit.newDialog.name', 'name')}
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
        </label>

        {error && <div style={{ color: 'var(--error)', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy}>{t('library.edit.newDialog.cancel', 'Cancel')}</button>
          <button onClick={() => { void create(); }} disabled={!canCreate || busy}>
            {t('library.edit.newDialog.create', 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}
