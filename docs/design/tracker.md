# Sherpa Tracker — Design Document

> **Status:** Decisions locked · 2026-05-17
> **Scope:** Domain model, storage, event system, AI integration, customisation API
> **Out of scope:** UI wireframes, implementation plan

---

## 1. Цель и философия

Sherpa Tracker — встроенный трекер задач для pet-проектов разработчика, у которого открыто 5–20 проектов одновременно и нет смысла держать Jira.

**Три принципа:**

| Принцип | Что означает на практике |
|---------|--------------------------|
| **Минимализм по умолчанию** | Из коробки работает без настроек: три стадии, два поля. Ничего не навязывается. |
| **Расширяемость через конфигурацию** | Пользователь добавляет стадии, поля, правила — не плагины, не код, просто через UI. |
| **ИИ как первоклассный участник** | ИИ знает о задаче: может менять стадию, читать контекст, возобновлять сессию. Не «интеграция с ИИ», а нативная часть. |

---

## 2. Принятые архитектурные решения

### 2.1 База данных — per-project

БД живёт там, где уже живут кейсы, чаты, knowledge:

```
<project>/.sherpa/sherpa.db   ← уже существует (ProjectDatabase)
```

Трекер добавляет таблицы в ту же БД через расширение `SCHEMA` в `project_database.ts`.

### 2.2 Надстройка над существующими задачами

Существующая система (`TaskService`, таблица `tasks`) расширяется двумя новыми колонками:

```sql
ALTER TABLE tasks ADD COLUMN tracker_stage_id TEXT;          -- null = не в трекере
ALTER TABLE tasks ADD COLUMN tracker_fields    TEXT NOT NULL DEFAULT '{}';  -- JSON
ALTER TABLE tasks ADD COLUMN tracker_sub_project_id TEXT;    -- опционально
```

**Следствия:**
- Пользователи, которым не нужен трекер, продолжают видеть список чатов как раньше. Новые колонки просто null.
- Задача входит в трекер в момент, когда пользователь присваивает ей стадию. До этого — просто чат.
- Kanban-view = тот же список задач, отфильтрованный по `tracker_stage_id IS NOT NULL`, сгруппированный по стадиям.

### 2.3 Подпроекты — логические группы внутри одной БД

BitrixCore пример: один Sherpa-проект (одна папка, одна БД), внутри логические подпроекты `globus`, `specdep`, etc. Они не являются отдельными Sherpa-проектами — это именованные группировки внутри `sherpa.db`.

```
BitrixCore/               ← Sherpa project (одна .sherpa/sherpa.db)
  ├── globus/
  ├── specdep/
  └── .sherpa/
        └── sherpa.db     ← всё здесь: задачи globus, specdep, root
```

Задача при создании опционально получает `tracker_sub_project_id`. Без него — принадлежит корневому проекту.

---

## 3. Модель данных

### 3.1 Новые таблицы в `sherpa.db`

```sql
-- Конфигурация доски (одна строка на проект + по одной на каждый подпроект)
CREATE TABLE IF NOT EXISTS tracker_board_config (
  sub_project_id  TEXT PRIMARY KEY,  -- '' для корневого проекта
  stages_json     TEXT NOT NULL DEFAULT '[]',
  field_defs_json TEXT NOT NULL DEFAULT '[]',
  updated_at      TEXT NOT NULL
);

-- Подпроекты (логические группы внутри одного Sherpa-проекта)
CREATE TABLE IF NOT EXISTS tracker_sub_projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  parent_id   TEXT,                   -- NULL для корневых; future: дерево > 2 уровней
  order_idx   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
```

Изменения в `tasks`:

```sql
ALTER TABLE tasks ADD COLUMN tracker_stage_id       TEXT;
ALTER TABLE tasks ADD COLUMN tracker_fields         TEXT NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN tracker_sub_project_id TEXT;
```

### 3.2 Stage — определение стадии

