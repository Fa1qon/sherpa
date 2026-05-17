// Reviewers tab — checkbox list from a builtin registry + per-reviewer
// "recommended" star toggle.
// Plan 6 Task 11. Registry is a hardcoded stub until Plan 9 adds plugin
// reviewers.
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReviewerBinding, Stage } from '../../../../../core/domain/methodology';
import { BUILTIN_REVIEWERS } from '../../registries/reviewersStub';
import styles from '../StageForm.module.css';

export interface ReviewersProps {
  readonly stage: Stage;
  readonly onUpdate: (patch: Partial<Stage>) => void;
}

export function Reviewers({ stage, onUpdate }: ReviewersProps): ReactElement {
  const { t } = useTranslation();

  function toggleReviewer(id: string, on: boolean): void {
    const current = stage.reviewers ?? [];
    if (on) {
      if (current.some((b) => b.reviewer_id === id)) return; // already there
      // Default: recommended=false (Task 4 plan; star is unset by default)
      const next: readonly ReviewerBinding[] = [
        ...current,
        { reviewer_id: id, recommended: false },
      ];
      onUpdate({ reviewers: next });
    } else {
      const next = current.filter((b) => b.reviewer_id !== id);
      onUpdate({ reviewers: next.length > 0 ? next : undefined });
    }
  }

  function toggleRecommended(id: string): void {
    const current = stage.reviewers ?? [];
    const next: readonly ReviewerBinding[] = current.map((b) =>
      b.reviewer_id === id ? { ...b, recommended: !(b.recommended === true) } : b,
    );
    onUpdate({ reviewers: next });
  }

  return (
    <div className={styles.reviewersTab}>
      <p className={styles.explainer}>
        {t(
          'library.edit.reviewers.explainer',
          'Reviewers available in the run-time reviewer menu on this stage. Items marked ★ are shown as recommended by default. None auto-run — the user picks from the menu.',
        )}
      </p>
      {BUILTIN_REVIEWERS.map((rev) => {
        const binding = (stage.reviewers ?? []).find((b) => b.reviewer_id === rev.id);
        const selected = !!binding;
        const recommended = binding?.recommended === true;
        const starTitle = t(
          'library.edit.reviewers.recommendedTooltip',
          'Recommended in the run-time menu',
        );
        return (
          <div
            key={rev.id}
            className={styles.reviewerRow}
            data-selected={selected}
            data-testid={`reviewer-row-${rev.id}`}
          >
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={selected}
                onChange={(e) => toggleReviewer(rev.id, e.target.checked)}
                data-testid={`reviewer-${rev.id}`}
              />
              <strong>{t(`reviewers.builtin.${rev.id}.name`, rev.id)}</strong>
              <small>{rev.applicability}</small>
            </label>
            {selected && (
              <button
                type="button"
                className={styles.starButton}
                data-active={recommended}
                onClick={() => toggleRecommended(rev.id)}
                title={starTitle}
                aria-label={starTitle}
                data-testid={`star-${rev.id}`}
              >
                {recommended ? '★' : '☆'}
              </button>
            )}
            <p className={styles.reviewerDesc}>{t(`reviewers.builtin.${rev.id}.desc`, '')}</p>
          </div>
        );
      })}
    </div>
  );
}
