// tests/presentation/screens/TaskWorkspace/Markdown.coverage.spec.tsx
// Plan 4.6 / Task 5 — fixture-driven markdown coverage for the agent-bubble pipeline
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { MessageBubble } from '../../../../src/presentation/screens/TaskWorkspace/MessageBubble';
import type { AgentMessage } from '../../../../src/core/domain/agent';
import en from '../../../../src/renderer/locales/en.json';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

const FIXTURE = `# h1
## h2
### h3

**bold** and *italic* and ~~strike~~

Inline \`code\` here.

\`\`\`ts
const x: number = 42;
\`\`\`

External [link](https://example.com).
Relative [file](./src/foo.ts).
Anchor [section](#section).

- unordered
  - nested
- item 2

1. ordered
2. ordered

- [ ] task incomplete
- [x] task done

| col a | col b |
|-------|-------|
| 1     | 2     |

> quote

---
`;

const agentMsg = (text: string): AgentMessage => ({
  id: 'm',
  role: 'agent',
  text,
  timestamp: '2026-05-12T00:00:00Z',
});

function renderFixture() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MessageBubble message={agentMsg(FIXTURE)} />
    </I18nextProvider>,
  );
}

describe('Markdown coverage', () => {
  test('renders headings h1-h3', () => {
    const { getByRole } = renderFixture();
    expect(getByRole('heading', { level: 1, name: 'h1' })).toBeInTheDocument();
    expect(getByRole('heading', { level: 2, name: 'h2' })).toBeInTheDocument();
    expect(getByRole('heading', { level: 3, name: 'h3' })).toBeInTheDocument();
  });

  test('renders bold + italic + strikethrough', () => {
    const { container } = renderFixture();
    expect(container.querySelector('strong')).toBeTruthy();
    expect(container.querySelector('em')).toBeTruthy();
    expect(container.querySelector('del')).toBeTruthy();
  });

  test('renders inline code + fenced code block', () => {
    const { container } = renderFixture();
    expect(container.querySelector('code')).toBeTruthy();
    expect(container.querySelector('pre code')).toBeTruthy();
    const preCode = container.querySelector('pre code');
    expect(preCode?.textContent).toMatch(/const x: number = 42/);
  });

  test('renders external + relative + anchor links as <a> with correct href', () => {
    const { getByText } = renderFixture();
    expect(getByText('link').closest('a')).toHaveAttribute('href', 'https://example.com');
    expect(getByText('file').closest('a')).toHaveAttribute('href', './src/foo.ts');
    expect(getByText('section').closest('a')).toHaveAttribute('href', '#section');
  });

  test('renders ordered + unordered + task lists', () => {
    const { container } = renderFixture();
    expect(container.querySelector('ul')).toBeTruthy();
    expect(container.querySelector('ol')).toBeTruthy();
    expect(container.querySelector('input[type="checkbox"]')).toBeTruthy();
  });

  test('renders tables with th + td', () => {
    const { container } = renderFixture();
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.querySelector('th')).toBeTruthy();
    expect(container.querySelector('td')).toBeTruthy();
  });

  test('renders blockquotes', () => {
    const { container } = renderFixture();
    expect(container.querySelector('blockquote')).toBeTruthy();
  });

  test('renders horizontal rule', () => {
    const { container } = renderFixture();
    expect(container.querySelector('hr')).toBeTruthy();
  });
});
