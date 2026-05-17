// Barrel — public surface of the Claude Code agent adapter (Plan 4 rewrite).

export { ClaudeCodeAdapter } from './adapter';
export type { ClaudeCodeAdapterOptions } from './adapter';
export {
  parseVersion,
  compareSemver,
  MIN_SUPPORTED_VERSION,
} from './capabilities';
