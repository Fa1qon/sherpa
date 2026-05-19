import { describe, test, expect } from 'vitest';
import { getFileType, getCodeMirrorLang } from '../../../src/presentation/fileviewer/fileType';

describe('getFileType', () => {
  test('markdown extensions', () => {
    expect(getFileType('md')).toBe('markdown');
    expect(getFileType('mdx')).toBe('markdown');
  });
  test('image extensions', () => {
    expect(getFileType('png')).toBe('image');
    expect(getFileType('jpg')).toBe('image');
    expect(getFileType('svg')).toBe('image');
    expect(getFileType('webp')).toBe('image');
  });
  test('csv/tsv extensions', () => {
    expect(getFileType('csv')).toBe('csv');
    expect(getFileType('tsv')).toBe('csv');
  });
  test('text extensions', () => {
    expect(getFileType('txt')).toBe('text');
    expect(getFileType('log')).toBe('text');
  });
  test('binary extensions', () => {
    expect(getFileType('zip')).toBe('binary');
    expect(getFileType('exe')).toBe('binary');
  });
  test('pdf is not binary (viewable via PdfViewer)', () => {
    // 'pdf' must not be classified as binary so FilesPanel allows opening it.
    expect(getFileType('pdf')).not.toBe('binary');
  });
  test('code extensions', () => {
    expect(getFileType('ts')).toBe('code');
    expect(getFileType('py')).toBe('code');
    expect(getFileType('json')).toBe('code');
    expect(getFileType('sh')).toBe('code');
    expect(getFileType('unknownext')).toBe('code');
  });
  test('case insensitive', () => {
    expect(getFileType('PNG')).toBe('image');
    expect(getFileType('MD')).toBe('markdown');
  });
});

describe('getCodeMirrorLang', () => {
  test('TypeScript returns extension object', () => {
    expect(getCodeMirrorLang('ts')).not.toBeNull();
    expect(getCodeMirrorLang('tsx')).not.toBeNull();
  });
  test('JSON returns extension object', () => {
    expect(getCodeMirrorLang('json')).not.toBeNull();
  });
  test('unknown extension returns null', () => {
    expect(getCodeMirrorLang('xyz')).toBeNull();
  });
  test('css/html/sql return extension objects', () => {
    expect(getCodeMirrorLang('css')).not.toBeNull();
    expect(getCodeMirrorLang('html')).not.toBeNull();
    expect(getCodeMirrorLang('sql')).not.toBeNull();
  });
});
