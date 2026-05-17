// src/presentation/screens/TaskWorkspace/ArtifactsPanelConnected.tsx
// Connected wrapper for ArtifactsPanel — reads projectPath + taskId from stores.
import type { ReactElement } from 'react';
import { useTask } from '../../../renderer/store/task';
import { useProject } from '../../../renderer/store/project';
import { ArtifactsPanel } from './ArtifactsPanel';

export function ArtifactsPanelConnected(): ReactElement {
  const projectPath = useProject((s) => s.current?.path ?? '');
  const taskId = useTask((s) => s.current?.id ?? '');
  return <ArtifactsPanel projectPath={projectPath} taskId={taskId} />;
}
