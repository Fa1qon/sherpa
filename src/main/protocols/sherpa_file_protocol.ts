// Visual Formats Plan 01 — Task 6.
//
// Pure resolver for the `sherpa-file://` custom URL scheme. Markdown viewers
// (Plan 05) and other in-app surfaces use this scheme to load project-relative
// assets (images, attachments) without exposing the renderer to absolute paths.
//
// URL format:    sherpa-file://current/<rel/path/to/file>
// Resolution rules:
//   - Returns `null` if no project is currently set.
//   - Strips query and fragment (handled implicitly by URL parsing).
//   - Decodes URI-encoded path components.
//   - Rejects path traversal (`..` escape outside the project root).
//   - Rejects hosts other than `current` (reserved namespace for future use).
//
// This module is intentionally electron-free so it can be unit-tested under
// the vitest `node` environment. The electron `protocol.handle(...)` wiring
// lives in `./register_sherpa_file_protocol.ts` and consumes these exports.

import path from 'node:path';

let currentProjectPath: string | null = null;

/**
 * Sets the active project root used to resolve `sherpa-file://current/...`
 * URLs. Pass `null` to clear (e.g. when no project is open).
 *
 * The input is normalised via `path.resolve` so callers can pass either
 * forward- or back-slashed paths.
 */
export function setCurrentProjectPath(p: string | null): void {
  currentProjectPath = p ? path.resolve(p) : null;
}

/**
 * Resolves a `sherpa-file://` URL to an absolute filesystem path inside the
 * current project, or `null` if the URL is invalid, the host is unknown, the
 * path escapes the project root, or no project is set.
 */
export function resolveSherpaFileUrl(url: string): string | null {
  if (currentProjectPath === null) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'sherpa-file:') return null;
  if (parsed.hostname !== 'current') return null;

  // `URL.pathname` already excludes `?query` and `#fragment`; strip the
  // leading slash(es) so `path.resolve` treats the value as relative.
  //
  // SECURITY: the WHATWG URL parser normalises `..` segments in pathname
  // (collapsing `sherpa-file://current/../../secret` to `/secret`), which
  // would silently hide a traversal attempt instead of rejecting it. Inspect
  // the *raw* URL substring after the host to catch any literal `..` segment
  // before the normalised path is resolved.
  const rawAfterHost = extractRawPathAfterHost(url);
  if (rawAfterHost !== null && hasParentSegment(rawAfterHost)) return null;

  const decoded = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const abs = path.resolve(currentProjectPath, decoded);
  const rel = path.relative(currentProjectPath, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return abs;
}

/**
 * Returns the substring of `url` that follows `sherpa-file://<host>`, stopping
 * at the first `?` or `#`. Returns `null` if the URL doesn't have that shape.
 * Used to inspect the raw, un-normalised path for `..` segments that the
 * WHATWG URL parser would otherwise collapse silently.
 */
function extractRawPathAfterHost(url: string): string | null {
  const schemePrefix = 'sherpa-file://';
  if (!url.startsWith(schemePrefix)) return null;
  const afterScheme = url.slice(schemePrefix.length);
  const slashIdx = afterScheme.indexOf('/');
  if (slashIdx === -1) return '';
  const afterHost = afterScheme.slice(slashIdx);
  const stopIdx = afterHost.search(/[?#]/);
  return stopIdx === -1 ? afterHost : afterHost.slice(0, stopIdx);
}

/** Returns true if `rawPath` contains a literal `..` URL path segment. */
function hasParentSegment(rawPath: string): boolean {
  // Decode percent-encoded `.` (%2E) so `%2E%2E` is also caught, while keeping
  // segment boundaries (`/`) intact. We don't fully decode the path here —
  // just enough to defeat trivial obfuscation of `..`.
  const normalised = rawPath.replace(/%2[eE]/g, '.');
  return normalised.split('/').some((seg) => seg === '..');
}
