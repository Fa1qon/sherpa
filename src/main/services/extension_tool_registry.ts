// src/main/services/extension_tool_registry.ts
// Extension Framework Plan 03 Task 3 — main-process registry for AI tools
// contributed by loaded extensions.
//
// Tool ids are qualified as `${extensionId}:${toolDef.id}` to keep the
// namespace flat while still being collision-safe across extensions.
// Adapter integration (chat / methodology surfaces) consumes `.list()` to
// build their tool catalogues; `.call()` is the synchronous dispatcher
// used when an agent emits a `tool_call` event naming an extension tool.

import type { ExtensionToolDef } from '../../core/domain/extension_manifest';
import type { ToolHandler } from '../../extensions/sdk/types';

export interface RegisteredTool {
  extensionId: string;
  def: ExtensionToolDef;
  handler: ToolHandler;
}

export class ExtensionToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  /**
   * Register a new tool. Throws if a tool with the same qualified id is
   * already present — extensions cannot silently shadow each other.
   */
  register(extensionId: string, def: ExtensionToolDef, handler: ToolHandler): void {
    const key = `${extensionId}:${def.id}`;
    if (this.tools.has(key)) {
      throw new Error(`Tool "${key}" already registered`);
    }
    this.tools.set(key, { extensionId, def, handler });
  }

  /**
   * Unregister every tool owned by `extensionId` (e.g. on extension
   * disable / unload). Returns the number of tools removed.
   */
  unregister(extensionId: string): number {
    let removed = 0;
    for (const [key, tool] of this.tools) {
      if (tool.extensionId === extensionId) {
        this.tools.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  list(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Dispatch a registered tool by its qualified id. Returns the handler's
   * result (or its resolved promise) verbatim; throws if no such tool.
   */
  async call(qualifiedToolId: string, input: unknown): Promise<unknown> {
    const tool = this.tools.get(qualifiedToolId);
    if (!tool) {
      throw new Error(`Tool "${qualifiedToolId}" not found`);
    }
    return tool.handler(input);
  }
}
