// src/presentation/sidebar/FileIcons.tsx
// Material Icon Theme SVGs via Vite ?url imports
// Source: https://github.com/material-extensions/vscode-material-icon-theme (MIT)

import { type ReactElement } from 'react';
import type { DirEntry } from '../../core/ports/files_port';

// ── Folder icons ──────────────────────────────────────────────────────────────
import folderGit from './icons/material/folder-git.svg?url';
import folderGitOpen from './icons/material/folder-git-open.svg?url';
import folderNode from './icons/material/folder-node.svg?url';
import folderNodeOpen from './icons/material/folder-node-open.svg?url';
import folderSrc from './icons/material/folder-src.svg?url';
import folderSrcOpen from './icons/material/folder-src-open.svg?url';
import folderDist from './icons/material/folder-dist.svg?url';
import folderDistOpen from './icons/material/folder-dist-open.svg?url';
import folderTest from './icons/material/folder-test.svg?url';
import folderTestOpen from './icons/material/folder-test-open.svg?url';
import folderConfig from './icons/material/folder-config.svg?url';
import folderConfigOpen from './icons/material/folder-config-open.svg?url';
import folderScripts from './icons/material/folder-scripts.svg?url';
import folderScriptsOpen from './icons/material/folder-scripts-open.svg?url';
import folderDocs from './icons/material/folder-docs.svg?url';
import folderDocsOpen from './icons/material/folder-docs-open.svg?url';
import folderImages from './icons/material/folder-images.svg?url';
import folderImagesOpen from './icons/material/folder-images-open.svg?url';

// ── Generic file fallback ─────────────────────────────────────────────────────
import document from './icons/material/document.svg?url';

// ── Language icons ────────────────────────────────────────────────────────────
import typescript from './icons/material/typescript.svg?url';
import javascript from './icons/material/javascript.svg?url';
import reactIcon from './icons/material/react.svg?url';
import react_ts from './icons/material/react_ts.svg?url';
import python from './icons/material/python.svg?url';
import goIcon from './icons/material/go.svg?url';
import rust from './icons/material/rust.svg?url';
import ruby from './icons/material/ruby.svg?url';
import php from './icons/material/php.svg?url';
import java from './icons/material/java.svg?url';
import kotlin from './icons/material/kotlin.svg?url';
import swift from './icons/material/swift.svg?url';
import dart from './icons/material/dart.svg?url';
import lua from './icons/material/lua.svg?url';
import scala from './icons/material/scala.svg?url';
import haskell from './icons/material/haskell.svg?url';
import elixir from './icons/material/elixir.svg?url';
import perl from './icons/material/perl.svg?url';
import r from './icons/material/r.svg?url';
import c from './icons/material/c.svg?url';
import cpp from './icons/material/cpp.svg?url';

// ── Shell / scripts ───────────────────────────────────────────────────────────
import powershell from './icons/material/powershell.svg?url';

// ── Data / config formats ─────────────────────────────────────────────────────
import json from './icons/material/json.svg?url';
import yaml from './icons/material/yaml.svg?url';
import xml from './icons/material/xml.svg?url';
import toml from './icons/material/toml.svg?url';
import lock from './icons/material/lock.svg?url';
import settings from './icons/material/settings.svg?url'; // used for .env files
import database from './icons/material/database.svg?url';
import table from './icons/material/table.svg?url'; // used for .csv

// ── Markup / styling ──────────────────────────────────────────────────────────
import html from './icons/material/html.svg?url';
import css from './icons/material/css.svg?url';
import sass from './icons/material/sass.svg?url'; // scss + sass + less
import less from './icons/material/less.svg?url';
import markdown from './icons/material/markdown.svg?url';
import svgIcon from './icons/material/svg.svg?url';

// ── Documents / misc ──────────────────────────────────────────────────────────
import pdf from './icons/material/pdf.svg?url';
import log from './icons/material/log.svg?url';
import imageIcon from './icons/material/image.svg?url';

