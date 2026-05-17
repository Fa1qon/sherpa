// src/presentation/screens/Library/ValidationBanner.tsx
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ValidationResult } from '../../../core/methodology';

export function ValidationBanner({ result }: { result: ValidationResult | null }): ReactElement | null {
  const { t } = useTranslation();
  if (!result || result.ok) return null;
  return (
    <div
      data-testid="validation-banner"
      style={{
        background: 'var(--error)',
        color: '#fff',
        padding: '6px 12px',
        fontSize: 12,
      }}
    >
      <strong>{t('library.edit.validationFailed', 'Validation failed')}:</strong>
      <ul style={{ marginTop: 4, paddingLeft: 16 }}>
        {result.errors.map((e, i) => (<li key={i}>{e}</li>))}
      </ul>
    </div>
  );
}
