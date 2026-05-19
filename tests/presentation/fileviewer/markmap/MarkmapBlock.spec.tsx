import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarkmapBlock } from '../../../../src/presentation/fileviewer/markmap/MarkmapBlock';

describe('MarkmapBlock', () => {
  it('mounts without crashing', () => {
    const { container } = render(
      <MarkmapBlock source={'# Root\n\n## Child A\n## Child B'} />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
