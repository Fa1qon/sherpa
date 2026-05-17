# Kanban board

The Kanban view visualises every task in the project as a card on the
Sherpa methodology stage strip. It mirrors the structure of
`<project>/projects/<projectId>/tasks/<taskId>/meta.md`.

> Implements UX flow F4 (`design/ux.md §F4`) — task creation through
> the router-classifier dialog.

## Opening the Kanban

[screenshot: Workspace with the kanban icon in the ActivityBar highlighted]

1. From any Workspace view, click the **kanban** icon in the
   left-hand ActivityBar.
2. The Kanban screen replaces the centre pane; columns correspond to
   methodology stages (default for `standard_rdpi`: W1 → W2 → … →
   W6 / done).

Each card shows:

- Task ID (`<project>-<NNN>`)
- Title (first line of `meta.md` front-matter `title`)
- Methodology stage flags
- Severity / risk pills

Click a card to focus it in the Task Context Sidebar; double-click to
open the task in the central editor.

## Creating a new task

[screenshot: CreateTaskDialog — title, description, methodology fields]

1. Click **+ New task** (top-right of the Kanban) OR press `Ctrl+T`.
2. Fill the form:
   - **Title** — short, present tense ("Add VAT calculation").
   - **Description** — 1-3 sentences. The router uses this to
     classify the task.
   - **Methodology** — defaults to the project's configured one.
3. Click **Create**.

What happens next:

- Sherpa creates `projects/<projectId>/tasks/<taskId>/meta.md` with
  the Tier 0 schema — `task_id`, `project`, `title`, `task_type`,
  `severity`, `risk`, `complexity`, `methodology`, `current_stage`,
  `status`, `date_started`, `stage_flags`.
- The task is classified at stage **W1** by the Phase-3 stub
  classifier. (Full FR13 Block A/B/C interactive router is *Coming
  in v0.2*; the simplified single-step form matches `ux.md §F4`'s
  fast path: "if description is obviously classifiable, the router
  skips Block A".)
- The Kanban refreshes and the new card appears in the W1 column.

If the dialog vanishes without creating a card, check the IPC log in
DevTools (`Ctrl+Shift+I`) — likely the storage backend rejected the
write (e.g. read-only project root).

## Moving cards

Drag-and-drop is powered by `@dnd-kit/sortable`. Drop targets
highlight while dragging.

- Cards can move forward and backward; the timeline file
  (`tasks/<id>/timeline.json`) records each transition with
  timestamps for audit purposes.
- Stage transitions emit a `TaskStageChanged` event on the in-memory
  Event Bus, which downstream UI (Activity feed, Recovery snapshot)
  subscribes to.

## Task detail and timeline

[screenshot: Task detail view with timeline and chat history]

Open a task by double-clicking the card. You see:

- The rendered `meta.md` (read-only by default; click the pencil to
  edit).
- The chronological **Timeline** of stage transitions.
- The agent **Chat history** for this task — replayed from
  `chat_history.jsonl`.

Editing `meta.md` writes through `StoragePort` with an atomic temp
file + rename (NF14), so a crash mid-edit cannot corrupt the file.

## Recovery interactions

If Sherpa crashed during a kanban session, the recovery flow (see
[crash recovery in getting-started](getting-started.md)) will restore
your tabs and chat history. The Kanban itself is computed from
`tasks/<id>/meta.md` files on disk — there is no separate kanban
store to corrupt.

## Coming in v0.2

- Full FR13 router questions (Block A/B/C) — interactive, keyboard-
  navigable classification before card creation.
- Bulk operations (select multiple cards, batch move, batch close).
- Custom methodology overlays per project.

## Related documentation

- [Running an agent session](agent.md) — agents work against the task
  selected on the Kanban.
- [Settings — Methodology](settings.md#methodology) — change the
  default methodology and stage flags.
