// src/presentation/screens/Settings/sections/McpServers.tsx
// Track C Plan 03 Task 5 — Settings UI for MCP server CRUD.
//
// Persists the list via `useSettings` → `ipcClient.settings().setUser(...)`
// (the renderer settings store wraps the IPC roundtrip). Edits flow through
// a small inline form for both add and edit (the form is the same shape;
// edit mode pre-populates and updates the existing row in place).
//
// "Test" calls the dedicated `mcp.ping` IPC, which connects, lists tools,
// and disconnects on the main side. The result (✅ tool list or ❌ error)
// is shown in a transient status line beneath the row.

import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../../../renderer/store/settings';
import { ipcClient } from '../../../../renderer/ipc/client';
import {
  validateMcpServer,
  type McpServerConfig,
} from '../../../../core/domain/mcp_server';
import styles from './McpServers.module.css';

type Transport = 'stdio' | 'sse';

interface DraftState {
  readonly id: string;
  readonly transport: Transport;
  readonly command: string;
  /** One arg per line. Empty lines ignored. */
  readonly argsText: string;
  /** `KEY=VALUE` lines. Empty + malformed lines ignored. */
  readonly envText: string;
  readonly cwd: string;
  readonly url: string;
  /** `KEY=VALUE` lines. */
  readonly headersText: string;
}

interface PingState {
  readonly serverId: string;
  readonly ok: boolean;
  readonly message: string;
}

const EMPTY_DRAFT: DraftState = {
  id: '',
  transport: 'stdio',
  command: '',
  argsText: '',
  envText: '',
  cwd: '',
  url: '',
  headersText: '',
};

function parseKeyValueLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1);
    if (k === '') continue;
    out[k] = v;
  }
  return out;
}

function stringifyKeyValueRecord(rec: Readonly<Record<string, string>> | undefined): string {
  if (!rec) return '';
  return Object.entries(rec).map(([k, v]) => `${k}=${v}`).join('\n');
}

function configToDraft(cfg: McpServerConfig): DraftState {
  if (cfg.transport === 'stdio') {
    return {
      id: cfg.id,
      transport: 'stdio',
      command: cfg.command,
      argsText: (cfg.args ?? []).join('\n'),
      envText: stringifyKeyValueRecord(cfg.env),
      cwd: cfg.cwd ?? '',
      url: '',
      headersText: '',
    };
  }
  return {
    id: cfg.id,
    transport: 'sse',
    command: '',
    argsText: '',
    envText: '',
    cwd: '',
    url: cfg.url,
    headersText: stringifyKeyValueRecord(cfg.headers),
  };
}

function draftToConfig(d: DraftState): McpServerConfig {
  if (d.transport === 'stdio') {
    const args = d.argsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s !== '');
    const env = parseKeyValueLines(d.envText);
    const cfg: McpServerConfig = {
      id: d.id.trim(),
      transport: 'stdio',
      command: d.command.trim(),
      ...(args.length > 0 ? { args } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {}),
      ...(d.cwd.trim() !== '' ? { cwd: d.cwd.trim() } : {}),
    };
    return cfg;
  }
  const headers = parseKeyValueLines(d.headersText);
  const cfg: McpServerConfig = {
    id: d.id.trim(),
    transport: 'sse',
    url: d.url.trim(),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };
  return cfg;
}