```typescript
interface Stage {
  id: string;              // slug, например 'in-progress'
  name: string;            // отображаемое название
  category: 'backlog' | 'active' | 'done' | 'cancelled';
  color?: string;          // hex, например '#4caf50'
  order: number;
}
```

**Стадии по умолчанию** (корневой проект, нет конфигурации):

```
backlog      Backlog      (backlog)
in-progress  In Progress  (active)
done         Done         (done)
```

**Наследование:** подпроект наследует стадии корня. Если у подпроекта `stages_json` не пуст — они полностью заменяют родительские для этого подпроекта.

### 3.3 FieldDef — определение кастомного поля

```typescript
interface FieldDef {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'url' | 'checkbox';
  required?: boolean;
  default_value?: FieldValue;
  options?: Array<{ id: string; label: string; color?: string }>;  // для select/*
  order: number;
}

type FieldValue = string | number | boolean | string[] | null;
```

**Полей по умолчанию нет.** Минималистичность — базовая задача имеет только `title`.

**Наследование полей:** поля аккумулируются от корня к подпроекту (подпроект видит поля родителя плюс свои собственные). Если задача в подпроекте — ей доступны все поля по цепочке.

### 3.4 Расширение Task (TypeScript interface)

Добавляются поля в существующий `Task` в `src/core/domain/task.ts`:

```typescript
// Tracker extensions — опционально; null/undefined = задача не в трекере
readonly tracker_stage_id?: string;
readonly tracker_sub_project_id?: string;
readonly tracker_fields?: Record<string, FieldValue>;
readonly tracker_session_summary?: string;   // авто-резюме при закрытии AI-сессии
```

### 3.5 Разрешение конфигурации доски

```typescript
function resolveBoardConfig(
  db: Database,
  subProjectId: string | null
): { stages: Stage[]; fieldDefs: FieldDef[] } {

  const root = getBoardConfig(db, '');           // корневой проект
  if (!subProjectId) return root;

  const sub = getBoardConfig(db, subProjectId);
  return {
    stages: sub.stages.length > 0 ? sub.stages : root.stages,  // override
    fieldDefs: [...root.fieldDefs, ...sub.fieldDefs],           // merge
  };
}
```

---

## 4. TrackerService

Новый сервис `src/main/services/tracker_service.ts`, инжектируется в `composition_root.ts` рядом с `TaskService`.

```typescript
class TrackerService {
  // Board config
  getBoardConfig(subProjectId?: string): BoardConfig
  setBoardConfig(subProjectId: string | null, config: BoardConfig): void

  // Sub-projects
  listSubProjects(): SubProject[]
  createSubProject(name: string, parentId?: string): SubProject
  deleteSubProject(id: string): void

  // Task tracker operations
  moveToStage(taskId: string, stageId: string): Task
  setField(taskId: string, fieldId: string, value: FieldValue): Task
  assignSubProject(taskId: string, subProjectId: string | null): Task

  // Queries
  listTrackerTasks(opts?: {
    subProjectId?: string | null;
    includeChildren?: boolean;   // включать подпроекты
    stageId?: string;
    fields?: Record<string, FieldValue>;
  }): Task[]

  // Events
  readonly events: TrackerEventBus
}
```

`TrackerService` получает `TaskService` как зависимость — он не дублирует персистентность, а делегирует запись через `TaskService.applySettings()` + прямые SQL для tracker-колонок.

---

## 5. Система событий

### 5.1 Типы событий

```typescript
type TrackerEvent =
  | { kind: 'task.added_to_tracker';    taskId: string; stageId: string }
  | { kind: 'task.stage_changed';       taskId: string; fromStage: string; toStage: string }
  | { kind: 'task.field_changed';       taskId: string; fieldId: string; before: FieldValue; after: FieldValue }
  | { kind: 'task.sub_project_changed'; taskId: string; subProjectId: string | null }
  | { kind: 'task.session_closed';      taskId: string; summary: string }
  | { kind: 'board.stages_changed';     subProjectId: string | null; stages: Stage[] }
  | { kind: 'board.field_def_added';    subProjectId: string | null; fieldDef: FieldDef }
  | { kind: 'sub_project.created';      subProject: SubProject }
```

