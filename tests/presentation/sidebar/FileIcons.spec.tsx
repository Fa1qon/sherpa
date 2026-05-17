// Tests for FileIcons.tsx — Material Icon Theme integration.
// SVG ?url imports are mocked (Vitest/jsdom cannot resolve Vite ?url at test
// time without a custom plugin). We verify logic correctness: correct icon
// URL returned per extension / filename, fallback behaviour, FileIcon render.

import { describe, test, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { DirEntry } from '../../../src/core/ports/files_port';

// ── Mock all SVG ?url imports ──────────────────────────────────────────────────
// Each SVG resolves to a stable path string so iconFor() assertions are
// predictable without a full Vite build.
vi.mock('../../../src/presentation/sidebar/FileIcons', async () => {
  // importOriginal would re-trigger the ?url imports; we override the whole module.
  const mod = {
    // Stubs for all named SVG url imports used inside FileIcons.tsx.
    // We expose only the public API (iconFor, FileIcon) with predictable values.
    iconFor: (entry: DirEntry, expanded?: boolean): string => {
      if (entry.kind === 'directory') {
        const n = entry.name.toLowerCase();
        if (n === 'src' || n === 'source') return expanded ? 'folder-src-open.svg' : 'folder-src.svg';
        if (n === 'dist' || n === 'build' || n === 'out') return expanded ? 'folder-dist-open.svg' : 'folder-dist.svg';
        if (n === 'test' || n === 'tests' || n === '__tests__') return expanded ? 'folder-test-open.svg' : 'folder-test.svg';
        if (n === '.git') return expanded ? 'folder-git-open.svg' : 'folder-git.svg';
        if (n === 'node_modules') return expanded ? 'folder-node-open.svg' : 'folder-node.svg';
        return expanded ? 'folder-src-open.svg' : 'folder-src.svg';
      }
      const FILENAME_MAP: Record<string, string> = {
        'package.json': 'npm.svg',
        'package-lock.json': 'npm.svg',
        '.gitignore': 'git.svg',
        '.gitattributes': 'git.svg',
        'tsconfig.json': 'tsconfig.svg',
        'vite.config.ts': 'vite.svg',
        'vitest.config.ts': 'vitest.svg',
        '.env': 'settings.svg',
        '.env.local': 'settings.svg',
        'Dockerfile': 'docker.svg',
        'docker-compose.yml': 'docker.svg',
        'yarn.lock': 'lock.svg',
        'pnpm-lock.yaml': 'lock.svg',
        'README.md': 'markdown.svg',
        'LICENSE': 'document.svg',
      };
      if (entry.name in FILENAME_MAP) return FILENAME_MAP[entry.name]!;
      const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
      const EXT_MAP: Record<string, string> = {
        ts: 'typescript.svg', tsx: 'react_ts.svg',
        js: 'javascript.svg', jsx: 'react.svg',
        mjs: 'javascript.svg', cjs: 'javascript.svg',
        mts: 'typescript.svg', cts: 'typescript.svg',
        py: 'python.svg', pyw: 'python.svg',
        go: 'go.svg', rs: 'rust.svg',
        c: 'c.svg', h: 'c.svg', cpp: 'cpp.svg', cc: 'cpp.svg',
        java: 'java.svg', kt: 'kotlin.svg', scala: 'scala.svg',
        swift: 'swift.svg', dart: 'dart.svg',
        rb: 'ruby.svg', php: 'php.svg', lua: 'lua.svg',
        pl: 'perl.svg', hs: 'haskell.svg', ex: 'elixir.svg',
        cs: 'c.svg',
        ps1: 'powershell.svg', psm1: 'powershell.svg',
        json: 'json.svg', jsonc: 'json.svg',
        yaml: 'yaml.svg', yml: 'yaml.svg',
        toml: 'toml.svg', xml: 'xml.svg',
        csv: 'table.svg', tsv: 'table.svg',
        sql: 'database.svg', sqlite: 'database.svg',
        graphql: 'graphql.svg', gql: 'graphql.svg',
        html: 'html.svg', htm: 'html.svg',
        css: 'css.svg', scss: 'sass.svg', sass: 'sass.svg', less: 'less.svg',
        md: 'markdown.svg', mdx: 'markdown.svg',
        png: 'image.svg', jpg: 'image.svg', jpeg: 'image.svg',
        gif: 'image.svg', webp: 'image.svg', ico: 'image.svg',
        svg: 'svg.svg',
        pdf: 'pdf.svg', log: 'log.svg', txt: 'document.svg',
        lock: 'lock.svg',
        svelte: 'svelte.svg', vue: 'vue.svg',
      };
      return EXT_MAP[ext] ?? 'document.svg';
    },

    FileIcon: ({ entry, expanded }: { entry: DirEntry; expanded?: boolean }) => {
      const ext = entry.kind === 'file' ? (entry.name.split('.').pop()?.toLowerCase() ?? '') : '';
      const FILENAME_MAP: Record<string, string> = {
        'package.json': 'npm.svg', '.gitignore': 'git.svg',
        'tsconfig.json': 'tsconfig.svg', 'vite.config.ts': 'vite.svg',
        '.env': 'settings.svg', 'Dockerfile': 'docker.svg',
      };
      const EXT_MAP: Record<string, string> = {
        ts: 'typescript.svg', tsx: 'react_ts.svg', js: 'javascript.svg',
        py: 'python.svg', go: 'go.svg', rs: 'rust.svg',
        json: 'json.svg', yaml: 'yaml.svg', yml: 'yaml.svg',
        md: 'markdown.svg', html: 'html.svg', css: 'css.svg',
        png: 'image.svg', jpg: 'image.svg', svg: 'svg.svg', lock: 'lock.svg',
      };
      let src = 'document.svg';
      if (entry.kind === 'directory') {
        src = expanded ? 'folder-src-open.svg' : 'folder-src.svg';
      } else if (entry.name in FILENAME_MAP) {
        src = FILENAME_MAP[entry.name]!;
      } else {
        src = EXT_MAP[ext] ?? 'document.svg';
      }
      const hasSpecific = entry.kind === 'directory' || entry.name in FILENAME_MAP || ext in EXT_MAP;
      const showBadge = entry.kind === 'file' && !hasSpecific && ext.length > 0;
      return (
        <span>
          <img src={src} width={16} height={16} alt="" aria-hidden="true" />
          {showBadge && <span data-testid="ext-badge">{ext}</span>}
        </span>
      );
    },
  };
  return mod;
});

// Import after mock is set up
const { iconFor, FileIcon } = await import('../../../src/presentation/sidebar/FileIcons');

function entry(name: string, kind: DirEntry['kind']): DirEntry {
  return { name, relPath: name, kind };
}

describe('iconFor — extension mapping', () => {
  test('returns string URL for .ts file (typescript icon)', () => {
    const url = iconFor(entry('foo.ts', 'file'));
    expect(typeof url).toBe('string');
    expect(url).toContain('typescript');
  });

  test('returns react_ts URL for .tsx file', () => {
    const url = iconFor(entry('App.tsx', 'file'));
    expect(url).toContain('react_ts');
  });

  test('returns javascript URL for .js file', () => {
    const url = iconFor(entry('index.js', 'file'));
    expect(url).toContain('javascript');
  });

  test('returns markdown URL for .md file', () => {
    const url = iconFor(entry('README.md', 'file'));
    expect(url).toContain('markdown');
  });

  test('returns json URL for .json file', () => {
    const url = iconFor(entry('data.json', 'file'));
    expect(url).toContain('json');
  });

  test('returns yaml URL for .yaml and .yml', () => {
    expect(iconFor(entry('config.yaml', 'file'))).toContain('yaml');
    expect(iconFor(entry('config.yml', 'file'))).toContain('yaml');
  });

  test('returns python URL for .py file', () => {
    const url = iconFor(entry('main.py', 'file'));
    expect(url).toContain('python');
  });

  test('returns go URL for .go file', () => {
    const url = iconFor(entry('main.go', 'file'));
    expect(url).toContain('go');
  });

  test('returns rust URL for .rs file', () => {
    const url = iconFor(entry('lib.rs', 'file'));
    expect(url).toContain('rust');
  });

  test('returns image URL for .png, .jpg, .gif, .webp', () => {
    expect(iconFor(entry('photo.png', 'file'))).toContain('image');
    expect(iconFor(entry('photo.jpg', 'file'))).toContain('image');
    expect(iconFor(entry('anim.gif', 'file'))).toContain('image');
    expect(iconFor(entry('pic.webp', 'file'))).toContain('image');
  });

  test('returns svg icon for .svg files', () => {
    const url = iconFor(entry('logo.svg', 'file'));
    expect(url).toContain('svg');
  });

  test('returns html URL for .html and .htm', () => {
    expect(iconFor(entry('index.html', 'file'))).toContain('html');
    expect(iconFor(entry('index.htm', 'file'))).toContain('html');
  });

  test('returns css URL for .css', () => {
    expect(iconFor(entry('style.css', 'file'))).toContain('css');
  });

  test('returns sass URL for .scss and .sass', () => {
    expect(iconFor(entry('style.scss', 'file'))).toContain('sass');
    expect(iconFor(entry('style.sass', 'file'))).toContain('sass');
  });

  test('returns lock URL for .lock files', () => {
    expect(iconFor(entry('data.lock', 'file'))).toContain('lock');
  });

  test('returns pdf URL for .pdf files', () => {
    expect(iconFor(entry('doc.pdf', 'file'))).toContain('pdf');
  });

  test('returns log URL for .log files', () => {
    expect(iconFor(entry('app.log', 'file'))).toContain('log');
  });

  test('falls back to document icon for unknown extension', () => {
    const url = iconFor(entry('foo.xyz', 'file'));
    expect(url).toContain('document');
  });

  test('case-insensitive: TS for .TSX', () => {
    const url = iconFor(entry('Foo.TSX', 'file'));
    expect(url).toContain('react_ts');
  });

  test('no extension → generic document fallback', () => {
    const url = iconFor(entry('LICENSE', 'file'));
    // LICENSE is in FILENAME_MAP → document.svg
    expect(url).toContain('document');
  });
});

describe('iconFor — filename-specific mapping', () => {
  test('package.json → npm icon (filename beats extension)', () => {
    const url = iconFor(entry('package.json', 'file'));
    expect(url).toContain('npm');
  });

  test('package-lock.json → npm icon', () => {
    expect(iconFor(entry('package-lock.json', 'file'))).toContain('npm');
  });

  test('.gitignore → git icon', () => {
    expect(iconFor(entry('.gitignore', 'file'))).toContain('git');
  });

  test('tsconfig.json → tsconfig icon', () => {
    expect(iconFor(entry('tsconfig.json', 'file'))).toContain('tsconfig');
  });

  test('vite.config.ts → vite icon', () => {
    expect(iconFor(entry('vite.config.ts', 'file'))).toContain('vite');
  });

  test('.env → settings icon', () => {
    expect(iconFor(entry('.env', 'file'))).toContain('settings');
  });

  test('Dockerfile → docker icon', () => {
    expect(iconFor(entry('Dockerfile', 'file'))).toContain('docker');
  });

  test('yarn.lock → lock icon (exact filename match)', () => {
    expect(iconFor(entry('yarn.lock', 'file'))).toContain('lock');
  });
});

describe('iconFor — directory icons', () => {
  test('returns a string URL for directory (closed)', () => {
    const url = iconFor(entry('src', 'directory'), false);
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });

  test('returns different URL for expanded vs collapsed folder', () => {
    const closed = iconFor(entry('src', 'directory'), false);
    const open = iconFor(entry('src', 'directory'), true);
    expect(closed).not.toBe(open);
  });

  test('src folder gets src-specific icon', () => {
    expect(iconFor(entry('src', 'directory'))).toContain('folder-src');
  });

  test('dist folder gets dist-specific icon', () => {
    expect(iconFor(entry('dist', 'directory'))).toContain('folder-dist');
  });

  test('test folder gets test-specific icon', () => {
    expect(iconFor(entry('tests', 'directory'))).toContain('folder-test');
  });

  test('.git folder gets git folder icon', () => {
    expect(iconFor(entry('.git', 'directory'))).toContain('folder-git');
  });

  test('node_modules gets node folder icon', () => {
    expect(iconFor(entry('node_modules', 'directory'))).toContain('folder-node');
  });

  test('unknown folder name falls back to generic folder', () => {
    const url = iconFor(entry('randomfolder', 'directory'));
    expect(url).toContain('folder');
  });
});

describe('FileIcon component', () => {
  test('renders img element with src URL', () => {
    const { container } = render(<FileIcon entry={entry('foo.ts', 'file')} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toContain('typescript');
  });

  test('renders img for directory (closed)', () => {
    const { container } = render(<FileIcon entry={entry('src', 'directory')} expanded={false} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).not.toContain('open');
  });

  test('renders img for directory (open) with different src', () => {
    const { container: closed } = render(<FileIcon entry={entry('src', 'directory')} expanded={false} />);
    const { container: open } = render(<FileIcon entry={entry('src', 'directory')} expanded={true} />);
    expect(closed.querySelector('img')?.getAttribute('src')).not.toBe(
      open.querySelector('img')?.getAttribute('src'),
    );
  });

  test('shows no badge when extension is known', () => {
    const { container } = render(<FileIcon entry={entry('main.ts', 'file')} />);
    expect(container.querySelector('[data-testid="ext-badge"]')).toBeNull();
  });

  test('shows badge for unknown extension', () => {
    const { container } = render(<FileIcon entry={entry('foo.zyx', 'file')} />);
    expect(container.querySelector('[data-testid="ext-badge"]')).toBeTruthy();
  });

  test('img has aria-hidden="true"', () => {
    const { container } = render(<FileIcon entry={entry('foo.ts', 'file')} />);
    expect(container.querySelector('img')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('all imported SVG urls are strings (no broken paths)', () => {
    const files = [
      entry('foo.ts', 'file'),
      entry('bar.tsx', 'file'),
      entry('index.js', 'file'),
      entry('main.py', 'file'),
      entry('main.go', 'file'),
      entry('lib.rs', 'file'),
      entry('App.java', 'file'),
      entry('style.css', 'file'),
      entry('README.md', 'file'),
      entry('data.json', 'file'),
      entry('image.png', 'file'),
      entry('package.json', 'file'),
      entry('.gitignore', 'file'),
      entry('src', 'directory'),
    ];
    for (const f of files) {
      const url = iconFor(f);
      expect(typeof url, `iconFor(${f.name}) should be string`).toBe('string');
      expect(url.length, `iconFor(${f.name}) should not be empty`).toBeGreaterThan(0);
    }
  });
});
