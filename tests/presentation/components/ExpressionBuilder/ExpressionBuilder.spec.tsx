import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { ExpressionBuilder } from '../../../../src/presentation/components/ExpressionBuilder';
import en from '../../../../src/renderer/locales/en.json';

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

function wrap(node: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{node}</I18nextProvider>;
}

describe('ExpressionBuilder', () => {
  test('initial value populates textarea', () => {
    render(
      wrap(
        <ExpressionBuilder
          value={{ expr: 'scope_unchanged()' }}
          onChange={vi.fn()}
          context="gate"
        />,
      ),
    );
    const ta = screen.getByTestId('expression-builder-textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('scope_unchanged()');
  });

  test('empty input on blur → onChange called with undefined', () => {
    const onChange = vi.fn();
    render(
      wrap(
        <ExpressionBuilder
          value={{ expr: 'scope_unchanged()' }}
          onChange={onChange}
          context="gate"
        />,
      ),
    );
    const ta = screen.getByTestId('expression-builder-textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '' } });
    fireEvent.blur(ta);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  test('valid expression on blur → onChange with formatted expr', () => {
    const onChange = vi.fn();
    render(
      wrap(<ExpressionBuilder value={undefined} onChange={onChange} context="gate" />),
    );
    const ta = screen.getByTestId('expression-builder-textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "artifact_exists('plan.md')" } });
    fireEvent.blur(ta);
    expect(onChange).toHaveBeenCalledWith({ expr: "artifact_exists('plan.md')" });
  });

  test('parse error shown inline with position', () => {
    render(
      wrap(<ExpressionBuilder value={undefined} onChange={vi.fn()} context="gate" />),
    );
    const ta = screen.getByTestId('expression-builder-textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'foo' } });
    const err = screen.getByTestId('expression-builder-error');
    expect(err.textContent).toMatch(/position/i);
  });

  test('parse error → onChange NOT called on blur', () => {
    const onChange = vi.fn();
    render(
      wrap(<ExpressionBuilder value={undefined} onChange={onChange} context="gate" />),
    );
    const ta = screen.getByTestId('expression-builder-textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'foo' } });
    fireEvent.blur(ta);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('palette button inserts snippet', () => {
    render(
      wrap(<ExpressionBuilder value={undefined} onChange={vi.fn()} context="gate" />),
    );
    const scopeBtn = screen.getByRole('button', { name: 'scope_unchanged()' });
    fireEvent.click(scopeBtn);
    const ta = screen.getByTestId('expression-builder-textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('scope_unchanged()');
  });

  test('palette button appends with AND when text non-empty', () => {
    render(
      wrap(<ExpressionBuilder value={undefined} onChange={vi.fn()} context="gate" />),
    );
    const ta = screen.getByTestId('expression-builder-textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "artifact_exists('x.md')" } });
    const scopeBtn = screen.getByRole('button', { name: 'scope_unchanged()' });
    fireEvent.click(scopeBtn);
    expect(ta.value).toBe("artifact_exists('x.md') AND scope_unchanged()");
  });

  test('palette differs by context — edge_branch shows meta path snippet', () => {
    render(
      wrap(
        <ExpressionBuilder value={undefined} onChange={vi.fn()} context="edge_branch" />,
      ),
    );
    expect(screen.queryByRole('button', { name: 'meta.fix_cycles >= 3' })).not.toBeNull();
  });

  test('palette: gate context does NOT show meta.fix_cycles snippet (the edge-branch one)', () => {
    render(
      wrap(<ExpressionBuilder value={undefined} onChange={vi.fn()} context="gate" />),
    );
    expect(screen.queryByRole('button', { name: 'meta.fix_cycles >= 3' })).toBeNull();
  });
});