### 5.2 Шина событий

```typescript
interface TrackerEventBus {
  emit(event: TrackerEvent): void;
  on<K extends TrackerEvent['kind']>(
    kind: K | '*',
    handler: (event: Extract<TrackerEvent, { kind: K }>) => void | Promise<void>
  ): () => void;  // unsubscribe
}
```

**Встроенные подписчики:**
- Zustand `useTracker` store → обновляет Kanban-view при `task.stage_changed`
- AI context manager → сохраняет summary при `task.session_closed`

**Extension подписчики (будущее):**
```typescript
// Jira extension:
tracker.events.on('task.added_to_tracker', async (ev) => {
  const jiraId = await jira.createIssue({ title: task.title });
  tracker.setField(ev.taskId, 'jira_id', jiraId);
});

// Webhook extension:
tracker.events.on('*', async (ev) => {
  await fetch(webhookUrl, { method: 'POST', body: JSON.stringify(ev) });
});
```

### 5.3 ИИ как эмитент событий — MCP tools

ИИ получает инструменты трекера через `SherpaMcpServer` (уже существует):

```typescript
// Добавляется в per-turn toolset:
{
  name: 'tracker_move_task',
  description: 'Move the current task to a different Kanban stage',
  inputSchema: { stageId: string }
},
{
  name: 'tracker_set_field',
  description: 'Set a custom field value on the current task',
  inputSchema: { fieldId: string; value: FieldValue }
},
{
  name: 'tracker_list_tasks',
  description: 'List tasks in the project tracker',
  inputSchema: { stageId?: string; subProjectId?: string; limit?: number }
}
```

Каждый вызов → `TrackerService` → `emit(event)` → все подписчики.

---

## 6. AI Session — сохранение и возобновление

### 6.1 Сохранение при закрытии

При закрытии чата (задача переходит в `status: 'closed'`):
1. `TrackerService` подписан на `TaskService.onTaskClosed()`
2. Если у задачи `tracker_stage_id IS NOT NULL` — запрашивается summary
3. Summary сохраняется в `task.tracker_session_summary`
4. Emit `task.session_closed`

Summary-промпт (вызов через существующий adapter):
```
Summarize this session for context restoration in 3-5 sentences.
Focus on: what was done, what decisions were made, what remains.
```

### 6.2 Возобновление сессии

При повторном открытии задачи с непустым `tracker_session_summary`:

```
[Системный промпт включает:]

## Task context (restored)
Title: {task.title}
Stage: {stage.name}

## Previous session summary
{task.tracker_session_summary}

Continue from where you left off.
```

Полный thread сохраняется в `thread_json` и доступен пользователю для просмотра в UI. ИИ получает только резюме + последние N сообщений (configurable, по умолчанию 20).

---

## 7. UI — представления

### 7.1 Список задач (существующее, расширяется)

Нынешний список задач остаётся. Люди без трекера видят его как список чатов — ничего не меняется. Дополнения:

- Колонка/бейдж "стадия" для задач с `tracker_stage_id`
- Фильтр по стадии (dropdown)
- Фильтр по подпроекту

### 7.2 Kanban-view (новое)

Переключатель вид: `List | Board`. Board = канбан.

```
┌─ Backlog ─────┐  ┌─ In Progress ─┐  ┌─ Done ────────┐
│ Задача A      │  │ Задача C      │  │ Задача E      │
│ Задача B      │  │               │  │               │
│ [+ Добавить]  │  │               │  │               │
└───────────────┘  └───────────────┘  └───────────────┘
```

- Drag-and-drop между колонками → `moveToStage()`
- Клик на карточке → открывает Task workspace (чат)
- "+ Добавить" в колонке → создаёт задачу сразу с нужной стадией

