// src/presentation/screens/Tracker/BoardSettings.tsx
import { useState, useRef, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../../renderer/store/project';
import { useTracker } from '../../../renderer/store/tracker';
import type { Stage, StageCategory } from '../../../core/domain/tracker';
import styles from './BoardSettings.module.css';

interface BoardSettingsProps {
  readonly onClose: () => void;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function BoardSettings({ onClose }: BoardSettingsProps): ReactElement {
  const { t } = useTranslation();
  const project = useProject((s) => s.current);
  const boardConfig = useTracker((s) => s.boardConfig);
  const setBoardConfig = useTracker((s) => s.setBoardConfig);

  const [stages, setStages] = useState<Stage[]>(
    () => (boardConfig?.stages ? [...boardConfig.stages].sort((a, b) => a.order - b.order) : []),
  );

  const handleNameChange = (id: string, name: string): void => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  };

  const handleColorChange = (id: string, color: string): void => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, color } : s)));
  };

  const handleCategoryChange = (id: string, category: StageCategory): void => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, category } : s)));
  };

  const handleRemove = (id: string): void => {
    setStages((prev) => prev.filter((s) => s.id !== id));
  };

  const handleAdd = (): void => {
    const newStage: Stage = {
      id: randomId(),
      name: t('tracker.settings.newStage', 'New Stage'),
      category: 'active',
      order: stages.length,
    };
    setStages((prev) => [...prev, newStage]);
  };

  const handleSave = async (): Promise<void> => {
    if (!project || !boardConfig) return;
    const reordered = stages.map((s, i) => ({ ...s, order: i }));
    await setBoardConfig(project.path, { ...boardConfig, stages: reordered });
    onClose();
  };

  const CATEGORIES: StageCategory[] = ['backlog', 'active', 'done', 'cancelled'];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} data-testid="board-settings-dialog">
        <div className={styles.header}>
          <span className={styles.title}>{t('tracker.settings.title', 'Board Settings')}</span>
          <button type="button" className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionTitle}>{t('tracker.settings.stages', 'Stages')}</span>
          {stages.map((stage) => (
            <StageRow
              key={stage.id}
              stage={stage}
              categories={CATEGORIES}
              onNameChange={(v) => handleNameChange(stage.id, v)}
              onColorChange={(v) => handleColorChange(stage.id, v)}
              onCategoryChange={(v) => handleCategoryChange(stage.id, v)}
              onRemove={() => handleRemove(stage.id)}
            />
          ))}
          <button type="button" className={styles.addBtn} onClick={handleAdd} data-testid="add-stage-btn">
            + {t('tracker.settings.addStage', 'Add stage')}
          </button>
        </div>

        <button type="button" className={styles.saveBtn} onClick={() => void handleSave()} data-testid="save-board-settings-btn">
          {t('common.save', 'Save')}
        </button>
      </div>
    </div>
  );
}

interface StageRowProps {
  stage: Stage;
  categories: StageCategory[];
  onNameChange(v: string): void;
  onColorChange(v: string): void;
  onCategoryChange(v: StageCategory): void;
  onRemove(): void;
}

function StageRow({ stage, categories, onNameChange, onColorChange, onCategoryChange, onRemove }: StageRowProps): ReactElement {
  const colorRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.stageRow} data-testid={`stage-row-${stage.id}`}>
      <div
        className={styles.colorDot}
        style={{ background: stage.color ?? '#888' }}
        onClick={() => colorRef.current?.click()}
        title="Pick colour"
      />
      <input
        ref={colorRef}
        type="color"
        className={styles.colorInput}
        value={stage.color ?? '#888888'}
        onChange={(e) => onColorChange(e.target.value)}
      />
      <input
        className={styles.stageInput}
        value={stage.name}
        onChange={(e) => onNameChange(e.target.value)}
        data-testid={`stage-name-input-${stage.id}`}
      />
      <select
        className={styles.categorySelect}
        value={stage.category}
        onChange={(e) => onCategoryChange(e.target.value as StageCategory)}
      >
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button type="button" className={styles.removeBtn} onClick={onRemove}>×</button>
    </div>
  );
}
