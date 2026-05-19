import { useState, type FormEvent, type ReactElement } from 'react';
import { api, setToken } from '../api/client';

export function Login({ onLogin }: { onLogin: () => void }): ReactElement {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.login(pin);
      setToken(r.token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <h1>Sherpa</h1>
      <form onSubmit={(e) => { void submit(e); }} className="loginForm">
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
        />
        <button type="submit" disabled={busy || pin.length < 4}>Login</button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
