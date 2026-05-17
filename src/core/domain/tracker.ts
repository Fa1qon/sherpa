// src/core/domain/tracker.ts

export type StageCategory = 'backlog' | 'active' | 'done' | 'cancelled';

export interface Stage {
  id: string;          // slug, e.g. 'in-progress' — used as DB key
  name: string;
  category: StageCategory;
  color?: string;      // hex e.g. '#4caf50'
  order: number;
}

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'url'
  | 'checkbox';

export type FieldValue = string | number | boolean | string[] | null;

export interface SelectOption {
  id: string;
  label: string;
  color?: string;
}

export interface FieldDef {
  id: string;
  name: string;
  type: FieldType;
  required?: boolean;
  default_value?: FieldValue;
  options?: SelectOption[];  // only for select / multi_select
  order: number;
}

export interface BoardConfig {
  stages: Stage[];
  fieldDefs: FieldDef[];
}

/** Slim read model used by the Kanban board — not the full Task object. */
export interface TrackerTask {
  id: string;
  title: string;
  status: string;           // Task.status for colour coding
  stageId: string;
  fields: Record<string, FieldValue>;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_STAGES: Stage[] = [
  { id: 'backlog',      name: 'Backlog',      category: 'backlog',    order: 0 },
  { id: 'in-progress',  name: 'In Progress',  category: 'active',     order: 1 },
  { id: 'done',         name: 'Done',         category: 'done',       order: 2 },
];
