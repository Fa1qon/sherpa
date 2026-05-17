export interface AppEventMap {
  'task.stage.completed': {
    taskId: string;
    stageId: string;
    nextStageId: string;
    ts: string;
  };
  'task.methodology.completed': {
    taskId: string;
    ts: string;
  };
  'case.changed': {
    projectPath: string;
    caseId?: string;
    action: 'created' | 'deleted' | 'updated';
  };
  'knowledge.changed': {
    projectPath: string;
    knowledgeId: string;
    action: 'created' | 'updated' | 'deleted';
  };
  'artifact_template.changed': {
    projectPath: string;
    templateId: string;
    action: 'created' | 'updated' | 'deleted';
  };
}

export type AppEventName = keyof AppEventMap;
