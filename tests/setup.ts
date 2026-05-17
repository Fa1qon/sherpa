// Vitest setup — extends expect() with @testing-library/jest-dom
// matchers (toBeInTheDocument, toHaveAttribute, etc.) for renderer
// component tests. Loaded only by the jsdom-environment files (see
// vitest.config.ts environmentMatchGlobs).

import '@testing-library/jest-dom/vitest';
