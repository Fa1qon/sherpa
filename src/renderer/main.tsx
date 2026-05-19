// Renderer entry — mounts <App /> into #root. Loaded by index.html;
// Vite handles HMR + bundling. Wrapped in StrictMode for React 19's
// dev-time double-invoke / effect-cleanup checks.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerDefaultViewers } from '../presentation/fileviewer/register_default_viewers';

registerDefaultViewers();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root missing — index.html must include <div id="root">');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
