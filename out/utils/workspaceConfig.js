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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_HUB_API_URL = void 0;
exports.getWorkspaceRoot = getWorkspaceRoot;
exports.loadWorkspaceProjectConfig = loadWorkspaceProjectConfig;
exports.saveWorkspaceProjectConfig = saveWorkspaceProjectConfig;
exports.getActiveProjectCode = getActiveProjectCode;
exports.normalizeHubApiUrl = normalizeHubApiUrl;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const CONFIG_FILE_NAME = '.rubiops.json';
const LEGACY_CONFIG_FILE_NAME = '.smartgenie.json';
function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }
    return folders[0].uri.fsPath;
}
function loadWorkspaceProjectConfig() {
    const root = getWorkspaceRoot();
    if (!root) {
        return undefined;
    }
    const primaryPath = path.join(root, CONFIG_FILE_NAME);
    const legacyPath = path.join(root, LEGACY_CONFIG_FILE_NAME);
    const filePath = fs.existsSync(primaryPath) ? primaryPath : fs.existsSync(legacyPath) ? legacyPath : undefined;
    if (!filePath) {
        // Check if configured in workspace settings
        const code = vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .get('projectCode')
            ?.trim();
        if (code) {
            return { projectCode: code };
        }
        return undefined;
    }
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.projectCode === 'string') {
            return parsed;
        }
    }
    catch (err) {
        console.warn('[RubiOps] Failed to parse project config:', err);
    }
    return undefined;
}
function saveWorkspaceProjectConfig(config) {
    const root = getWorkspaceRoot();
    if (!root) {
        return false;
    }
    const filePath = path.join(root, CONFIG_FILE_NAME);
    try {
        config.updatedAt = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
        return true;
    }
    catch (err) {
        console.error('[RubiOps] Failed to write .rubiops.json:', err);
        return false;
    }
}
function getActiveProjectCode() {
    const config = loadWorkspaceProjectConfig();
    if (config?.projectCode) {
        return config.projectCode.trim();
    }
    const fromSettings = vscode.workspace
        .getConfiguration('devopsQuickUpdate')
        .get('projectCode', '')
        ?.trim();
    return fromSettings || 'DEFAULT';
}
exports.DEFAULT_HUB_API_URL = 'http://staging.rupos.app/AI/index.php/v1';
function normalizeHubApiUrl(rawUrl) {
    let url = (rawUrl || '').trim().replace(/\/$/, '');
    if (!url) {
        return exports.DEFAULT_HUB_API_URL;
    }
    if (!url.endsWith('/v1')) {
        if (!url.includes('index.php')) {
            url = `${url}/index.php/v1`;
        }
        else {
            url = `${url}/v1`;
        }
    }
    return url;
}
//# sourceMappingURL=workspaceConfig.js.map