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
exports.AuthService = void 0;
const vscode = __importStar(require("vscode"));
const workspace_1 = require("../utils/workspace");
const url_1 = require("../utils/url");
const connectGuide_1 = require("../utils/connectGuide");
function patSecretKey(workspaceKey) {
    return `devopsQuickUpdate.pat.${workspaceKey}`;
}
class AuthService {
    secretStorage;
    constructor(secretStorage) {
        this.secretStorage = secretStorage;
    }
    getWorkspaceKey() {
        return (0, workspace_1.getWorkspaceKey)();
    }
    getWorkspaceLabel() {
        return (0, workspace_1.getWorkspaceLabel)();
    }
    async getPat() {
        const key = patSecretKey((0, workspace_1.getWorkspaceKey)());
        const workspacePat = await this.secretStorage.get(key);
        if (workspacePat) {
            return workspacePat;
        }
        return this.secretStorage.get('devopsQuickUpdate.pat');
    }
    async setPat(pat) {
        const key = patSecretKey((0, workspace_1.getWorkspaceKey)());
        await this.secretStorage.store(key, pat);
    }
    async clearPat() {
        const key = patSecretKey((0, workspace_1.getWorkspaceKey)());
        await this.secretStorage.delete(key);
    }
    getOrganizationUrl() {
        const url = vscode.workspace.getConfiguration('devopsQuickUpdate').get('organizationUrl');
        return url?.trim() || undefined;
    }
    getProjectName() {
        const project = vscode.workspace.getConfiguration('devopsQuickUpdate').get('projectName');
        return project?.trim() || undefined;
    }
    async setOrganizationUrl(url) {
        const normalized = (0, url_1.normalizeOrganizationUrl)(url);
        await vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .update('organizationUrl', normalized, vscode.ConfigurationTarget.Workspace);
    }
    async setProjectName(project) {
        await vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .update('projectName', project.trim(), vscode.ConfigurationTarget.Workspace);
    }
    async isAuthenticated() {
        const pat = await this.getPat();
        const orgUrl = this.getOrganizationUrl();
        return Boolean(pat && orgUrl);
    }
    async showConnectionGuide() {
        const steps = connectGuide_1.PAT_SETUP_STEPS.map((step, index) => `${index + 1}. ${step}`).join('\n');
        const choice = await vscode.window.showInformationMessage(`How to connect RubiOps:\n\n${steps}\n\nRequired PAT scopes: ${(0, connectGuide_1.formatPatScopesForUi)()}`, { modal: true }, 'Open PAT Help', 'Start Connect');
        if (choice === 'Open PAT Help') {
            await (0, connectGuide_1.openPatHelpPage)(this.getOrganizationUrl());
        }
    }
    async promptForCredentials() {
        if (!(0, workspace_1.getActiveWorkspaceFolder)()) {
            const choice = await vscode.window.showWarningMessage('Open a project folder first (File → Open Folder). RubiOps stores your Azure DevOps connection per workspace folder.', 'Open Folder', 'How to get PAT');
            if (choice === 'Open Folder') {
                await vscode.commands.executeCommand('vscode.openFolder');
            }
            else if (choice === 'How to get PAT') {
                await (0, connectGuide_1.openPatHelpPage)();
            }
            return false;
        }
        const workspaceLabel = (0, workspace_1.getWorkspaceLabel)();
        const intro = await vscode.window.showInformationMessage(`Connect RubiOps to Azure DevOps for "${workspaceLabel}". You will enter: (1) organization URL, (2) PAT token, (3) project name.`, { modal: true }, 'Start', 'How to get PAT');
        if (intro === 'How to get PAT') {
            await (0, connectGuide_1.openPatHelpPage)(this.getOrganizationUrl());
            return this.promptForCredentials();
        }
        if (intro !== 'Start') {
            return false;
        }
        const orgUrl = await vscode.window.showInputBox({
            title: `Step 1 of 3 — Organization URL (${workspaceLabel})`,
            prompt: 'Paste your Azure DevOps organization URL',
            placeHolder: 'https://dev.azure.com/YourOrg',
            value: this.getOrganizationUrl() ?? 'https://dev.azure.com/',
            ignoreFocusOut: true,
            validateInput: (value) => (0, url_1.validateOrganizationUrl)(value),
        });
        if (!orgUrl) {
            return false;
        }
        const patChoice = await vscode.window.showInformationMessage(`Step 2 of 3 — Create a Personal Access Token in Azure DevOps.\n\nRequired scopes:\n• ${(0, connectGuide_1.formatPatScopesForUi)().replace(/ · /g, '\n• ')}\n\nOpen the PAT page for your org, create a token, and copy it.`, { modal: true }, 'Open PAT Page', 'I have my PAT');
        if (patChoice === 'Open PAT Page') {
            await (0, connectGuide_1.openPatHelpPage)(orgUrl);
        }
        else if (patChoice !== 'I have my PAT') {
            return false;
        }
        const pat = await vscode.window.showInputBox({
            title: `Step 2 of 3 — Paste PAT (${workspaceLabel})`,
            prompt: 'Paste the token you copied from Azure DevOps (shown only once when created)',
            placeHolder: `Scopes: ${(0, connectGuide_1.formatPatScopesForUi)()}`,
            password: true,
            ignoreFocusOut: true,
            validateInput: (value) => (value.trim() ? null : 'PAT is required'),
        });
        if (!pat) {
            return false;
        }
        const projectName = await vscode.window.showInputBox({
            title: `Step 3 of 3 — Project name (${workspaceLabel})`,
            prompt: 'Default Azure DevOps project for dashboard and search (recommended)',
            placeHolder: 'e.g. MyProject',
            value: this.getProjectName() ?? '',
            ignoreFocusOut: true,
        });
        if (projectName === undefined) {
            return false;
        }
        await this.setOrganizationUrl(orgUrl);
        if (projectName.trim()) {
            await this.setProjectName(projectName);
        }
        await this.setPat(pat.trim());
        return true;
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=authService.js.map