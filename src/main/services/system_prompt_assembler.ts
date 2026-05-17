// src/main/services/system_prompt_assembler.ts
// Plan 8 Task 11 — SystemPromptAssembler.
// Single source of truth for "what does the agent see at stage start".
// Deterministic composition order:
//   1. Base template (with {placeholder} substitution)
//   2. AI directives section
//   3. Complexity-adaptive scope addendum
//   4. Corpus reads (only when inject_into is 'system_prompt' or undefined)
//   5. Input artifacts summary
//   6. (Stack rules — stub, wired in Plan 12)
//   7. Browser capability section (when a browser session is active for the task)
//   8. Strictness directive
// Sections joined by `\n\n---\n\n`.
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import type {
  Methodology,
  Stage,
  StageTools,
  CorpusRead,
} from '../../core/domain/methodology';
import type { Task } from '../../core/domain/task';
import { strictnessDirective } from '../../core/domain/strictness_directives';
import type { BrowserService } from './browser_service';

export interface AssemblyContext {
  readonly methodology: Methodology;
  readonly stage: Stage;
  readonly task: Task;
  readonly projectPath: string;
  /** path → content. Engine resolves before calling assemble(). */
  readonly inputArtifacts: ReadonlyMap<string, string>;
  /** active methodology mode (overrides Task.agent_mode for substitution if set) */
  readonly mode?: string;
}

export interface AssembledPrompt {
  readonly systemPrompt: string;
  readonly toolsetOverride?: Partial<StageTools>;
  readonly userViewTemplate?: string;
}

export type CorpusLoader = (cr: CorpusRead, projectPath: string) => Promise<string>;

const SECTION_SEP = '\n\n---\n\n';

const defaultCorpusLoader: CorpusLoader = async (cr, projectPath) => {
  const abs = path.isAbsolute(cr.path) ? cr.path : path.join(projectPath, cr.path);
  return fsp.readFile(abs, 'utf8');
};

export class SystemPromptAssembler {
  private readonly loadCorpus: CorpusLoader;
  private browserService?: BrowserService;

  constructor(loadCorpus?: CorpusLoader) {
    this.loadCorpus = loadCorpus ?? defaultCorpusLoader;
  }

  setBrowserService(svc: BrowserService): void {
    this.browserService = svc;
  }

