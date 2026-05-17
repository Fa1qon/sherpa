// StageForm container — tabbed editor for a single Stage.
// All 8 tabs (General, Prompt, I/O, Tools, Reviewers, Gate, Phases, Stuck)
// are fully wired (Plan 6 Tasks 7-13 + Plan 7 Task 10).
import { useCallback, type ReactElement } from 'react';
import type { Methodology, Stage } from '../../../../core/domain/methodology';
import { Tabs } from './Tabs';
import { General } from './tabs/General';
import { Prompt } from './tabs/Prompt';
import { IO } from './tabs/IO';
import { Tools } from './tabs/Tools';
import { Reviewers } from './tabs/Reviewers';
import { GateTab } from './tabs/Gate';
import { Phases } from './tabs/Phases';
import { Stuck } from './tabs/Stuck';
import styles from './StageForm.module.css';

interface Props {
  draft: Methodology;
  stageId: string;
  onChange: (next: Methodology) => void;
}

export function StageForm({ draft, stageId, onChange }: Props): ReactElement | null {
  const stage = draft.stages.find((s) => s.id === stageId);

  const update = useCallback(
    (patch: Partial<Stage>) => {
      if (!stage) return;
      const next: Methodology = {
        ...draft,
        stages: draft.stages.map((s) => (s.id === stageId ? { ...s, ...patch } : s)),
      };
      onChange(next);
    },
    [draft, stage, stageId, onChange],
  );

  if (!stage) return null;

  return (
    <form
      data-testid="stage-form"
      className={styles.root}
      onSubmit={(e) => e.preventDefault()}
    >
      <Tabs
        tabs={[
          {
            id: 'general',
            label: 'General',
            content: <General stage={stage} onUpdate={update} />,
          },
          {
            id: 'prompt',
            label: 'Prompt',
            content: <Prompt stage={stage} onUpdate={update} />,
          },
          {
            id: 'io',
            label: 'I/O',
            content: <IO stage={stage} draft={draft} onUpdate={update} />,
          },
          {
            id: 'tools',
            label: 'Tools',
            content: <Tools stage={stage} onUpdate={update} />,
          },
          {
            id: 'reviewers',
            label: 'Reviewers',
            content: <Reviewers stage={stage} onUpdate={update} />,
          },
          {
            id: 'gate',
            label: 'Gate',
            content: <GateTab stage={stage} onUpdate={update} />,
          },
          {
            id: 'phases',
            label: 'Phases',
            content: <Phases stage={stage} draft={draft} onUpdate={update} />,
          },
          {
            id: 'stuck',
            label: 'Stuck',
            content: <Stuck stage={stage} onUpdate={update} />,
          },
        ]}
      />
    </form>
  );
}
