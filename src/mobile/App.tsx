import { useEffect, useState, type ReactElement } from 'react';
import { getToken } from './api/client';
import { Login } from './pages/Login';
import { TaskList } from './pages/TaskList';
import { TaskDetail } from './pages/TaskDetail';

export function App(): ReactElement {
  const [route, setRoute] = useState<string>(window.location.hash.slice(1) || '/');
  const [authed, setAuthed] = useState<boolean>(getToken() !== null);

  useEffect(() => {
    const handler = (): void => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (!authed) {
    return <Login onLogin={() => { window.location.hash = '/'; setRoute('/'); setAuthed(true); }} />;
  }

  if (route === '/' || route === '/tasks') return <TaskList />;
  const m = /^\/tasks\/([^/]+)$/.exec(route);
  if (m) return <TaskDetail id={m[1]} />;
  return <TaskList />;
}
