// Registers all built-in panel contributions into the PanelRegistry.
// Import this module once at app startup (side-effect import).
import { panelRegistry } from '../store/panel_registry';
import { StagesPanelConnected } from '../../presentation/screens/TaskWorkspace/StagesPanelConnected';
import { GatePanelConnected } from '../../presentation/screens/TaskWorkspace/GatePanelConnected';
import { ArtifactsPanelConnected } from '../../presentation/screens/TaskWorkspace/ArtifactsPanelConnected';
import { TodoPanelConnected } from '../../presentation/screens/TaskWorkspace/TodoPanelConnected';
import { ProjectDisplay } from '../../presentation/statusbar/ProjectDisplay';
import { TokenDisplay } from '../../presentation/statusbar/TokenDisplay';

// Task right-sidebar panels
panelRegistry.register({
  id: 'task.stages',
  slot: 'sidebar.right:task',
  component: StagesPanelConnected,
  title: 'Этапы',
  priority: 10,
});
panelRegistry.register({
  id: 'task.gate',
  slot: 'sidebar.right:task',
  component: GatePanelConnected,
  title: 'Гейт',
  priority: 20,
});
panelRegistry.register({
  id: 'task.artifacts',
  slot: 'sidebar.right:task',
  component: ArtifactsPanelConnected,
  title: 'Артефакты',
  priority: 30,
});

panelRegistry.register({
  id: 'task.todos',
  slot: 'sidebar.right:task',
  component: TodoPanelConnected,
  title: 'TODO',
  priority: 5,
});
// Browser panel intentionally not shown in sidebar —
// the browser service is AI-driven; no user-facing panel needed.

// Status bar registrations (zero-prop components, safe to register directly)
panelRegistry.register({
  id: 'statusbar.project',
  slot: 'statusbar.left',
  component: ProjectDisplay,
  priority: 10,
});
panelRegistry.register({
  id: 'statusbar.tokens',
  slot: 'statusbar.right',
  component: TokenDisplay,
  priority: 10,
});
