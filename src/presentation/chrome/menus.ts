// src/presentation/chrome/menus.ts
// Menu structure as data. AppChrome.tsx renders this declaratively.
// Each item has an id (for action dispatch), a label-key (for i18n), and
// optional hotkey + disabled flag. Plan 1 wires only project + view items;
// task / tools items are visible but disabled.

export interface MenuItem {
  /** Stable id used by action dispatch. */
  readonly id: string;
  /** i18n key for label. */
  readonly labelKey: string;
  /** Hotkey display, e.g. "⌘N". */
  readonly hotkey?: string;
  /** Disabled in Plan 1 (filled in later plans). */
  readonly disabled?: boolean;
  /** Render a separator instead of an item. */
  readonly separator?: false;
}

export interface Separator {
  readonly separator: true;
}

export type MenuEntry = MenuItem | Separator;

export interface MenuDef {
  readonly id: string;
  readonly labelKey: string;
  readonly entries: readonly MenuEntry[];
}

const SEP: Separator = { separator: true };

export const MENUS: readonly MenuDef[] = [
  {
    id: 'project',
    labelKey: 'chrome.menu.project',
    entries: [
      { id: 'project.new', labelKey: 'chrome.items.project.new', hotkey: 'Ctrl+N' },
      { id: 'project.openRecent', labelKey: 'chrome.items.project.openRecent' },
      { id: 'project.close', labelKey: 'chrome.items.project.close' },
      SEP,
      { id: 'project.settings', labelKey: 'chrome.items.project.settings' },
      {
        id: 'project.reloadMethodologies',
        labelKey: 'chrome.items.project.reloadMethodologies',
        disabled: true,
      },
      SEP,
      { id: 'project.quit', labelKey: 'chrome.items.project.quit', hotkey: 'Ctrl+Q' },
    ],
  },
  {
    id: 'task',
    labelKey: 'chrome.menu.task',
    entries: [
      { id: 'task.new', labelKey: 'chrome.items.task.new', hotkey: 'Ctrl+T' },
      { id: 'task.newWithMethodology', labelKey: 'chrome.items.task.newWithMethodology', disabled: true },
      { id: 'task.find', labelKey: 'chrome.items.task.find', hotkey: 'Ctrl+P' },
      SEP,
      { id: 'task.pause', labelKey: 'chrome.items.task.pause', hotkey: 'Ctrl+.', disabled: true },
      { id: 'task.resume', labelKey: 'chrome.items.task.resume', disabled: true },
      SEP,
      { id: 'task.close', labelKey: 'chrome.items.task.close', hotkey: 'Ctrl+W', disabled: true },
    ],
  },
  {
    id: 'view',
    labelKey: 'chrome.menu.view',
    entries: [
      { id: 'view.toggleLeftPanel', labelKey: 'chrome.items.view.toggleLeftPanel', hotkey: 'Ctrl+B' },
      { id: 'view.toggleRightPanel', labelKey: 'chrome.items.view.toggleRightPanel', hotkey: 'Ctrl+\\' },
      { id: 'view.zenMode', labelKey: 'chrome.items.view.zenMode', hotkey: 'Ctrl+K Z', disabled: true },
      SEP,
      { id: 'view.toggleArtifacts', labelKey: 'chrome.items.view.toggleArtifacts', disabled: true },
      { id: 'view.toggleStage', labelKey: 'chrome.items.view.toggleStage', hotkey: 'Ctrl+J', disabled: true },
      { id: 'view.togglePipeline', labelKey: 'chrome.items.view.togglePipeline', disabled: true },
      SEP,
      { id: 'view.boardLayout', labelKey: 'chrome.items.view.boardLayout', disabled: true },
      SEP,
      { id: 'view.theme', labelKey: 'chrome.items.view.theme' },
      { id: 'view.language', labelKey: 'chrome.items.view.language' },
    ],
  },
  {
    id: 'tools',
    labelKey: 'chrome.menu.tools',
    entries: [
      { id: 'tools.methodologyLibrary', labelKey: 'chrome.items.tools.methodologyLibrary' },
      { id: 'tools.casesBrowser', labelKey: 'chrome.items.tools.casesBrowser', disabled: true },
      { id: 'tools.reviewers', labelKey: 'chrome.items.tools.reviewers', disabled: true },
      SEP,
      { id: 'tools.agentCli', labelKey: 'chrome.items.tools.agentCli', disabled: true },
      { id: 'tools.mcpServers', labelKey: 'chrome.items.tools.mcpServers', disabled: true },
      SEP,
      { id: 'tools.openSherpaFolder', labelKey: 'chrome.items.tools.openSherpaFolder' },
    ],
  },
  {
    id: 'help',
    labelKey: 'chrome.menu.help',
    entries: [
      { id: 'help.docs', labelKey: 'chrome.items.help.docs', disabled: true },
      { id: 'help.shortcuts', labelKey: 'chrome.items.help.shortcuts', hotkey: 'Ctrl+/', disabled: true },
      { id: 'help.reportBug', labelKey: 'chrome.items.help.reportBug', disabled: true },
      SEP,
      { id: 'help.checkUpdates', labelKey: 'chrome.items.help.checkUpdates', disabled: true },
      { id: 'help.about', labelKey: 'chrome.items.help.about' },
      SEP,
      { id: 'help.devtools', labelKey: 'chrome.items.help.devtools' },
    ],
  },
];

/** Returns flat list of all hotkey-bearing items for global key handler. */
export function allHotkeys(): readonly { id: string; hotkey: string }[] {
  const result: { id: string; hotkey: string }[] = [];
  for (const menu of MENUS) {
    for (const entry of menu.entries) {
      if ('separator' in entry) continue;
      if (entry.hotkey) result.push({ id: entry.id, hotkey: entry.hotkey });
    }
  }
  return result;
}
