// Claude Code binary version helpers — minimal surface used by the
// stream-json based adapter (Plan 4). The pre-Plan-4 capability flags
// table and discovery / cache layers were removed: the new adapter
// invocation pattern (`claude -p --output-format stream-json`) is a
// single supported shape, so there is nothing to feature-flag.

/** Min supported Claude Code version. */
export const MIN_SUPPORTED_VERSION = '2.1.31';

/**
 * Parse `claude --version` output → semver. Accepts shapes the binary has
 * historically used:
 *   "2.1.139 (Claude Code)\n"  ← current
 *   "claude 2.1.31\n"           ← older
 * Returns the bare semver triple ("2.1.139") or null if no parse.
 */
export function parseVersion(output: string): string | null {
  const m = output.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] ?? null : null;
}

/**
 * Compare two semver strings — naïve numeric component compare. Returns
 * -1 / 0 / 1. Pre-release suffixes are ignored.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const ap = a.split('.').map((s) => parseInt(s, 10) || 0);
  const bp = b.split('.').map((s) => parseInt(s, 10) || 0);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const av = ap[i] ?? 0;
    const bv = bp[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}
