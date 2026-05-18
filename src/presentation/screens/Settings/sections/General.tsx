// src/presentation/screens/Settings/sections/General.tsx
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../../../renderer/store/settings';

export function General(): ReactElement {
  const { t } = useTranslation();
  const cli = useSettings((s) => s.user.defaultAgentCli);
  const setCli = useSettings((s) => s.setDefaultAgentCli);

  return (
    <section>
      <h3>{t('settings.section.general')}</h3>
      <div style={{ marginTop: 16 }}>
        <label>{t('settings.general.defaultAgentCli')}</label>
        <div role="radiogroup" style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {(['claude-code', 'codex', 'opencode', 'gemini', 'goose', 'amp', 'cursor', 'copilot', 'pi', 'qwen-code', 'kimi', 'aider'] as const).map((opt) => (
            <button
              key={opt}
              data-active={cli === opt}
              onClick={() => setCli(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
