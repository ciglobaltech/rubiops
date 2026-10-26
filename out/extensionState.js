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
exports.setExtensionPanels = setExtensionPanels;
exports.setNavigationRefresh = setNavigationRefresh;
exports.runRefreshAll = runRefreshAll;
exports.registerCoreCommands = registerCoreCommands;
exports.logActivationError = logActivationError;
const vscode = __importStar(require("vscode"));
const constants_1 = require("./utils/constants");
let panels;
let navigationRefresh;
function setExtensionPanels(bundle) {
    panels = bundle;
}
function setNavigationRefresh(handler) {
    navigationRefresh = handler;
}
async function runRefreshAll() {
    if (!panels) {
        vscode.window.showWarningMessage('RubiOps is still starting. Try refresh again in a moment.');
        return;
    }
    await panels.dashboardPanel.refresh();
    await panels.tasksListPanel.refresh();
    await panels.queryPanel.refresh();
    await panels.taskBotPanel.refresh();
    panels.tasksTreeProvider.refresh();
    navigationRefresh?.();
}
function registerCoreCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand(constants_1.COMMANDS.REFRESH, () => runRefreshAll()));
}
function logActivationError(error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`RubiOps activation error: ${message}`);
    void vscode.window.showErrorMessage(`RubiOps failed to start: ${message}. Try reloading the window.`);
}
//# sourceMappingURL=extensionState.js.map