// ── Config / tool files ───────────────────────────────────────────────────────
import npm from './icons/material/npm.svg?url';
import git from './icons/material/git.svg?url';
import docker from './icons/material/docker.svg?url';
import vite from './icons/material/vite.svg?url';
import tsconfig from './icons/material/tsconfig.svg?url';
import vitest from './icons/material/vitest.svg?url';
import eslint from './icons/material/eslint.svg?url';
import prettier from './icons/material/prettier.svg?url';
import graphql from './icons/material/graphql.svg?url';
import proto from './icons/material/proto.svg?url';
import svelte from './icons/material/svelte.svg?url';
import vue from './icons/material/vue.svg?url';
import angular from './icons/material/angular.svg?url';

// ── EXT_MAP: extension → SVG URL ─────────────────────────────────────────────
const EXT_MAP: Record<string, string> = {
  // TypeScript / JavaScript
  ts: typescript,
  tsx: react_ts,
  js: javascript,
  jsx: reactIcon,
  mjs: javascript,
  cjs: javascript,
  mts: typescript,
  cts: typescript,
  // Python
  py: python,
  pyw: python,
  pyi: python,
  // Systems languages
  go: goIcon,
  rs: rust,
  c: c,
  h: c,
  cpp: cpp,
  cc: cpp,
  cxx: cpp,
  hpp: cpp,
  // JVM
  java: java,
  kt: kotlin,
  kts: kotlin,
  scala: scala,
  // Mobile / cross-platform
  swift: swift,
  dart: dart,
  // Scripting
  rb: ruby,
  php: php,
  lua: lua,
  pl: perl,
  pm: perl,
  r: r,
  // Functional
  hs: haskell,
  ex: elixir,
  exs: elixir,
  // .NET
  cs: c, // no cs.svg in Material pack; c.svg is closest
  // Shell (no shell.svg in Material pack; powershell.svg is the best generic shell icon)
  sh: powershell,
  bash: powershell,
  zsh: powershell,
  fish: powershell,
  ps1: powershell,
  psm1: powershell,
  psd1: powershell,
  // Data formats
  json: json,
  jsonc: json,
  yaml: yaml,
  yml: yaml,
  toml: toml,
  xml: xml,
  xsl: xml,
  xslt: xml,
  xsd: xml,
  csv: table,
  tsv: table,
  sql: database,
  sqlite: database,
  db: database,
  graphql: graphql,
  gql: graphql,
  proto: proto,
  // Markup
  html: html,
  htm: html,
  css: css,
  scss: sass,
  sass: sass,
  less: less,
  md: markdown,
  mdx: markdown,
  markdown: markdown,
  rst: markdown,
  adoc: markdown,
  // Images
  png: imageIcon,
  jpg: imageIcon,
  jpeg: imageIcon,
  gif: imageIcon,
  webp: imageIcon,
  ico: imageIcon,
  bmp: imageIcon,
  tiff: imageIcon,
  avif: imageIcon,
  svg: svgIcon,
  // Documents
  pdf: pdf,
  txt: document,
  log: log,
  // Lock / config
  lock: lock,
  // Framework-specific
  svelte: svelte,
  vue: vue,
};

// ── FILENAME_MAP: exact filename → SVG URL ────────────────────────────────────
const FILENAME_MAP: Record<string, string> = {
  // npm / Node
  'package.json': npm,
  'package-lock.json': npm,
  'npm-debug.log': npm,
  '.npmrc': npm,
  '.npmignore': npm,
  // Git
  '.gitignore': git,
  '.gitattributes': git,
  '.gitmodules': git,
  '.gitkeep': git,
  // TypeScript
  'tsconfig.json': tsconfig,
  'tsconfig.base.json': tsconfig,
  'tsconfig.build.json': tsconfig,
  'tsconfig.node.json': tsconfig,
  'jsconfig.json': tsconfig,
  // Vite
  'vite.config.ts': vite,
  'vite.config.js': vite,
  'vite.config.mts': vite,
  'vite.config.mjs': vite,
  // Vitest
  'vitest.config.ts': vitest,
  'vitest.config.js': vitest,
  // ESLint
  '.eslintrc': eslint,
  '.eslintrc.js': eslint,
  '.eslintrc.cjs': eslint,
  '.eslintrc.json': eslint,
  '.eslintrc.yml': eslint,
  '.eslintignore': eslint,
  'eslint.config.ts': eslint,
  'eslint.config.js': eslint,
  'eslint.config.mjs': eslint,
  // Prettier
  '.prettierrc': prettier,
  '.prettierrc.js': prettier,
  '.prettierrc.json': prettier,
  '.prettierrc.yml': prettier,
  '.prettierignore': prettier,
  'prettier.config.js': prettier,
  // Docker
  'Dockerfile': docker,
  'docker-compose.yml': docker,
  'docker-compose.yaml': docker,
  '.dockerignore': docker,
  // Env
  '.env': settings,
  '.env.local': settings,
  '.env.development': settings,
  '.env.production': settings,
  '.env.test': settings,
  '.env.example': settings,
  // Lock files
  'yarn.lock': lock,
  'pnpm-lock.yaml': lock,
  'bun.lockb': lock,
  'Cargo.lock': lock,
  'Gemfile.lock': lock,
  'composer.lock': lock,
  // Framework configs
  'angular.json': angular,
  '.angular': angular,
  // Markdown special files
  'README.md': markdown,
  'CHANGELOG.md': markdown,
  'CONTRIBUTING.md': markdown,
  'LICENSE': document,
  'LICENSE.txt': document,
  'LICENSE.md': document,
  'NOTICE': document,
};

