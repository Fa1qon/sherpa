/**
 * Helpers for resolving markdown image `src` values against a document's
 * relative path and converting them to the `sherpa-file://current/<rel>`
 * protocol exposed by the main process (Plan 01 Task 7).
 *
 * Used by the markdown renderer (Plan 05) to rewrite relative image
 * references so they resolve against the active project root rather than
 * the renderer's document origin.
 *
 * No dependency on Node's `path` (renderer is browser-side); inline POSIX
 * normalization is sufficient because we only ever deal with `/`-separated
 * project-relative paths.
 */

function dirname(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx < 0 ? '' : p.slice(0, idx);
}

function normalize(p: string): string {
  const leadingSlash = p.startsWith('/');
  const segs = p.split('/');
  const out: string[] = [];
  for (const seg of segs) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return (leadingSlash ? '/' : '') + out.join('/');
}

/**
 * Returns true if `src` looks like a markdown image reference that should
 * be resolved against the document path (i.e., not an absolute URL, data
 * URI, or root-absolute path).
 */
export function isRelativeMdImg(src: string): boolean {
  if (!src) return false;
  if (/^[a-z]+:/i.test(src)) return false; // http://, https://, data:, file:, sherpa-file:
  if (src.startsWith('/')) return false; // root-absolute
  return true;
}

/**
 * Convert a markdown image `src` into a `sherpa-file://current/<rel>` URL
 * when it's relative to the document, or pass through unchanged when it's
 * already absolute (http/https/data/file/sherpa-file/root-absolute).
 *
 * Returns `null` when `src` is empty.
 *
 * @param src        the raw `src` from the markdown AST
 * @param docRelPath the path of the markdown document, relative to the
 *                   project root (POSIX or Windows separators both OK)
 */
export function toSherpaFileUrl(src: string, docRelPath: string): string | null {
  if (!src) return null;
  if (!isRelativeMdImg(src)) return src;
  const docDir = dirname(docRelPath.replace(/\\/g, '/'));
  const joined = docDir === '' ? src : `${docDir}/${src}`;
  const cleaned = normalize(joined);
  return `sherpa-file://current/${cleaned}`;
}
