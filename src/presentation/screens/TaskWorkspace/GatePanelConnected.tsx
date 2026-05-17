// src/presentation/screens/TaskWorkspace/GatePanelConnected.tsx
// Connected wrapper for GatePanel — reads meta + methodology from useTask store.
import type { ReactElement } from 'react';
import { useTask } from '../../../renderer/store/task';
import { GatePanel } from './GatePanel';

export function GatePanelConnected(): ReactElement {
  const meta = useTask((s) => s.meta);
  const methodology = useTask((s) => s.methodology);
  return <GatePanel methodology={methodology} meta={meta} />;
}
