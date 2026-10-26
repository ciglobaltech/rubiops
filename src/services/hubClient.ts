import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { ActivityEventPayload, HubTokenResponse } from '../models/activityEvent';
import { HubDayMetrics, HubDaySummary, HubPresence } from '../models/hubDaySummary';
import { normalizeHubApiUrl } from '../utils/workspaceConfig';

const SECRET_API_KEY = 'rubiops.hub.apiKey';
const LEGACY_SECRET_API_KEY = 'smartgenie.hub.apiKey';
const SECRET_JWT = 'rubiops.hub.jwt';
const SECRET_JWT_EXPIRES = 'rubiops.hub.jwtExpires';

export class HubClient {
  private readonly http: AxiosInstance;
  private buffer: ActivityEventPayload[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.http = axios.create({ timeout: 15000 });
  }

  isEnabled(): boolean {
    return vscode.workspace.getConfiguration('devopsQuickUpdate').get<boolean>('hub.enabled', false);
  }

  async hasApiKey(): Promise<boolean> {
    const key = (await this.secrets.get(SECRET_API_KEY)) || (await this.secrets.get(LEGACY_SECRET_API_KEY));
    return Boolean(key?.trim());
  }

  getApiBaseUrl(): string {
    const url = vscode.workspace
      .getConfiguration('devopsQuickUpdate')
      .get<string>('hub.apiUrl', 'http://staging.rupos.app/AI/index.php/v1');
    return normalizeHubApiUrl(url);
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.http.get(`${this.getApiBaseUrl()}/health`);
      return response.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  async configureApiKey(): Promise<boolean> {
    const accepted = await vscode.window.showInformationMessage(
      'RubiOps Hub tracks coding time and work output (metadata only). Enable productivity sync?',
      { modal: true },
      'Accept & Connect',
      'Cancel'
    );
    if (accepted !== 'Accept & Connect') {
      return false;
    }

    const apiKey = await vscode.window.showInputBox({
      title: 'RubiOps Hub API Key',
      prompt: 'Paste your rubi_live_... or sg_live_... key from setup.php on Hostinger',
      password: true,
      ignoreFocusOut: true,
    });

    if (!apiKey?.trim()) {
      return false;
    }

    await this.secrets.store(SECRET_API_KEY, apiKey.trim());
    await this.secrets.delete(SECRET_JWT);
    await this.secrets.delete(SECRET_JWT_EXPIRES);

    const token = await this.ensureToken(true);
    if (!token) {
      vscode.window.showErrorMessage(
        'Hub connection failed. Check apiUrl and API key, then run setup.php on Hostinger.'
      );
      return false;
    }

    await this.recordConsent(token);
    await vscode.workspace
      .getConfiguration('devopsQuickUpdate')
      .update('hub.enabled', true, vscode.ConfigurationTarget.Global);

    const healthy = await this.testConnection();
    vscode.window.showInformationMessage(
      healthy
        ? 'RubiOps Hub connected — productivity sync enabled.'
        : 'Hub token saved but health check failed. Upload API to Hostinger first.'
    );
    return true;
  }

  async disconnect(): Promise<void> {
    await this.flush();
    await this.secrets.delete(SECRET_API_KEY);
    await this.secrets.delete(LEGACY_SECRET_API_KEY);
    await this.secrets.delete(SECRET_JWT);
    await this.secrets.delete(SECRET_JWT_EXPIRES);
    await vscode.workspace
      .getConfiguration('devopsQuickUpdate')
      .update('hub.enabled', false, vscode.ConfigurationTarget.Global);
  }

  track(event: ActivityEventPayload): void {
    if (!this.isEnabled()) {
      return;
    }

    this.buffer.push({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    });

    if (this.buffer.length >= 20) {
      void this.flush();
      return;
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        void this.flush();
      }, 2 * 60 * 1000);
    }
  }

  async flush(): Promise<void> {
    if (!this.isEnabled() || this.buffer.length === 0) {
      return;
    }

    const events = [...this.buffer];
    this.buffer = [];

    const token = await this.ensureToken();
    if (!token) {
      this.buffer = [...events, ...this.buffer];
      return;
    }

    try {
      await this.http.post(
        `${this.getApiBaseUrl()}/events/batch`,
        { events },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      this.buffer = [...events, ...this.buffer].slice(-200);
    }
  }

  async getDaySummary(date?: string): Promise<HubDaySummary> {
    const hasKey = await this.hasApiKey();
    if (!this.isEnabled() && !hasKey) {
      return { connected: false };
    }

    const token = await this.ensureToken();
    if (!token) {
      return { connected: false, error: 'Hub not authenticated — run Connect RubiOps Hub' };
    }

    const day = date ?? new Date().toISOString().slice(0, 10);
    const headers = { Authorization: `Bearer ${token}` };

    try {
      await this.flush();
      const [dailyRes, presenceRes] = await Promise.all([
        this.http.get<{ metrics: HubDayMetrics }>(`${this.getApiBaseUrl()}/output/daily`, {
          params: { date: day },
          headers,
        }),
        this.http.get<{ presence: HubPresence }>(`${this.getApiBaseUrl()}/presence`, { headers }),
      ]);

      return {
        connected: true,
        metrics: dailyRes.data.metrics,
        presence: presenceRes.data.presence,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hub API unavailable';
      return { connected: true, error: message };
    }
  }

  private async recordConsent(token: string): Promise<void> {
    try {
      await this.http.post(
        `${this.getApiBaseUrl()}/consent`,
        { version: '1.0' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      // non-blocking
    }
  }

  private async ensureToken(force = false): Promise<string | undefined> {
    if (!force) {
      const existing = await this.secrets.get(SECRET_JWT);
      const expires = await this.secrets.get(SECRET_JWT_EXPIRES);
      if (existing && expires && Date.now() < Number(expires) - 60_000) {
        return existing;
      }
    }

    const apiKey = (await this.secrets.get(SECRET_API_KEY)) || (await this.secrets.get(LEGACY_SECRET_API_KEY));
    if (!apiKey) {
      return undefined;
    }

    try {
      const response = await this.http.post<HubTokenResponse>(`${this.getApiBaseUrl()}/auth/token`, {
        apiKey,
      });
      const token = response.data.access_token;
      const expiresIn = response.data.expires_in ?? 86400;
      await this.secrets.store(SECRET_JWT, token);
      await this.secrets.store(SECRET_JWT_EXPIRES, String(Date.now() + expiresIn * 1000));
      return token;
    } catch {
      return undefined;
    }
  }
}
