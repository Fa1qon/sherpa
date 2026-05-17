import { describe, test, expect } from 'vitest';
import {
  SystemPromptAssembler,
  renderTemplate,
  type AssemblyContext,
  type CorpusLoader,
} from '../../../src/main/services/system_prompt_assembler';
import type {
  Methodology,
  Stage,
  CorpusRead,
} from '../../../src/core/domain/methodology';
import type { Task } from '../../../src/core/domain/task';

function makeMethodology(overrides: Partial<Methodology> = {}): Methodology {
  return {
    id: 'm1',
    version: '1.0.0',
    name: 'M1',
    description: 'demo',
    stages: [],
    edges: [],
    ...overrides,
  };
}

function makeStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: 's1',
    name: 'Stage 1',
    mode: 'auto',
    contract: {
      input: [],
      output: { path: 'out.md' },
    },
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    methodologyId: 'm1',
    stageId: 's1',
    status: 'created',
    thread: [],
    config: { autonomy: 'interactive', urgency: 'normal', importance: 'normal' },
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    totalTokens: { input: 0, output: 0 },
    ...overrides,
  };
}

function makeCtx(overrides: Partial<AssemblyContext> = {}): AssemblyContext {
  return {
    methodology: makeMethodology(),
    stage: makeStage(),
    task: makeTask(),
    projectPath: '/tmp/projects/demo',
    inputArtifacts: new Map(),
    ...overrides,
  };
}

const SEP = '\n\n---\n\n';