export function McpServers(): ReactElement {
  const { t } = useTranslation();
  const user = useSettings((s) => s.user);
  const servers: readonly McpServerConfig[] = user.mcpServers ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [showDraft, setShowDraft] = useState(false);
  const [validationErrors, setValidationErrors] = useState<readonly string[]>([]);
  const [pingState, setPingState] = useState<PingState | null>(null);
  const [pingInFlight, setPingInFlight] = useState<string | null>(null);

  const persist = async (next: readonly McpServerConfig[]): Promise<void> => {
    const ns = { ...user, mcpServers: next };
    await ipcClient.settings().setUser(ns);
    // Keep the renderer store in sync so the UI reflects the change.
    await useSettings.getState().load();
  };

  const openAdd = (): void => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setShowDraft(true);
    setValidationErrors([]);
  };

  const openEdit = (cfg: McpServerConfig): void => {
    setEditingId(cfg.id);
    setDraft(configToDraft(cfg));
    setShowDraft(true);
    setValidationErrors([]);
  };

  const cancelDraft = (): void => {
    setShowDraft(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setValidationErrors([]);
  };

  const saveDraft = async (): Promise<void> => {
    const cfg = draftToConfig(draft);
    const result = validateMcpServer(cfg);
    if (!result.ok) {
      setValidationErrors(result.errors);
      return;
    }
    // Reject duplicate ids when adding; allow when editing the same row.
    if (editingId === null && servers.some((s) => s.id === cfg.id)) {
      setValidationErrors([`duplicate id "${cfg.id}"`]);
      return;
    }
    const next: McpServerConfig[] = editingId === null
      ? [...servers, cfg]
      : servers.map((s) => (s.id === editingId ? cfg : s));
    await persist(next);
    cancelDraft();
  };

  const removeServer = async (id: string): Promise<void> => {
    const next = servers.filter((s) => s.id !== id);
    await persist(next);
    if (pingState && pingState.serverId === id) setPingState(null);
  };

  const testConnection = async (cfg: McpServerConfig): Promise<void> => {
    setPingInFlight(cfg.id);
    setPingState(null);
    try {
      const r = await ipcClient.mcp().ping(cfg);
      if (r.ok) {
        const count = r.tools?.length ?? 0;
        const tail = (r.tools ?? []).join(', ');
        const head = t('mcpServers.connectedTools', { count });
        setPingState({
          serverId: cfg.id,
          ok: true,
          message: tail === '' ? head : `${head}: ${tail}`,
        });
      } else {
        setPingState({
          serverId: cfg.id,
          ok: false,
          message: t('mcpServers.connectionFailed', { error: r.error ?? 'unknown' }),
        });
      }
    } catch (err) {
      setPingState({
        serverId: cfg.id,
        ok: false,
        message: t('mcpServers.connectionFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
    } finally {
      setPingInFlight(null);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.heading}>{t('mcpServers.title')}</h3>
        <button className={styles.btnPrimary} onClick={openAdd}>
          {t('mcpServers.addServer')}
        </button>
      </div>

      {servers.length === 0 && !showDraft && (
        <p className={styles.empty}>{t('mcpServers.empty')}</p>
      )}

      <ul className={styles.list}>
        {servers.map((cfg) => {
          const isPinging = pingInFlight === cfg.id;
          const result = pingState && pingState.serverId === cfg.id ? pingState : null;
          return (
            <li key={cfg.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.id}>{cfg.id}</span>
                <span className={styles.pill} data-transport={cfg.transport}>
                  {cfg.transport === 'stdio' ? t('mcpServers.stdio') : t('mcpServers.sse')}
                </span>
                <span className={styles.target}>
                  {cfg.transport === 'stdio'
                    ? [cfg.command, ...(cfg.args ?? [])].join(' ')
                    : cfg.url}
                </span>
                <div className={styles.actions}>
                  <button className={styles.btn} onClick={() => openEdit(cfg)}>
                    {t('mcpServers.edit')}
                  </button>
                  <button
                    className={styles.btn}
                    disabled={isPinging}
                    onClick={() => void testConnection(cfg)}
                  >
                    {isPinging ? '…' : t('mcpServers.test')}
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnDanger}`}
                    onClick={() => void removeServer(cfg.id)}
                  >
                    {t('mcpServers.remove')}
                  </button>
                </div>
              </div>
              {result && (
                <div
                  className={`${styles.pingResult} ${result.ok ? styles.pingOk : styles.pingFail}`}
                >
                  {result.ok ? '✅ ' : '❌ '}{result.message}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {showDraft && (
        <div className={styles.draft}>
          <h4 className={styles.draftHeading}>
            {editingId === null ? t('mcpServers.addServer') : t('mcpServers.edit')}
          </h4>

          <label className={styles.field}>
            <span className={styles.label}>{t('mcpServers.id')}</span>
            <input
              className={styles.input}
              type="text"
              value={draft.id}
              onChange={(e) => setDraft({ ...draft, id: e.target.value })}
              disabled={editingId !== null}
              placeholder="my-mcp-server"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t('mcpServers.transport')}</span>
            <select
              className={styles.input}
              value={draft.transport}
              onChange={(e) =>
                setDraft({ ...draft, transport: e.target.value as Transport })
              }
            >
              <option value="stdio">{t('mcpServers.stdio')}</option>
              <option value="sse">{t('mcpServers.sse')}</option>
            </select>
          </label>

          {draft.transport === 'stdio' && (
            <>
              <label className={styles.field}>
                <span className={styles.label}>{t('mcpServers.command')}</span>
                <input
                  className={styles.input}
                  type="text"
                  value={draft.command}
                  onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                  placeholder="npx"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('mcpServers.args')}</span>
                <textarea
                  className={styles.textarea}
                  value={draft.argsText}
                  onChange={(e) => setDraft({ ...draft, argsText: e.target.value })}
                  rows={3}
                  placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/tmp'}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('mcpServers.env')}</span>
                <textarea
                  className={styles.textarea}
                  value={draft.envText}
                  onChange={(e) => setDraft({ ...draft, envText: e.target.value })}
                  rows={3}
                  placeholder="API_KEY=secret"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('mcpServers.cwd')}</span>
                <input
                  className={styles.input}
                  type="text"
                  value={draft.cwd}
                  onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
                />
              </label>
            </>
          )}

          {draft.transport === 'sse' && (
            <>
              <label className={styles.field}>
                <span className={styles.label}>{t('mcpServers.url')}</span>
                <input
                  className={styles.input}
                  type="text"
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://example.com/sse"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('mcpServers.headers')}</span>
                <textarea
                  className={styles.textarea}
                  value={draft.headersText}
                  onChange={(e) =>
                    setDraft({ ...draft, headersText: e.target.value })
                  }
                  rows={3}
                  placeholder="Authorization=Bearer ..."
                />
              </label>
            </>
          )}

          {validationErrors.length > 0 && (
            <ul className={styles.errors}>
              {validationErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}

          <div className={styles.draftActions}>
            <button className={styles.btnPrimary} onClick={() => void saveDraft()}>
              {t('mcpServers.save')}
            </button>
            <button className={styles.btn} onClick={cancelDraft}>
              {t('mcpServers.cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
