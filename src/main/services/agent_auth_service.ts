import type { SettingsPort } from '../../core/ports/settings_port';
import type { AgentCli, AgentCredential, UserSettings } from '../../core/domain/settings';

export interface OAuthTokenInput {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt?: number;
}

export class AgentAuthService {
  constructor(private readonly settings: SettingsPort) {}

  async getCredential(agentId: AgentCli): Promise<AgentCredential | undefined> {
    const user = await this.settings.getUserSettings();
    return user.agentCredentials?.[agentId];
  }

  async storeApiKey(agentId: AgentCli, apiKey: string): Promise<void> {
    const user = await this.settings.getUserSettings();
    const next: UserSettings = {
      ...user,
      agentCredentials: {
        ...user.agentCredentials,
        [agentId]: { type: 'apikey' as const, apiKey },
      },
    };
    await this.settings.setUserSettings(next);
  }

  async storeOAuthToken(agentId: AgentCli, token: OAuthTokenInput): Promise<void> {
    const user = await this.settings.getUserSettings();
    const next: UserSettings = {
      ...user,
      agentCredentials: {
        ...user.agentCredentials,
        [agentId]: {
          type: 'oauth' as const,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: token.expiresAt,
        },
      },
    };
    await this.settings.setUserSettings(next);
  }

  async revokeCredential(agentId: AgentCli): Promise<void> {
    const user = await this.settings.getUserSettings();
    if (!user.agentCredentials) return;
    const { [agentId]: _removed, ...rest } = user.agentCredentials;
    const next: UserSettings = { ...user, agentCredentials: rest };
    await this.settings.setUserSettings(next);
  }
}
