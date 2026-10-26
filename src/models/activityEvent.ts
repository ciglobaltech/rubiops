export type ActivityPlatform = 'vscode' | 'ado' | 'teams' | 'email' | 'calendar';

export type ActivityCategory = 'presence' | 'activity' | 'output';

export interface ActivityEventPayload {
  id?: string;
  platform: ActivityPlatform;
  category: ActivityCategory;
  action: string;
  timestamp: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  workItemId?: number;
}

export interface HubTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    tenant_id: string;
    email: string;
  };
}
