// Plan 6 Task 10 — hardcoded tool registry for v1.
// Plan 9 will append plugin-provided tools to this list.
// Plan 7 Task 2 — descriptions/labels moved to locale files
// (tools.builtin.<id>.{label,desc}).

export type ToolCategory = 'fs' | 'shell' | 'web' | 'editor' | 'agent';

export interface ToolDef {
  readonly id: string;
  readonly category: ToolCategory;
}

export const BUILTIN_TOOLS: readonly ToolDef[] = [
  { id: 'Read', category: 'fs' },
  { id: 'Write', category: 'fs' },
  { id: 'Edit', category: 'editor' },
  { id: 'Glob', category: 'fs' },
  { id: 'Grep', category: 'fs' },
  { id: 'Bash', category: 'shell' },
  { id: 'WebFetch', category: 'web' },
  { id: 'WebSearch', category: 'web' },
  { id: 'Agent', category: 'agent' },
  { id: 'Skill', category: 'agent' },
  { id: 'TodoWrite', category: 'editor' },
];
