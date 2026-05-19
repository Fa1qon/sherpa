import type { Highlighter } from 'shiki';

const LANGS = [
  'typescript', 'javascript', 'tsx', 'jsx',
  'json', 'yaml', 'toml', 'xml', 'html', 'css', 'scss',
  'python', 'go', 'rust', 'java', 'csharp', 'cpp', 'c', 'php', 'ruby',
  'sql', 'bash', 'shell', 'powershell', 'dockerfile', 'ini', 'diff',
  'markdown',
] as const;

let instance: Promise<Highlighter> | null = null;

async function load(): Promise<Highlighter> {
  const { createHighlighter } = await import('shiki');
  return createHighlighter({
    langs: LANGS as unknown as string[],
    themes: ['github-light', 'github-dark'],
  });
}

export function getHighlighter(): Promise<Highlighter> {
  if (instance === null) instance = load();
  return instance;
}

export function _resetForTest(): void {
  instance = null;
}

export function supportedLangs(): readonly string[] {
  return LANGS;
}
