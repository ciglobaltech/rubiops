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
exports.GENERIC_PAT_DOCS_URL = exports.PAT_SETUP_STEPS = void 0;
exports.getPatTokensPageUrl = getPatTokensPageUrl;
exports.openPatHelpPage = openPatHelpPage;
exports.formatPatScopesForUi = formatPatScopesForUi;
const vscode = __importStar(require("vscode"));
const url_1 = require("./url");
exports.PAT_SETUP_STEPS = [
    'Open Azure DevOps in your browser and sign in.',
    'Click your profile (top right) → Personal access tokens.',
    'Select + New Token, name it (e.g. RubiOps), choose an expiration.',
    'Scopes: Work Items (Read & write), Code (Read & write for Auto Code Fix PRs), Project and Team (Read), Member Entitlement Management (Read).',
    'Create the token and copy it immediately — you will not see it again.',
    'Return here and click Connect. Paste the org URL and PAT when prompted.',
];
exports.GENERIC_PAT_DOCS_URL = 'https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate';
function getPatTokensPageUrl(orgUrl) {
    if (!orgUrl?.trim()) {
        return exports.GENERIC_PAT_DOCS_URL;
    }
    try {
        const orgName = (0, url_1.extractOrganizationName)(orgUrl);
        return `https://dev.azure.com/${orgName}/_usersSettings/tokens`;
    }
    catch {
        return exports.GENERIC_PAT_DOCS_URL;
    }
}
async function openPatHelpPage(orgUrl) {
    const url = getPatTokensPageUrl(orgUrl);
    await vscode.env.openExternal(vscode.Uri.parse(url));
}
function formatPatScopesForUi() {
    return [
        'Work Items — Read & write',
        'Code — Read & write (Auto Code Fix PRs)',
        'Project and Team — Read',
        'Member Entitlement Management — Read',
    ].join(' · ');
}
//# sourceMappingURL=connectGuide.js.map