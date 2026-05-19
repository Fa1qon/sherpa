import { useEffect, useState, type ReactElement } from 'react';
import { api, type MobileTask } from '../api/client';

export function TaskList(): ReactElement {
  const [tasks, setTasks] = useState<MobileTask[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const r = await api.listTasks();
        setTasks(r.tasks);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    };
    void load();
    const id = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="screen">
      <h2>Tasks</h2>
      {error && <div className="error">{error}</div>}
      <ul className="taskList">
        {tasks.map((t) => (
          <li key={t.id}>
            <a href={`#/tasks/${t.id}`} className={t.hasPendingGate ? 'pending' : ''}>
              <div className="title">{t.title}</div>
              <div className="meta">{t.status}{t.hasPendingGate ? ' • gate pending' : ''}</div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