  async assemble(ctx: AssemblyContext): Promise<AssembledPrompt> {
    const parts: string[] = [];

    // 1. Base prompt template (with placeholder substitution).
    if (ctx.stage.system_prompt_template) {
      parts.push(renderTemplate(ctx.stage.system_prompt_template, ctx));
    }

    // 2. AI directives as a distinct section.
    if (ctx.stage.ai_directives && ctx.stage.ai_directives.length > 0) {
      const lines = ['## AI directives'];
      for (const d of ctx.stage.ai_directives) lines.push(`- ${d}`);
      parts.push(lines.join('\n'));
    }

    // 3. Complexity-adaptive scope addendum.
    if (ctx.task.complexity && ctx.stage.scope_by_complexity) {
      const override = ctx.stage.scope_by_complexity[ctx.task.complexity];
      if (override?.system_prompt_addendum) {
        parts.push(override.system_prompt_addendum);
      }
    }

    // 4. Corpus reads (system_prompt-targeted only).
    for (const cr of ctx.stage.corpus_reads ?? []) {
      const target = cr.inject_into ?? 'system_prompt';
      if (target !== 'system_prompt') continue;
      let content: string;
      try {
        content = await this.loadCorpus(cr, ctx.projectPath);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        parts.push(`[corpus read failed: ${cr.path} — ${reason}]`);
        continue;
      }
      parts.push(`## ${cr.purpose}\n\n${content}`);
    }

    // 4.5. Knowledge auto-injection from methodology deps.
    // Reads .sherpa/knowledge/<id>.md for each knowledge dep declared in the
    // methodology. Mirrors the corpus_reads pattern for consistency.
    const knowledgeDeps = ctx.methodology.deps?.flatMap((d) => d.knowledge ?? []) ?? [];
    for (const knowledgeId of knowledgeDeps) {
      const knowledgePath = path.join(
        ctx.projectPath,
        '.sherpa',
        'knowledge',
        `${knowledgeId}.md`,
      );
      let content: string;
      try {
        content = await fsp.readFile(knowledgePath, 'utf8');
      } catch {
        parts.push(`[knowledge dep missing: ${knowledgeId}]`);
        continue;
      }
      parts.push(`## Knowledge: ${knowledgeId}\n\n${content}`);
    }

    // 5. Input artifacts summary.
    for (const ref of ctx.stage.contract.input ?? []) {
      const content = ctx.inputArtifacts.get(ref.artifact);
      if (typeof content === 'string') {
        parts.push(`## Input: ${ref.artifact}\n\n${content}`);
      }
    }

    // 5.5. Output artifact path — tells the agent exactly where to write.
    if (ctx.stage.contract.output?.path) {
      const taskDir = `.sherpa/tasks/${ctx.task.id}`;
      const outputPath = `${taskDir}/${ctx.stage.contract.output.path}`;
      parts.push(
        `## Output location\n\nWrite your output to: \`${outputPath}\`\n\nThis is relative to the project root (\`${ctx.projectPath}\`). Create parent directories as needed. The gate evaluator checks for this file to advance to the next stage.`,
      );
    }

    // 6. Active stack rules — stub (Plan 12).

    // 6.5. Sherpa UI context — overrides CLI-era conventions baked into
    // methodology docs (workflow_stages.md was written for the CLI runner).
    // The completion instruction is mode-aware: interactive stages must wait
    // for explicit user confirmation before calling sherpa_stage_complete.
    const needsUserConfirmation =
      ctx.stage.mode === 'interactive' ||
      (ctx.stage.gate?.items ?? []).some((i) => i.kind === 'user_confirmed');

    const jobLine = needsUserConfirmation
      ? '**Your job for this stage:** follow the stage protocol above fully — run all required dialogue steps and gates with the user, produce the output artifact, and call `sherpa_stage_complete` only after receiving explicit user confirmation.'
      : '**Your job for this stage:** read the input artifacts provided above, produce the output artifact at the path specified in "Output location", then call `sherpa_stage_complete`.';

    const completionInstruction = needsUserConfirmation
      ? `## Stage completion
When the output artifact is written AND the user has explicitly confirmed your output, call the \`sherpa_stage_complete\` tool with:
- \`summary\`: a brief description of what was accomplished this stage
- \`artifacts\`: list of relative paths (from project root) of output files you created or updated

**IMPORTANT — interactive stage:** do NOT call this tool immediately after writing the artifact. First present your output, run all required dialogue and gate steps from the stage protocol above, and wait for an explicit affirmative from the user (e.g. "ок", "продолжай", "подтверждаю", "всё правильно"). Only then call the tool.

Call the tool EXACTLY ONCE per stage. If it returns an error about missing artifacts, create them and call it again.`
      : `## Stage completion
When all deliverables for the current stage are complete, call the \`sherpa_stage_complete\` tool with:
- \`summary\`: a brief description of what was accomplished this stage
- \`artifacts\`: list of relative paths (from project root) of output files you created or updated

Call the tool EXACTLY ONCE per stage. The tool validates artifact presence and automatically advances the task to the next stage.

If the tool returns an error about missing artifacts, create the missing files and call the tool again.`;

    parts.push(`## Sherpa UI context

You are running inside the Sherpa UI application, not the CLI. The following CLI-era conventions do NOT apply here — skip them entirely:

- Do NOT create or update \`meta.md\`. Task state (status, stage, phase) is managed by the Sherpa UI automatically.
- Do NOT create or update \`tasks.json\` or \`details/<id>.json\`. The UI tracks all task metadata in its own database.
- Do NOT include a stage tag at the start of your response (e.g. \`[W1 | #abc Task title]\`). The Sherpa UI shows stage information in the sidebar panel — inline tags are not needed and will confuse the user.
- Do NOT generate review checklists, gate confirmation menus, or reviewer summaries. Gate evaluation and stage advancement are handled by the Sherpa UI — your output goes directly to the user.
- Do NOT tell the user to refresh the page, switch stages manually, or click any button. Stage transitions happen automatically.

${jobLine}

${completionInstruction}

Everything else in the methodology (artifact content, writing quality, technical correctness) works as documented.`);

    // 7. Language directive — enforce Russian output unconditionally.
    parts.push(`## Language
Respond exclusively in Russian. Do not use English marketing terms (Nice-to-have, Must-have, Out of scope, Should, Won't have) — replace them with their Russian equivalents (Желательно, Обязательно, За рамками, Следует, Не планируется). All headings, bullet points, and prose must be in Russian.`);

    // 7.5. Browser capability section — only when a session is active for the task.
    const browserSession = this.browserService?.getSession(ctx.task.id);
    if (browserSession) {
      parts.push(`## Browser Access
A ${browserSession.mode} browser session is active for this task. Use these MCP tools to interact with the browser:
- \`browser_navigate(url)\` — navigate to a URL
- \`browser_screenshot()\` — capture a PNG screenshot (returned as image content)
- \`browser_click(selector)\` — click an element
- \`browser_type(selector, text)\` — fill an input field
- \`browser_evaluate(script)\` — run JavaScript and get the result
- \`browser_get_dom()\` — get the full HTML
- \`browser_wait_for(selector, timeout_ms?)\` — wait for an element to appear
- \`browser_highlight(selector)\` — highlight an element with an orange outline

When building UI mockups or testing pages, take a screenshot after each significant change to verify the result visually.`);
    }

    // 8. Strictness directive (always present).
    parts.push(strictnessDirective(ctx.task.strictness_mode ?? 'standard'));

    return {
      systemPrompt: parts.join(SECTION_SEP),
      userViewTemplate: ctx.stage.user_view_template,
    };
  }
}

/**
 * Substitutes `{path.to.value}` placeholders against an AssemblyContext.
 * Supported well-known keys:
 *   {project.name}    — basename of ctx.projectPath
 *   {task.complexity} — ctx.task.complexity ?? ''
 *   {task.agent_mode} — ctx.task.agent_mode ?? ''
 *   {meta.X}          — drilled from methodology.meta[X] (string-coerced)
 * Unknown placeholders are left as-is (deterministic; engine logs a warning).
 */
export function renderTemplate(tpl: string, ctx: AssemblyContext): string {
  return tpl.replace(/\{([^{}\s]+)\}/g, (match, key: string) => {
    const resolved = resolvePlaceholder(key, ctx);
    return resolved ?? match;
  });
}

function resolvePlaceholder(key: string, ctx: AssemblyContext): string | undefined {
  if (key === 'project.name') {
    return path.basename(ctx.projectPath) || ctx.projectPath;
  }
  if (key === 'task.title') {
    return ctx.task.title ?? '';
  }
  if (key === 'task.complexity') {
    return ctx.task.complexity ?? '';
  }
  if (key === 'task.agent_mode') {
    return ctx.task.agent_mode ?? '';
  }
  if (key.startsWith('meta.')) {
    const metaKey = key.slice('meta.'.length);
    const val = ctx.methodology.meta?.[metaKey];
    if (val === undefined || val === null) return undefined;
    return typeof val === 'string' ? val : JSON.stringify(val);
  }
  return undefined;
}
