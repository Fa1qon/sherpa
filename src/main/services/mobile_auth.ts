import crypto from 'node:crypto';

const TOKEN_TTL_MS = 24 * 3600 * 1000;

interface Session {
  token: string;
  createdAt: number;
}

export class MobileAuth {
  private pin: string;
  private sessions = new Map<string, Session>();
  private failedAttempts = new Map<string, number>();   // IP → count, simple brute-force guard

  constructor(initialPin: string) {
    this.pin = initialPin;
  }

  setPin(pin: string): void {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4-8 digits');
    this.pin = pin;
    this.sessions.clear();
  }

  /** Returns token if PIN matches, null otherwise. */
  login(ip: string, pin: string): string | null {
    if ((this.failedAttempts.get(ip) ?? 0) >= 10) return null;  // 10 fails per IP = locked
    if (pin !== this.pin) {
      this.failedAttempts.set(ip, (this.failedAttempts.get(ip) ?? 0) + 1);
      return null;
    }
    this.failedAttempts.delete(ip);
    const token = crypto.randomBytes(24).toString('hex');
    this.sessions.set(token, { token, createdAt: Date.now() });
    return token;
  }

  verify(token: string): boolean {
    const s = this.sessions.get(token);
    if (!s) return false;
    if (Date.now() - s.createdAt > TOKEN_TTL_MS) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  revoke(token: string): void {
    this.sessions.delete(token);
  }

  revokeAll(): void {
    this.sessions.clear();
  }
}
