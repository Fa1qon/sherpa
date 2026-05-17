// src/presentation/fileviewer/fileType.ts
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { yaml } from '@codemirror/lang-yaml';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { sql } from '@codemirror/lang-sql';
import type { LanguageSupport } from '@codemirror/language';

export type FileType = 'markdown' | 'code' | 'image' | 'csv' | 'text' | 'binary';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif', 'tiff']);
const CSV_EXTS = new Set(['csv', 'tsv']);
const MD_EXTS = new Set(['md', 'mdx']);
const TEXT_EXTS = new Set(['txt', 'log', 'gitignore', 'gitattributes', 'editorconfig', 'npmrc', 'prettierignore', 'eslintignore']);
const BINARY_EXTS = new Set(['pdf', 'zip', 'tar', 'gz', 'mp3', 'mp4', 'avi', 'mov', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'exe', 'dll', 'so', 'dylib']);

export function getFileType(ext: string): FileType {
  const e = ext.toLowerCase();
  if (IMAGE_EXTS.has(e)) return 'image';
  if (CSV_EXTS.has(e)) return 'csv';
  if (MD_EXTS.has(e)) return 'markdown';
  if (BINARY_EXTS.has(e)) return 'binary';
  if (TEXT_EXTS.has(e)) return 'text';
  return 'code';
}

export function getCodeMirrorLang(ext: string): LanguageSupport | null {
  switch (ext.toLowerCase()) {
    case 'ts':
    case 'mts':
    case 'cts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ typescript: true, jsx: true });
    case 'js':
    case 'mjs':
    case 'cjs':
      return javascript();
    case 'jsx':
      return javascript({ jsx: true });
    case 'json':
    case 'jsonc':
      return json();
    case 'md':
    case 'mdx':
      return markdown();
    case 'py':
    case 'pyw':
    case 'pyi':
      return python();
    case 'yaml':
    case 'yml':
      return yaml();
    case 'php':
      return php();
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return css();
    case 'html':
    case 'htm':
      return html();
    case 'sql':
      return sql();
    default:
      return null;
  }
}
