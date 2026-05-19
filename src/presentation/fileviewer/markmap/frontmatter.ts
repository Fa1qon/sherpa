export interface Frontmatter {
  data: Record<string, string> | null;
  body: string;
}

export function parseFrontmatter(source: string): Frontmatter {
  if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) {
    return { data: null, body: source };
  }
  const rest = source.slice(4);
  const endMatch = /\r?\n---\r?\n?/.exec(rest);
  if (endMatch === null) return { data: null, body: source };
  const block = rest.slice(0, endMatch.index);
  const body = rest.slice(endMatch.index + endMatch[0].length);
  const data: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m === null) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    data[m[1]] = v;
  }
  return { data, body };
}

export function isMindmapDoc(source: string): boolean {
  const { data } = parseFrontmatter(source);
  return data?.view === 'mindmap';
}