// ── Public API ────────────────────────────────────────────────────────────────

export type DirEntryKind = 'file' | 'directory';

/** Returns a string URL for the matching Material icon SVG. */
export function iconFor(entry: DirEntry, expanded?: boolean): string {
  if (entry.kind === 'directory') {
    return _folderIconFor(entry.name, expanded);
  }
  if (entry.name in FILENAME_MAP) return FILENAME_MAP[entry.name]!;
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? document;
}

/** True when a specific (non-generic) icon is assigned to this entry. */
function hasSpecificIcon(entry: DirEntry): boolean {
  if (entry.kind === 'directory') return true;
  if (entry.name in FILENAME_MAP) return true;
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  return ext in EXT_MAP;
}

/** Returns folder icon URL based on well-known folder names. */
function _folderIconFor(name: string, expanded?: boolean): string {
  const n = name.toLowerCase();
  const pairs: Array<[string, string, string]> = [
    ['src', folderSrc, folderSrcOpen],
    ['source', folderSrc, folderSrcOpen],
    ['dist', folderDist, folderDistOpen],
    ['build', folderDist, folderDistOpen],
    ['out', folderDist, folderDistOpen],
    ['test', folderTest, folderTestOpen],
    ['tests', folderTest, folderTestOpen],
    ['__tests__', folderTest, folderTestOpen],
    ['spec', folderTest, folderTestOpen],
    ['.git', folderGit, folderGitOpen],
    ['node_modules', folderNode, folderNodeOpen],
    ['config', folderConfig, folderConfigOpen],
    ['configs', folderConfig, folderConfigOpen],
    ['scripts', folderScripts, folderScriptsOpen],
    ['script', folderScripts, folderScriptsOpen],
    ['docs', folderDocs, folderDocsOpen],
    ['doc', folderDocs, folderDocsOpen],
    ['documentation', folderDocs, folderDocsOpen],
    ['images', folderImages, folderImagesOpen],
    ['img', folderImages, folderImagesOpen],
    ['assets', folderImages, folderImagesOpen],
  ];
  for (const [key, closed, open] of pairs) {
    if (n === key) return expanded ? open : closed;
  }
  // generic folder
  return expanded ? folderSrcOpen : folderSrc;
}

interface Props {
  entry: DirEntry;
  expanded?: boolean;
}

/** Renders a 16×16 Material icon for a file-tree entry. */
export function FileIcon({ entry, expanded }: Props): ReactElement {
  const iconUrl = iconFor(entry, expanded);
  const ext = entry.kind === 'file' ? (entry.name.split('.').pop()?.toLowerCase() ?? '') : '';
  const showBadge = entry.kind === 'file' && !hasSpecificIcon(entry) && ext.length > 0;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
      <img src={iconUrl} width={16} height={16} alt="" aria-hidden="true" style={{ display: 'block' }} />
      {showBadge && (
        <span
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            fontSize: 6,
            fontWeight: 700,
            lineHeight: 1,
            color: '#fff',
            background: 'rgba(0,0,0,0.55)',
            borderRadius: 2,
            padding: '1px 2px',
            fontFamily: 'ui-monospace, monospace',
            pointerEvents: 'none',
          }}
        >
          {ext}
        </span>
      )}
    </span>
  );
}
