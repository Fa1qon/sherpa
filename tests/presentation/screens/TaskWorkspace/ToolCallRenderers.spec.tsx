import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import en from '../../../../src/renderer/locales/en.json';
import { ToolCallDetail, toolCallSummary } from '../../../../src/presentation/screens/TaskWorkspace/ToolCallRenderers';
import type { ToolCall } from '../../../../src/core/domain/agent';

if (!i18n.isInitialized) {
  void i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
}

function renderDetail(tc: ToolCall) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ToolCallDetail toolCall={tc} />
    </I18nextProvider>,
  );
}

describe('toolCallSummary', () => {
  test('TodoWrite shows task count', () => {
    const tc: ToolCall = { name: 'TodoWrite', args: { todos: [{content:'a',status:'done',activeForm:'doing a'},{content:'b',status:'pending',activeForm:'doing b'}] }, status: 'success' };
    expect(toolCallSummary(tc)).toBe('TodoWrite (2 tasks)');
  });

  test('AskUserQuestion shows first question text', () => {
    const tc: ToolCall = { name: 'AskUserQuestion', args: { questions: [{ question: 'Pick an approach?', header: 'Approach', multiSelect: false, options: [] }] }, status: 'pending' };
    expect(toolCallSummary(tc)).toBe('AskUserQuestion — "Pick an approach?"');
  });

  test('Agent shows description', () => {
    const tc: ToolCall = { name: 'Agent', args: { description: 'Explore the codebase for X', prompt: '...' }, status: 'pending' };
    expect(toolCallSummary(tc)).toBe('Agent — Explore the codebase for X');
  });

  test('Bash shows command (existing behaviour)', () => {
    const tc: ToolCall = { name: 'Bash', args: { command: 'npm test' }, status: 'success' };
    expect(toolCallSummary(tc)).toBe('Bash npm test');
  });

  test('generic tool shows name + first arg value', () => {
    const tc: ToolCall = { name: 'Read', args: { file_path: '/src/foo.ts' }, status: 'success' };
    expect(toolCallSummary(tc)).toBe('Read /src/foo.ts');
  });
});

describe('ToolCallDetail', () => {
  test('TodoWrite renders checklist', () => {
    const tc: ToolCall = {
      name: 'TodoWrite',
      args: { todos: [
        { content: 'Fix bug', status: 'done', activeForm: 'Fixing bug' },
        { content: 'Write tests', status: 'in_progress', activeForm: 'Writing tests' },
        { content: 'Deploy', status: 'pending', activeForm: 'Deploying' },
      ]},
      status: 'success',
    };
    renderDetail(tc);
    expect(screen.getByText('Fix bug')).toBeInTheDocument();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
  });

  test('AskUserQuestion renders question and options', () => {
    const tc: ToolCall = {
      name: 'AskUserQuestion',
      args: { questions: [{ question: 'Which approach?', header: 'Approach', multiSelect: false, options: [
        { label: 'Option A', description: 'First option' },
        { label: 'Option B', description: 'Second option' },
      ]}]},
      status: 'pending',
    };
    renderDetail(tc);
    expect(screen.getByText('Which approach?')).toBeInTheDocument();
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  test('generic tool renders pretty JSON', () => {
    const tc: ToolCall = { name: 'Read', args: { file_path: '/foo.ts' }, status: 'success' };
    renderDetail(tc);
    expect(screen.getByText(/file_path/)).toBeInTheDocument();
    expect(screen.getByText(/\/foo\.ts/)).toBeInTheDocument();
  });
});
