# Plugins

Sherpa supports user-installable plugins that extend the application
with new languages, methodology overlays, hooks, or panels.

> Implements UX flow F9 (`design/ux.md §F9`) and ADR-009 — three-tier
> discovery + B2-SEC trust gate + B4-SEC bundled-override block.

## Discovery scopes

Sherpa searches three locations, in order:

1. **Bundled** — ships with the app under
   `resources/plugins/`. Always trusted, always enabled.
2. **User-global** — `~/.sherpa/plugins/<id>/`. Available to every
   project. Trust required on first enable.
3. **Workspace** — `<project>/.sherpa/plugins/<id>/`. Available
   only inside that project. Trust required on first enable; cannot
   override a bundled plugin with a security-critical capability
   (B4-SEC).

Open **Settings → Plugins** to see the discovery results grouped by
scope, with status pills:

| Pill | Meaning |
|---|---|
| `enabled` | Plugin loaded successfully. |
| `disabled` | Discovered but not loaded — toggle to enable. |
| `untrusted` | Manifest valid; user has not yet confirmed trust. |
| `load_error` | Loader threw during entry-point invocation; click for stderr. |
| `blocked` | A bundled plugin with the same id and overlapping security capability exists; load skipped (B4-SEC). |

[screenshot: Settings → Plugins — workspace tab with one untrusted plugin]

## Manifest schema

Every plugin folder must contain a top-level `manifest.json`:

```json
{
  "id": "my-dsl",
  "name": "MyDSL language pack",
  "version": "0.1.0",
  "entry": "./index.js",
  "capabilities": ["language"],
  "scope": "workspace",
  "author": "You <you@example.com>",
  "license": "MIT"
}
```

Required fields: `id`, `name`, `version`, `entry`, `capabilities`.
The schema is JSON-Schema-validated by the loader before the entry
point is executed; rejected manifests appear with `load_error`.

Permitted capabilities (v0.1):

- `language` — adds a CodeMirror 6 language mode and tree-sitter
  parser hook.
- `methodology` — registers a methodology overlay.
- `hook` — adds a managed-style inline hook.
- `panel` — registers a custom Workspace panel.

Capabilities not in this list are silently ignored, with a
`load_error` warning.

## Installing a workspace plugin

1. Drop the plugin folder into `<project>/.sherpa/plugins/<id>/`.
2. Reopen **Settings → Plugins** (or press the **Refresh** button).
3. The plugin appears in the **Workspace** tab with a `disabled`
   pill.
4. Click the toggle. A **Trust** modal appears:

   [screenshot: Trust modal — "Confirm trust for workspace plugin"]

   - **Cancel** dismisses the modal; the toggle stays off.
   - **Trust and enable** writes to a per-project trust list and
     calls `plugin:enable` IPC.

The trust gate (B2-SEC) is layered four times — the modal, the IPC
parameter, the use-case guard, and an adapter recheck — so a
bypass on one layer cannot leak through.

## Bundled-override block (B4-SEC)

If a workspace plugin declares the same id as a bundled plugin AND
the workspace plugin lists any capability in the security-critical
set (currently `["language", "hook"]`), the loader refuses to load
the workspace version and emits an audit log entry with reason
`security_critical_override_blocked`.

You can still install a workspace plugin that overrides a bundled
non-security-critical capability — for example a custom
`methodology` overlay with the same id is fine.

## Path traversal rejection (B1-SEC)

Plugin folders containing `..` segments in their internal paths
(e.g. an `entry` of `../escape.js`) are rejected during discovery.
The audit log records the attempt with reason `path_traversal_rejected`.

## Managing trust

Per-project trust state lives in
`<project>/.sherpa/plugins-trust.json`. To revoke trust:

1. Open **Settings → Plugins → Workspace**.
2. Toggle the plugin off; the trust entry is preserved.
3. Click the **Forget trust** link to delete the trust record so the
   modal appears again next time you toggle on.

## Audit log entries

Plugin events emit metadata-only JSONL records (per ADR-010):

```json
{"ts":"2026-05-04T12:00:00Z","hook":"sherpa.audit.log","event":"plugin_enabled","id":"my-dsl","scope":"workspace"}
{"ts":"2026-05-04T12:00:01Z","hook":"sherpa.audit.log","event":"plugin_loaded","id":"my-dsl","ok":true}
```

Loader errors include the message but never the stack trace beyond
the immediate cause.

## Disabling a plugin

Toggle the plugin off in **Settings → Plugins**. The loader
unsubscribes the plugin's hooks, removes its language registrations,
and detaches its panels. Restart of the app is NOT required — the
loader is hot-aware in v0.1.

If a plugin throws synchronously on disable (rare), Sherpa still
marks it as disabled and emits a `load_error` so you can see the
issue. Restart to fully recover.

## Coming in v0.2

- Signed plugins — manifest signature verified against a publisher
  key; trust modal automatically accepts known publishers.
- Sandbox — Worker / vm isolation around plugin entry points (not
  available in v0.1).
- Plugin marketplace — discover and install plugins without manual
  filesystem copy.
- Author guide — full API reference for capability authors.

## Related documentation

- [Settings — Hooks](settings.md#hooks) — the user-hook surface
  exposed via plugin `hook` capability.
- `docs/architecture/QUICKSTART.md` — `PluginPort` and adapter
  layout for plugin authors.
- ADR-009 (`<sherpa-source>/decisions/ADR-009.md`) — the security
  model in full detail.
