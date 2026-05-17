// Opt-in integration test for ClaudeCodeAdapter.
//
// Default OFF — set `SHERPA_CLAUDE_INTEGRATION=1` to enable. This test
// shells out to the real `claude` binary on PATH and therefore depends on
// (a) the binary being installed and (b) the user being OAuth-authenticated.

import { describe, test, expect } from 'vitest';
import { ClaudeCodeAdapter } from '../../../src/core/adapters/agents/claude_code';

const runIntegration = process.env['SHERPA_CLAUDE_INTEGRATION'] === '1';

describe.runIf(runIntegration)('ClaudeCodeAdapter integration', () => {
  test('health() returns ok with real claude CLI on PATH', async () => {
    const adapter = new ClaudeCodeAdapter();
    const h = await adapter.health();
    expect(h.ok).toBe(true);
  });
});
