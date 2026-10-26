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
exports.ProjectConnectService = void 0;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
const workspaceConfig_1 = require("../utils/workspaceConfig");
class ProjectConnectService {
    output;
    constructor(output) {
        this.output = output;
    }
    getHubApiUrl() {
        const configured = vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .get('hub.apiUrl', 'http://staging.rupos.app/AI/index.php/v1');
        return (0, workspaceConfig_1.normalizeHubApiUrl)(configured);
    }
    async promptAndConnect(presetCode) {
        const existing = (0, workspaceConfig_1.loadWorkspaceProjectConfig)();
        const defaultVal = presetCode || existing?.projectCode || '';
        const code = await vscode.window.showInputBox({
            title: 'RubiOps — Connect with Project Code',
            prompt: 'Enter your Unique Company Project Code (e.g. RO-CORE-1001 or SG-CORE-1001)',
            value: defaultVal,
            placeHolder: 'RO-XXXX-####',
            ignoreFocusOut: true,
            validateInput: (text) => {
                if (!text || !text.trim()) {
                    return 'Project code cannot be empty.';
                }
                return null;
            },
        });
        if (!code || !code.trim()) {
            return false;
        }
        const cleanCode = code.trim().toUpperCase();
        // Optionally ask for / confirm work email to resolve role
        const defaultEmail = existing?.userEmail || '';
        const email = await vscode.window.showInputBox({
            title: 'RubiOps — Your Team Work Email',
            prompt: 'Enter your work email to automatically resolve your role (Developer, QA, Team Lead)',
            value: defaultEmail,
            placeHolder: 'you@company.com',
            ignoreFocusOut: true,
        });
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Verifying project code "${cleanCode}" with RubiOps Hub...`,
        }, async () => {
            return await this.verifyAndApply(cleanCode, email?.trim());
        });
    }
    async verifyAndApply(projectCode, userEmail) {
        const hubUrl = this.getHubApiUrl();
        const verifyUrl = `${hubUrl}/projects/verify`;
        try {
            this.output.appendLine(`[ProjectConnect] Verifying code "${projectCode}" (email: ${userEmail || 'anonymous'}) via ${verifyUrl}`);
            const res = await axios_1.default.post(verifyUrl, { projectCode, email: userEmail || '' }, { timeout: 15000, headers: { 'Content-Type': 'application/json' } });
            if (!res.data || !res.data.ok || !res.data.project) {
                vscode.window.showErrorMessage(`Project verification failed: ${res.data?.message || 'Invalid project code'}`);
                return false;
            }
            const p = res.data.project;
            const role = res.data.role || p.userRole || 'DEVELOPER';
            const roleTitle = res.data.roleTitle || p.userRoleTitle || 'Software Engineer';
            const permissions = res.data.permissions || p.permissions || {};
            const config = {
                projectCode: p.projectCode || projectCode,
                name: p.name,
                role,
                roleTitle,
                userEmail: userEmail || undefined,
                permissions,
                companyName: p.companyName,
                companyId: p.companyId,
                ado: {
                    organizationUrl: p.adoOrgUrl,
                    projectName: p.adoProject,
                },
                git: {
                    defaultTargetBranch: p.defaultTargetBranch || 'dev',
                },
                testing: {
                    prodUrl: p.environments?.preprodUrl,
                },
                leads: p.reviewers,
            };
            const saved = (0, workspaceConfig_1.saveWorkspaceProjectConfig)(config);
            if (!saved) {
                vscode.window.showErrorMessage('Failed to write .rubiops.json to the workspace root. Ensure a project folder is open.');
                return false;
            }
            // Also set workspace-level VS Code configuration
            const wsConfig = vscode.workspace.getConfiguration('devopsQuickUpdate');
            if (p.adoOrgUrl) {
                await wsConfig.update('organizationUrl', p.adoOrgUrl, vscode.ConfigurationTarget.Workspace);
            }
            if (p.adoProject) {
                await wsConfig.update('projectName', p.adoProject, vscode.ConfigurationTarget.Workspace);
            }
            await wsConfig.update('projectCode', config.projectCode, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`✓ Connected to "${config.name || config.projectCode}" as ${roleTitle}! Workspace configured.`);
            this.output.appendLine(`[ProjectConnect] Successfully paired with project: ${config.name} (${config.projectCode}) as ${roleTitle}`);
            return true;
        }
        catch (err) {
            let msg = 'Network error connecting to RubiOps Hub';
            if (axios_1.default.isAxiosError(err)) {
                msg = err.response?.data?.error || err.response?.data?.message || err.message;
            }
            else if (err instanceof Error) {
                msg = err.message;
            }
            // Fallback for offline usage: allow user to save code directly offline!
            const offlineChoice = await vscode.window.showWarningMessage(`Could not reach Hub (${msg}). Would you like to save "${projectCode}" offline in .rubiops.json?`, 'Save Offline', 'Cancel');
            if (offlineChoice === 'Save Offline') {
                const config = {
                    projectCode,
                };
                (0, workspaceConfig_1.saveWorkspaceProjectConfig)(config);
                vscode.window.showInformationMessage(`Project code "${projectCode}" saved locally in .rubiops.json.`);
                return true;
            }
            return false;
        }
    }
}
exports.ProjectConnectService = ProjectConnectService;
//# sourceMappingURL=projectConnectService.js.map