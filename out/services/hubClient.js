"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HubClient = void 0;
const axios_1 = __importDefault(require("axios"));
const vscode = __importStar(require("vscode"));
const workspaceConfig_1 = require("../utils/workspaceConfig");
const SECRET_API_KEY = 'rubiops.hub.apiKey';
const LEGACY_SECRET_API_KEY = 'smartgenie.hub.apiKey';
const SECRET_JWT = 'rubiops.hub.jwt';
const SECRET_JWT_EXPIRES = 'rubiops.hub.jwtExpires';
class HubClient {
    secrets;
    http;
    buffer = [];
    flushTimer;
    constructor(secrets) {
        this.secrets = secrets;
        this.http = axios_1.default.create({ timeout: 15000 });
    }
    isEnabled() {
        return vscode.workspace.getConfiguration('devopsQuickUpdate').get('hub.enabled', false);
    }
    async hasApiKey() {
        const key = (await this.secrets.get(SECRET_API_KEY)) || (await this.secrets.get(LEGACY_SECRET_API_KEY));
        return Boolean(key?.trim());
    }
    getApiBaseUrl() {
        const url = vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .get('hub.apiUrl', 'http://staging.rupos.app/AI/index.php/v1');
        return (0, workspaceConfig_1.normalizeHubApiUrl)(url);
    }
    async testConnection() {
        try {
            const response = await this.http.get(`${this.getApiBaseUrl()}/health`);
            return response.data?.status === 'ok';
        }
        catch {
            return false;
        }
    }
    async configureApiKey() {
        const accepted = await vscode.window.showInformationMessage('RubiOps Hub tracks coding time and work output (metadata only). Enable productivity sync?', { modal: true }, 'Accept & Connect', 'Cancel');
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
            vscode.window.showErrorMessage('Hub connection failed. Check apiUrl and API key, then run setup.php on Hostinger.');
            return false;
        }
        await this.recordConsent(token);
        await vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .update('hub.enabled', true, vscode.ConfigurationTarget.Global);
        const healthy = await this.testConnection();
        vscode.window.showInformationMessage(healthy
            ? 'RubiOps Hub connected — productivity sync enabled.'
            : 'Hub token saved but health check failed. Upload API to Hostinger first.');
        return true;
    }
    async disconnect() {
        await this.flush();
        await this.secrets.delete(SECRET_API_KEY);
        await this.secrets.delete(LEGACY_SECRET_API_KEY);
        await this.secrets.delete(SECRET_JWT);
        await this.secrets.delete(SECRET_JWT_EXPIRES);
        await vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .update('hub.enabled', false, vscode.ConfigurationTarget.Global);
    }
    track(event) {
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
    async flush() {
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
            await this.http.post(`${this.getApiBaseUrl()}/events/batch`, { events }, { headers: { Authorization: `Bearer ${token}` } });
        }
        catch {
            this.buffer = [...events, ...this.buffer].slice(-200);
        }
    }
    async getDaySummary(date) {
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
                this.http.get(`${this.getApiBaseUrl()}/output/daily`, {
                    params: { date: day },
                    headers,
                }),
                this.http.get(`${this.getApiBaseUrl()}/presence`, { headers }),
            ]);
            return {
                connected: true,
                metrics: dailyRes.data.metrics,
                presence: presenceRes.data.presence,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Hub API unavailable';
            return { connected: true, error: message };
        }
    }
    async recordConsent(token) {
        try {
            await this.http.post(`${this.getApiBaseUrl()}/consent`, { version: '1.0' }, { headers: { Authorization: `Bearer ${token}` } });
        }
        catch {
            // non-blocking
        }
    }
    async ensureToken(force = false) {
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
            const response = await this.http.post(`${this.getApiBaseUrl()}/auth/token`, {
                apiKey,
            });
            const token = response.data.access_token;
            const expiresIn = response.data.expires_in ?? 86400;
            await this.secrets.store(SECRET_JWT, token);
            await this.secrets.store(SECRET_JWT_EXPIRES, String(Date.now() + expiresIn * 1000));
            return token;
        }
        catch {
            return undefined;
        }
    }
}
exports.HubClient = HubClient;
//# sourceMappingURL=hubClient.js.map