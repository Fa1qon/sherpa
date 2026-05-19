// Mobile Web controller — owns the lifecycle of the local web server +
// auth and exposes start, stop, restart, setPin, getStatus. Coordinator
// between SettingsPort (configuration source) and LocalWebServer +
// MobileAuth (transport + credential primitives).

import { MobileAuth } from './mobile_auth';
import { LocalWebServer } from './local_web_server';
import { createMobileApiHandler } from './mobile_api_handlers';
import type { TaskService } from './task_service';
import type { GateEvaluator } from './gate_evaluator';
import type { SettingsPort } from '../../core/ports/settings_port';
import { detectLanIp } from './lan_ip';

export interface MobileWebStatus {
  readonly running: boolean;
  readonly port?: number;
  readonly lanIp?: string;
}

export interface MobileWebControllerDeps {
  readonly settings: SettingsPort;
  readonly taskService: TaskService;
  readonly gateEvaluator: GateEvaluator;
  /** Absolute path to dist-mobile/ on disk. */
  readonly staticDir: string;
}

const DEFAULT_PIN = '0000';
const DEFAULT_PORT = 19223;

export class MobileWebController {
  private readonly auth: MobileAuth;
  private readonly server = new LocalWebServer();
  private runningPort: number | null = null;
  private lanIp: string | null = null;
  private starting: Promise<void> | null = null;

  constructor(private readonly deps: MobileWebControllerDeps, initialPin = DEFAULT_PIN) {
    this.auth = new MobileAuth(initialPin);
  }

  /** Read settings + start the server if mobileWeb.enabled. Idempotent. */
  async startIfEnabled(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      try {
        const user = await this.deps.settings.getUserSettings();
        const mw = user.mobileWeb;
        if (!mw || !mw.enabled) {
          await this.stop();
          return;
        }
        if (mw.pin && mw.pin !== '') {
          // Defer to MobileAuth.setPin's validation; if invalid we keep current PIN.
          try { this.auth.setPin(mw.pin); } catch { /* invalid pin string — keep prior */ }
        }
        const apiHandler = createMobileApiHandler({
          auth: this.auth,
          taskService: this.deps.taskService,
          gateEvaluator: this.deps.gateEvaluator,
        });
        const { port } = await this.server.start({
          port: mw.port ?? DEFAULT_PORT,
          host: '0.0.0.0',
          staticDir: this.deps.staticDir,
          apiHandler,
        });
        this.runningPort = port;
        this.lanIp = detectLanIp();
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }

  async stop(): Promise<void> {
    await this.server.stop();
    this.runningPort = null;
    this.lanIp = null;
  }

  async restart(): Promise<void> {
    if (this.starting) {
      try { await this.starting; } catch { /* prior start failed; proceed */ }
    }
    await this.stop();
    await this.startIfEnabled();
  }

  /** Validates 4-8 digits via MobileAuth; throws on invalid. */
  setPin(pin: string): void {
    this.auth.setPin(pin);
  }

  getStatus(): MobileWebStatus {
    if (this.runningPort === null) return { running: false };
    return { running: true, port: this.runningPort, lanIp: this.lanIp ?? '127.0.0.1' };
  }
}