### 7.3 Настройки доски (новое)

Доступно через ⚙ на Kanban-view:
- Добавить/переименовать/удалить/переупорядочить стадии
- Добавить/удалить кастомные поля (тип, имя, default)
- Управление подпроектами

---

## 8. IPC-контракт

Добавляется в `src/main/ipc/tracker_handlers.ts`:

```typescript
'tracker:getBoardConfig'     → BoardConfig
'tracker:setBoardConfig'     → void
'tracker:listSubProjects'    → SubProject[]
'tracker:createSubProject'   → SubProject
'tracker:deleteSubProject'   → void
'tracker:moveToStage'        → Task
'tracker:setField'           → Task
'tracker:assignSubProject'   → Task
'tracker:listTrackerTasks'   → Task[]
'tracker:getSessionSummary'  → string | null
```

---

## 9. Миграция существующих данных

БД уже может содержать задачи. При расширении `SCHEMA` в `project_database.ts`:

```sql
-- Безопасно: ALTER TABLE с DEFAULT не ломает существующие строки
ALTER TABLE tasks ADD COLUMN tracker_stage_id       TEXT;
ALTER TABLE tasks ADD COLUMN tracker_fields         TEXT NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN tracker_sub_project_id TEXT;
ALTER TABLE tasks ADD COLUMN tracker_session_summary TEXT;

-- Начальная конфиг доски — три стадии по умолчанию
INSERT OR IGNORE INTO tracker_board_config (sub_project_id, stages_json, field_defs_json, updated_at)
VALUES ('', '[
  {"id":"backlog","name":"Backlog","category":"backlog","order":0},
  {"id":"in-progress","name":"In Progress","category":"active","order":1},
  {"id":"done","name":"Done","category":"done","order":2}
]', '[]', datetime('now'));
```

SQLite `ALTER TABLE ... ADD COLUMN` с дефолтом не требует data migration — это O(1) без переписи строк.

---

## 10. Что намеренно оставлено на потом

| Фича | Причина отсрочки |
|------|-----------------|
| Relations между задачами | Кастомное поле типа `relation` (future FieldType) |
| Subtasks | `parent_task_id` в `tasks`, нет UX-концепции пока |
| Due dates | Кастомное поле типа `date` с именем "Due date" |
| Priority | Кастомное поле типа `select` с именем "Priority" |
| Assignees | Кастомное поле типа `select` с именем "Assignee" (solo-first) |
| Calendar / Timeline view | Нужны due dates + relations |
| Notifications | Требует persistence layer для rule engine |
| Импорт из Jira | Extension через event system |
| Task templates | После накопления пользовательских данных о частых полях |
| Глобальный вид "все проекты" | Отдельная архитектурная задача (cross-project aggregation) |
| Дерево подпроектов > 2 уровней | `parent_id` есть в схеме, UI пока flat |

---

## 11. Что нужно для начала плана реализации

Все решения приняты. Можно писать план.

**Точки интеграции в существующем коде:**

| Файл | Изменение |
|------|-----------|
| `src/core/adapters/project_database.ts` | Добавить таблицы + ALTER TABLE в SCHEMA |
| `src/core/domain/task.ts` | Добавить 4 tracker-поля в `Task` interface |
| `src/main/services/task_service.ts` | persist() / rowToTask() — учитывать новые колонки |
| `src/main/services/tracker_service.ts` | Новый сервис |
| `src/main/ipc/tracker_handlers.ts` | Новые IPC handlers |
| `src/main/composition_root.ts` | Инжектировать TrackerService |
| `src/renderer/store/tracker.ts` | Новый Zustand store |
| `src/presentation/screens/TaskList/` | Расширить список: view-toggle, stage badge |
| `src/presentation/screens/KanbanBoard/` | Новый экран |
| `src/presentation/screens/BoardSettings/` | Новый экран: стадии + поля |
