import { execSync } from 'node:child_process';

export const OLLAMA_BASE_URL = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
export const OLLAMA_MODEL = 'gemma3:4b';

export function ensureOllamaModel(): void {
  try {
    const out = execSync(`ollama list`, { encoding: 'utf8' });
    if (out.includes(OLLAMA_MODEL.split(':')[0]!)) {
      console.log(`[ollama-helper] ${OLLAMA_MODEL} already present.`);
      return;
    }
  } catch {
    throw new Error(`ollama CLI not found on PATH. Install Ollama first: https://ollama.com`);
  }
  console.log(`[ollama-helper] Pulling ${OLLAMA_MODEL} (this may take a few minutes)…`);
  execSync(`ollama pull ${OLLAMA_MODEL}`, {
    stdio: 'inherit',
    timeout: 10 * 60 * 1000,
  });
}

export function waitForOllama(timeoutMs = 30_000): void {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      execSync(`curl -sf ${OLLAMA_BASE_URL}/api/tags > /dev/null`, { timeout: 2000 });
      return;
    } catch {
      // Not ready yet
    }
  }
  throw new Error(`Ollama not reachable at ${OLLAMA_BASE_URL} after ${timeoutMs}ms`);
}
