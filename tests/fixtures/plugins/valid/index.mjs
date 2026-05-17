// Test fixture entry — plugin per ADR-009 §FR-P2.
// Provides `initialize(ctx)` and `capabilities()` exports; harmless side-effects.
export function initialize(ctx) {
  // ctx: { pluginId, scope }
  return Promise.resolve({ name: 'test-valid', ctx });
}

export function capabilities() {
  return [{ kind: 'language', label: 'Test language', config: { id: 'test' } }];
}

export default { initialize, capabilities };
