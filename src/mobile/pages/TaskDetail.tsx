import { useEffect, useState, useCallback, type ReactElement } from 'react';
import { api, type MobileGate } from '../api/client';

export function TaskDetail({ id }: { id: string }): ReactElement {
  const [gates, setGates] = useState<MobileGate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const r = await api.listGates(id);
      setGates(r.gates);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }, [id]);

  useEffect(() => { void reload(); }, [reload]);

  const approve = async (gateId: string): Promise<void> => {
    setBusy(true);
    try {
      await api.approve(id, gateId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };
  const reject = async (gateId: string): Promise<void> => {
    const reason = window.prompt('Reason?') ?? '';
    setBusy(true);
    try {
      await api.reject(id, gateId, reason);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <a href="#/" className="back">← Back</a>
      <h2>Task {id}</h2>
      {error && <div className="error">{error}</div>}
      <h3>Pending gates</h3>
      {gates.length === 0 ? <p>No pending gates</p> : (
        <ul className="gateList">
          {gates.map((g) => (
            <li key={g.id}>
              <div className="title">{g.id}</div>
              {g.description && <div className="desc">{g.description}</div>}
              <div className="actions">
                <button className="primary" disabled={busy} onClick={() => { void approve(g.id); }}>Approve</button>
                <button className="danger" disabled={busy} onClick={() => { void reject(g.id); }}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
