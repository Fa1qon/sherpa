// src/presentation/screens/TaskWorkspace/StagesPanelConnected.tsx
// Connected wrapper for StagesPanel — reads meta + methodology from useTask store.
import type { ReactElement } from 'react';
import { useTask } from '../../../renderer/store/task';
import { StagesPanel } from './StagesPanel';

export function StagesPanelConnected(): ReactElement {
  const meta = useTask((s) => s.meta);
  const methodology = useTask((s) => s.methodology);
  return <StagesPanel methodology={methodology} meta={meta} />;
}
