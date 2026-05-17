// Typed dependency-injection container for the Electron main process.
//
// Tokens are unique symbols carrying a phantom type parameter so that
// register/resolve are type-safe at the call site. The Container is
// intentionally minimal: it has no factory/scope/lifecycle support —
// the Composition Root constructs adapter instances eagerly and
// registers them once. See ADR-001 §Compliance §1 (single Composition
// Root) and design/architecture.md §3.3 (Inversion of Control).
//
// No third-party imports. Pure TypeScript.

/**
 * Strongly-typed DI token. The phantom `__type` field is never assigned
 * at runtime; it exists purely so TypeScript can infer the registered
 * value type from the token at register/resolve sites.
 */
export type ContainerToken<T> = symbol & { __type?: T };

/**
 * Create a strongly-typed DI token.
 *
 * The `description` is propagated to the underlying Symbol and surfaces
 * in error messages from register/resolve. Use a stable, human-readable
 * name (e.g. `'AgentPort'`).
 */
export function token<T>(description: string): ContainerToken<T> {
  return Symbol(description) as ContainerToken<T>;
}

/**
 * Minimal type-safe DI container.
 *
 * Throws on duplicate registration and on unresolved lookups. Empty
 * containers are valid (the Phase 1 Composition Root returns one with
 * no registrations; T-L1-07 fills mock adapters).
 */
export class Container {
  private readonly registry = new Map<symbol, unknown>();

  register<T>(token: ContainerToken<T>, instance: T): void {
    if (this.registry.has(token)) {
      throw new Error(`Token ${token.description ?? '<anonymous>'} already registered`);
    }
    this.registry.set(token, instance);
  }

  resolve<T>(token: ContainerToken<T>): T {
    if (!this.registry.has(token)) {
      throw new Error(`Token ${token.description ?? '<anonymous>'} not registered`);
    }
    return this.registry.get(token) as T;
  }

  has<T>(token: ContainerToken<T>): boolean {
    return this.registry.has(token);
  }
}
