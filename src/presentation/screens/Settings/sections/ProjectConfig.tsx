// src/presentation/screens/Settings/sections/ProjectConfig.tsx
import { useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../../../renderer/store/project';
import { useSettings } from '../../../../renderer/store/settings';
import type { PermissionMode } from '../../../../core/domain/settings';
import { defaultProjectSettings } from '../../../../core/domain/settings';
import type { EffortLevel } from '../../../../core/domain/task';

export function ProjectConfig(): ReactElement {
  const { t } = useTranslation();
  const projectPath = useProject((s) => s.current?.path ?? null);
  const projectName = useProject((s) => s.current?.name ?? null);
  const ps = useSettings((s) => s.projectSettings);
  const loadProject = useSettings((s) => s.loadProject);
  const saveProject = useSettings((s) => s.saveProject);

  useEffect(() => {
    if (projectPath) void loadProject(projectPath);
  }, [projectPath, loadProject]);

  if (!projectPath || !projectName) {
    return <p style={{ color: 'var(--fg-muted)', marginTop: 16 }}>{t('settings.project.noProject')}</p>;
  }

  const settings = ps ?? defaultProjectSettings();

  const save = (patch: Partial<typeof settings>): void => {
    void saveProject(projectPath, { ...settings, ...patch });
  };

  return (
    <section>
      <h3>{projectName}</h3>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>{t('settings.project.permissionMode')}</span>
          <select
            value={settings.permissionMode ?? 'bypass'}
            onChange={(e) => save({ permissionMode: e.target.value as PermissionMode })}
          >
            <option value="bypass">{t('settings.project.permissionMode.bypass')}</option>
            <option value="acceptEdits">{t('settings.project.permissionMode.acceptEdits')}</option>
            <option value="auto">{t('settings.project.permissionMode.auto')}</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>{t('settings.project.defaultEffort')}</span>
          <select
            value={settings.defaultEffort ?? 'normal'}
            onChange={(e) => save({ defaultEffort: e.target.value as EffortLevel })}
          >
            <option value="fast">Fast (Haiku)</option>
            <option value="normal">Normal (Sonnet)</option>
            <option value="thorough">Thorough (Opus)</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.allowOutsideProjectAccess ?? false}
            onChange={(e) => save({ allowOutsideProjectAccess: e.target.checked })}
          />
          <span>{t('settings.project.allowOutsideProjectAccess')}</span>
        </label>
      </div>
    </section>
  );
}
