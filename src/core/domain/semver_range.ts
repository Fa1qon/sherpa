interface Parsed { major: number; minor: number; patch: number; }

function parse(v: string): Parsed | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-[A-Za-z0-9.-]+)?$/.exec(v);
  if (m === null) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function cmp(a: Parsed, b: Parsed): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function satisfiesRange(version: string, range: string): boolean {
  const v = parse(version);
  if (v === null) return false;

  if (range.startsWith('>=')) {
    const r = parse(range.slice(2));
    return r !== null && cmp(v, r) >= 0;
  }
  if (range.startsWith('^')) {
    const r = parse(range.slice(1));
    if (r === null) return false;
    if (v.major !== r.major) return false;
    if (r.major === 0 && v.minor !== r.minor) return false;
    return cmp(v, r) >= 0;
  }
  const r = parse(range);
  return r !== null && cmp(v, r) === 0;
}
