// Tools tab — 2-checkbox model (required / forbidden, mutex per tool).
// Plan 7 Task 3. Default = allowed (no IR entry). tools.allowed is preserved
// passthrough — UI does not edit it, but it round-trips unchanged in IR.
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Stage, StageTools } from '../../../../../core/domain/methodology';
import { BUILTIN_TOOLS } from '../../registries/toolsStub';
import styles from '../StageForm.module.css';

export interface ToolsProps {
  readonly stage: Stage;
  readonly onUpdate: (patch: Partial<Stage>) => void;
}

export function Tools({ stage, onUpdate }: ToolsProps): ReactElement {
  const { t } = useTranslation();
  const tools = stage.tools ?? {};
  const required = new Set(tools.required ?? []);
  const forbidden = new Set(tools.forbidden ?? []);
  const allowed = tools.allowed ?? []; // passthrough — preserve unchanged

  function commit(nextRequired: ReadonlySet<string>, nextForbidden: ReadonlySet<string>): void {
    const reqArr = [...nextRequired];
    const fbnArr = [...nextForbidden];
    const next: StageTools = {
      ...(allowed.length > 0 && { allowed }),
      ...(reqArr.length > 0 && { required: reqArr }),
      ...(fbnArr.length > 0 && { forbidden: fbnArr }),
    };
    onUpdate({ tools: Object.keys(next).length > 0 ? next : undefined });
  }

  function setRequired(id: string, on: boolean): void {
    const r = new Set(required);
    const f = new Set(forbidden);
    if (on) {
      r.add(id);
      f.delete(id);
    } else {
      r.delete(id);
    }
    commit(r, f);
  }

  function setForbidden(id: string, on: boolean): void {
    const r = new Set(required);
    const f = new Set(forbidden);
    if (on) {
      f.add(id);
      r.delete(id);
    } else {
      f.delete(id);
    }
    commit(r, f);
  }

  return (
    <div className={styles.toolsTab}>
      <p className={styles.note}>
        {t(
          'library.edit.tools.defaultAllowedNote',
          'All tools are allowed by default. Use the checkboxes to require or forbid specific tools on this stage.',
        )}
      </p>
      <table className={styles.toolsTable}>
        <thead>
          <tr>
            <th></th>
            <th></th>
            <th>{t('library.edit.tools.required', 'required')}</th>
            <th>{t('library.edit.tools.forbidden', 'forbidden')}</th>
          </tr>
        </thead>
        <tbody>
          {BUILTIN_TOOLS.map((tool) => (
            <tr key={tool.id}>
              <td className={styles.toolId}>{t(`tools.builtin.${tool.id}.label`, tool.id)}</td>
              <td className={styles.toolDesc}>{t(`tools.builtin.${tool.id}.desc`, '')}</td>
              <td className={styles.toolCheckCell}>
                <input
                  type="checkbox"
                  checked={required.has(tool.id)}
                  onChange={(e) => setRequired(tool.id, e.target.checked)}
                  data-testid={`tool-${tool.id}-required`}
                  aria-label={t('library.edit.tools.required', 'required')}
                />
              </td>
              <td className={styles.toolCheckCell}>
                <input
                  type="checkbox"
                  checked={forbidden.has(tool.id)}
                  onChange={(e) => setForbidden(tool.id, e.target.checked)}
                  data-testid={`tool-${tool.id}-forbidden`}
                  aria-label={t('library.edit.tools.forbidden', 'forbidden')}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