describe('SystemPromptAssembler', () => {
  test('assembles base template only (plus UI context + default strictness)', async () => {
    const asm = new SystemPromptAssembler();
    // No output path → no output-location section emitted.
    const stage = makeStage({ system_prompt_template: 'Hello stage.', contract: { input: [], output: { path: '' } } });
    const out = await asm.assemble(makeCtx({ stage }));
    // Always includes: base template, Sherpa UI context note, strictness directive.
    expect(out.systemPrompt).toContain('Hello stage.');
    expect(out.systemPrompt).toContain('## Sherpa UI context');
    expect(out.systemPrompt).toContain('Strictness: standard.');
    // Base must come before UI context, which must come before strictness.
    const idxBase = out.systemPrompt.indexOf('Hello stage.');
    const idxUi = out.systemPrompt.indexOf('## Sherpa UI context');
    const idxStrict = out.systemPrompt.indexOf('Strictness: standard.');
    expect(idxBase).toBeLessThan(idxUi);
    expect(idxUi).toBeLessThan(idxStrict);
  });

  test('ai_directives appear as `## AI directives` section', async () => {
    const asm = new SystemPromptAssembler();
    const stage = makeStage({
      system_prompt_template: 'Base.',
      ai_directives: ['Be terse.', 'No emojis.'],
    });
    const out = await asm.assemble(makeCtx({ stage }));
    expect(out.systemPrompt).toContain(`${SEP}## AI directives\n- Be terse.\n- No emojis.${SEP}`);
  });

  test('omits AI directives section when list is empty', async () => {
    const asm = new SystemPromptAssembler();
    const stage = makeStage({
      system_prompt_template: 'Base.',
      ai_directives: [],
    });
    const out = await asm.assemble(makeCtx({ stage }));
    expect(out.systemPrompt).not.toContain('## AI directives');
  });

  test('complexity addendum included when both Task.complexity and matching override exist', async () => {
    const asm = new SystemPromptAssembler();
    const stage = makeStage({
      system_prompt_template: 'Base.',
      scope_by_complexity: { C3: { system_prompt_addendum: 'Apply C3 scope.' } },
    });
    const task = makeTask({ complexity: 'C3' });
    const out = await asm.assemble(makeCtx({ stage, task }));
    expect(out.systemPrompt).toContain('Apply C3 scope.');
  });

  test('complexity addendum omitted when task.complexity unset', async () => {
    const asm = new SystemPromptAssembler();
    const stage = makeStage({
      system_prompt_template: 'Base.',
      scope_by_complexity: { C3: { system_prompt_addendum: 'Apply C3 scope.' } },
    });
    const out = await asm.assemble(makeCtx({ stage }));
    expect(out.systemPrompt).not.toContain('Apply C3 scope.');
  });

  test('complexity addendum omitted when scope_by_complexity has no entry for that bucket', async () => {
    const asm = new SystemPromptAssembler();
    const stage = makeStage({
      system_prompt_template: 'Base.',
      scope_by_complexity: { C1: { system_prompt_addendum: 'Apply C1.' } },
    });
    const task = makeTask({ complexity: 'C4' });
    const out = await asm.assemble(makeCtx({ stage, task }));
    expect(out.systemPrompt).not.toContain('Apply C1.');
  });

  test('corpus_reads injected only when inject_into is `system_prompt` or undefined', async () => {
    const loaded: string[] = [];
    const loader: CorpusLoader = async (cr) => {
      loaded.push(cr.path);
      return `body-of-${cr.path}`;
    };
    const asm = new SystemPromptAssembler(loader);
    const reads: CorpusRead[] = [
      { path: 'a.md', content_type: 'markdown', purpose: 'Style guide', inject_into: 'system_prompt' },
      { path: 'b.md', content_type: 'markdown', purpose: 'Default target' /* no inject_into */ },
      { path: 'c.md', content_type: 'markdown', purpose: 'Tool ref', inject_into: 'tool_accessible' },
      { path: 'd.md', content_type: 'markdown', purpose: 'Ctx', inject_into: 'context_window' },
    ];
    const stage = makeStage({ corpus_reads: reads });
    const out = await asm.assemble(makeCtx({ stage }));
    expect(loaded).toEqual(['a.md', 'b.md']);
    expect(out.systemPrompt).toContain('## Style guide\n\nbody-of-a.md');
    expect(out.systemPrompt).toContain('## Default target\n\nbody-of-b.md');
    expect(out.systemPrompt).not.toContain('Tool ref');
    expect(out.systemPrompt).not.toContain('Ctx');
  });

  test('corpus load failure produces placeholder, does not throw', async () => {
    const loader: CorpusLoader = async () => {
      throw new Error('ENOENT: no such file');
    };
    const asm = new SystemPromptAssembler(loader);
    const stage = makeStage({
      corpus_reads: [{ path: 'missing.md', content_type: 'markdown', purpose: 'Style' }],
    });
    const out = await asm.assemble(makeCtx({ stage }));
    expect(out.systemPrompt).toContain('[corpus read failed: missing.md — ENOENT: no such file]');
  });

  test('input artifacts appended for each contract.input entry that has content', async () => {
    const asm = new SystemPromptAssembler();
    const stage = makeStage({
      contract: {
        input: [
          { stage: 'prev', artifact: 'spec.md' },
          { stage: 'prev', artifact: 'notes.md' },
          { stage: 'prev', artifact: 'absent.md' },
        ],
        output: { path: 'out.md' },
      },
    });
    const inputArtifacts = new Map<string, string>([
      ['spec.md', 'SPEC BODY'],
      ['notes.md', 'NOTES BODY'],
      // absent.md missing on purpose
    ]);
    const out = await asm.assemble(makeCtx({ stage, inputArtifacts }));
    expect(out.systemPrompt).toContain('## Input: spec.md\n\nSPEC BODY');
    expect(out.systemPrompt).toContain('## Input: notes.md\n\nNOTES BODY');
    expect(out.systemPrompt).not.toContain('absent.md');
  });

  test('strictness directive always present and varies by mode', async () => {
    const asm = new SystemPromptAssembler();
    const stage = makeStage();
    const autonomous = await asm.assemble(makeCtx({ stage, task: makeTask({ strictness_mode: 'autonomous' }) }));
    const careful = await asm.assemble(makeCtx({ stage, task: makeTask({ strictness_mode: 'careful' }) }));
    const verifyOnly = await asm.assemble(makeCtx({ stage, task: makeTask({ strictness_mode: 'verify_only' }) }));
    const dflt = await asm.assemble(makeCtx({ stage }));
    expect(autonomous.systemPrompt).toContain('Strictness: autonomous.');
    expect(careful.systemPrompt).toContain('Strictness: careful.');
    expect(verifyOnly.systemPrompt).toContain('Strictness: verify only.');
    expect(dflt.systemPrompt).toContain('Strictness: standard.');
  });

  test('sections joined by `\\n\\n---\\n\\n` in canonical order', async () => {
    const asm = new SystemPromptAssembler();
    const stage = makeStage({
      system_prompt_template: 'BASE',
      ai_directives: ['D'],
      scope_by_complexity: { C2: { system_prompt_addendum: 'SCOPE-C2' } },
      contract: {
        input: [{ stage: 'prev', artifact: 'a.md' }],
        output: { path: 'out.md' },
      },
    });
    const inputArtifacts = new Map([['a.md', 'A-BODY']]);
    const out = await asm.assemble(makeCtx({
      stage,
      task: makeTask({ complexity: 'C2', strictness_mode: 'standard' }),
      inputArtifacts,
    }));
    const idxBase = out.systemPrompt.indexOf('BASE');
    const idxDirectives = out.systemPrompt.indexOf('## AI directives');
    const idxScope = out.systemPrompt.indexOf('SCOPE-C2');
    const idxInput = out.systemPrompt.indexOf('## Input: a.md');
    const idxOutput = out.systemPrompt.indexOf('## Output location');
    const idxStrict = out.systemPrompt.indexOf('Strictness: standard.');
    expect(idxBase).toBeGreaterThanOrEqual(0);
    expect(idxBase).toBeLessThan(idxDirectives);
    expect(idxDirectives).toBeLessThan(idxScope);
    expect(idxScope).toBeLessThan(idxInput);
    expect(idxInput).toBeLessThan(idxOutput);
    expect(idxOutput).toBeLessThan(idxStrict);
    // Section separator appears between sections (8 sections → 7 separators).
    // Sections: base | ai_directives | scope | input | output | sherpa-ui-ctx | language | strictness
    const sepCount = out.systemPrompt.split(SEP).length - 1;
    expect(sepCount).toBe(7);
  });

  test('userViewTemplate passed through when stage has one', async () => {
    const asm = new SystemPromptAssembler();
    const stage = makeStage({ user_view_template: '# Hello {project.name}' });
    const out = await asm.assemble(makeCtx({ stage }));
    expect(out.userViewTemplate).toBe('# Hello {project.name}');
  });

  test('userViewTemplate undefined when stage has none', async () => {
    const asm = new SystemPromptAssembler();
    const out = await asm.assemble(makeCtx());
    expect(out.userViewTemplate).toBeUndefined();
  });

  test('renderTemplate substitutes {project.name} from projectPath basename', async () => {
    const asm = new SystemPromptAssembler();
    const stage = makeStage({ system_prompt_template: 'Project: {project.name}' });
    const out = await asm.assemble(makeCtx({ stage, projectPath: '/tmp/projects/alpha' }));
    expect(out.systemPrompt).toContain('Project: alpha');
  });

  test('renderTemplate leaves unknown placeholders as-is', async () => {
    const asm = new SystemPromptAssembler();
    const stage = makeStage({ system_prompt_template: 'Has {unknown.thing} and {project.name}.' });
    const out = await asm.assemble(makeCtx({ stage, projectPath: '/p/demo' }));
    expect(out.systemPrompt).toContain('Has {unknown.thing} and demo.');
  });

  test('renderTemplate substitutes {meta.X} from methodology.meta', async () => {
    const methodology = makeMethodology({ meta: { domain: 'research' } });
    const stage = makeStage({ system_prompt_template: 'Domain: {meta.domain}' });
    const out = renderTemplate(stage.system_prompt_template!, {
      methodology,
      stage,
      task: makeTask(),
      projectPath: '/p/x',
      inputArtifacts: new Map(),
    });
    expect(out).toBe('Domain: research');
  });

  test('renderTemplate substitutes {task.complexity} and {task.agent_mode}', async () => {
    const stage = makeStage({ system_prompt_template: 'C={task.complexity} M={task.agent_mode}' });
    const out = renderTemplate(stage.system_prompt_template!, {
      methodology: makeMethodology(),
      stage,
      task: makeTask({ complexity: 'C3', agent_mode: 'deep' }),
      projectPath: '/p/x',
      inputArtifacts: new Map(),
    });
    expect(out).toBe('C=C3 M=deep');
  });

  test('no system_prompt_template → output starts with first non-template section', async () => {
    const asm = new SystemPromptAssembler();
    const stage = makeStage({ ai_directives: ['Be precise.'] });
    const out = await asm.assemble(makeCtx({ stage }));
    expect(out.systemPrompt.startsWith('## AI directives')).toBe(true);
  });
});
