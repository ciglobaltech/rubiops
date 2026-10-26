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
exports.TimeLogService = void 0;
const vscode = __importStar(require("vscode"));
const workItemStatus_1 = require("../utils/workItemStatus");
const timeLogSettings_1 = require("../utils/timeLogSettings");
class TimeLogService {
    shouldPrompt(newState, newStateCategory) {
        return (0, timeLogSettings_1.shouldPromptTimeLog)(newState, newStateCategory);
    }
    async promptForHours(workItem, newState, newStateCategory) {
        if (!this.shouldPrompt(newState, newStateCategory)) {
            return { hoursSpent: 0, newCompletedWork: workItem.completedWork ?? 0 };
        }
        const isCompleting = (0, workItemStatus_1.isResolvedCategory)(newStateCategory ?? '') ||
            /complete|done|resolved|closed/i.test(newState);
        const current = workItem.completedWork ?? 0;
        const currentLabel = current > 0 ? ` (current Completed Work: ${current}h)` : '';
        const required = (0, timeLogSettings_1.isTimeLogRequired)();
        const value = await vscode.window.showInputBox({
            title: 'Log Time — RubiOps',
            prompt: `Enter hours spent on #${workItem.id} for status change to "${newState}"${currentLabel}`,
            placeHolder: required ? 'e.g. 1.5' : 'e.g. 1.5 (leave empty to skip)',
            validateInput: (input) => {
                const trimmed = input.trim();
                if (!trimmed) {
                    return required ? 'Hours are required when changing status' : null;
                }
                const hours = parseFloat(trimmed);
                if (Number.isNaN(hours) || hours < 0) {
                    return 'Enter a valid number of hours (0 or more)';
                }
                if (hours > 24) {
                    return 'Enter hours for this session (24h max per entry)';
                }
                return null;
            },
            ignoreFocusOut: true,
        });
        if (value === undefined) {
            return undefined;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return { hoursSpent: 0, newCompletedWork: current };
        }
        const hoursSpent = parseFloat(trimmed);
        const newCompletedWork = Math.round((current + hoursSpent) * 100) / 100;
        return {
            hoursSpent,
            newCompletedWork,
            remainingWork: isCompleting ? 0 : undefined,
        };
    }
}
exports.TimeLogService = TimeLogService;
//# sourceMappingURL=timeLogService.js.map