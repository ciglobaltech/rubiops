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
exports.NotificationService = void 0;
const vscode = __importStar(require("vscode"));
const constants_1 = require("../utils/constants");
class NotificationService {
    /** Fire-and-forget toast — does not wait for clicks (no developer input). */
    toast(message) {
        void vscode.window.showInformationMessage(message);
    }
    async info(message, options) {
        if (!options?.workItemId && !options?.openDashboard) {
            this.toast(message);
            return;
        }
        const actions = [];
        if (options?.workItemId !== undefined) {
            actions.push('Open work item');
        }
        if (options?.openDashboard) {
            actions.push('Open dashboard');
        }
        const choice = await vscode.window.showInformationMessage(message, ...actions);
        if (choice === 'Open work item' && options?.workItemId !== undefined) {
            await vscode.commands.executeCommand(constants_1.COMMANDS.OPEN_WORK_ITEM, options.workItemId);
        }
        if (choice === 'Open dashboard') {
            await vscode.commands.executeCommand(constants_1.COMMANDS.OPEN_DASHBOARD);
        }
    }
    async warn(message, _workItemId) {
        void vscode.window.showWarningMessage(message);
    }
    async error(message) {
        void vscode.window.showErrorMessage(message);
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notificationService.js.map