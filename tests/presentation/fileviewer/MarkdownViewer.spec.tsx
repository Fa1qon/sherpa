import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { MarkdownViewer } from '../../../src/presentation/fileviewer/MarkdownViewer';
import en from '../../../src/renderer/locales/en.json';

vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea data-testid="codemirror" value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });

const wrap = (ui: React.ReactElement) => <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;

const onSave = vi.fn();

beforeEach(() => vi.clearAllMocks());

describe('MarkdownViewer', () => {
  test('renders markdown in view mode by default', () => {
    render(wrap(<MarkdownViewer content="# Hello" ext="md" projectPath="/p" relPath="README.md" onSave={onSave} />));
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });

  test('switches to edit mode on Edit button click', () => {
    render(wrap(<MarkdownViewer content="# Hello" ext="md" projectPath="/p" relPath="README.md" onSave={onSave} />));
    fireEvent.click(screen.getByRole('button', { name: /edit|редакт/i }));
    expect(screen.getByTestId('codemirror')).toBeTruthy();
  });

  test('Save button calls onSave with edited content', () => {
    render(wrap(<MarkdownViewer content="original" ext="md" projectPath="/p" relPath="README.md" onSave={onSave} />));
    fireEvent.click(screen.getByRole('button', { name: /edit|редакт/i }));
    fireEvent.change(screen.getByTestId('codemirror'), { target: { value: 'modified' } });
    fireEvent.click(screen.getByRole('button', { name: /save|сохран/i }));
    expect(onSave).toHaveBeenCalledWith('modified');
  });

  test('Cancel in edit mode returns to view mode without saving', () => {
    render(wrap(<MarkdownViewer content="# Hello" ext="md" projectPath="/p" relPath="README.md" onSave={onSave} />));
    fireEvent.click(screen.getByRole('button', { name: /edit|редакт/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel|отмен/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });

  test('rewrites relative image src via sherpa-file:// protocol', () => {
    const { container } = render(wrap(
      <MarkdownViewer
        content="![alt](./img.png)"
        ext="md"
        projectPath="/p"
        relPath="docs/spec.md"
        onSave={onSave}
      />,
    ));
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('sherpa-file://current/docs/img.png');
  });

  test('leaves absolute http(s) image src unchanged', () => {
    const { container } = render(wrap(
      <MarkdownViewer
        content="![alt](https://example.com/x.png)"
        ext="md"
        projectPath="/p"
        relPath="docs/spec.md"
        onSave={onSave}
      />,
    ));
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/x.png');
  });
});
