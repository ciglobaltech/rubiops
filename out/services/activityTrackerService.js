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
exports.ActivityTrackerService = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const workspaceConfig_1 = require("../utils/workspaceConfig");
class ActivityTrackerService {
    hub;
    gitBranchService;
    idleTimer;
    heartbeatTimer;
    lastActivityAt = Date.now();
    codingActive = false;
    windowFocused = false;
    sessionStartedAt;
    // File-level active telemetry
    currentFilePath;
    currentFileStartedAt;
    fileKeystrokes = 0;
    constructor(hub, gitBranchService) {
        this.hub = hub;
        this.gitBranchService = gitBranchService;
    }
    start(context) {
        const register = () => {
            if (!this.hub.isEnabled()) {
                return;
            }
            this.emit('vscode.presence.extension_started', 'presence', {
                projectCode: (0, workspaceConfig_1.getActiveProjectCode)(),
            });
        };
        register();
        // Track active file on startup
        if (vscode.window.activeTextEditor) {
            this.switchFile(vscode.window.activeTextEditor.document.uri.fsPath);
        }
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('devopsQuickUpdate.hub.enabled') && this.hub.isEnabled()) {
                register();
            }
        }), 
        // Window focus / blur (Alt-Tab detection)
        vscode.window.onDidChangeWindowState((state) => {
            this.windowFocused = state.focused;
            if (state.focused) {
                this.emit('vscode.presence.active', 'presence', {
                    projectCode: (0, workspaceConfig_1.getActiveProjectCode)(),
                });
                this.startFileTimer();
                this.touchActivity();
            }
            else {
                this.flushFileActivity();
                this.endCodingSession();
                this.emit('vscode.presence.away', 'presence', {
                    projectCode: (0, workspaceConfig_1.getActiveProjectCode)(),
                });
            }
        }), 
        // Active file change sensor
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (this.windowFocused) {
                this.switchFile(editor?.document.uri.fsPath);
            }
        }), 
        // Keystroke & Document edit sensor
        vscode.workspace.onDidChangeTextDocument(() => {
            if (this.windowFocused) {
                this.fileKeystrokes++;
                this.touchActivity();
            }
        }), 
        // Save document sensor
        vscode.workspace.onDidSaveTextDocument((doc) => {
            if (this.windowFocused) {
                this.flushFileActivity();
                void this.emitFileEvent('vscode.output.file_saved', 'output', doc.uri.fsPath);
            }
        }));
        this.windowFocused = vscode.window.state.focused;
        if (this.windowFocused && this.hub.isEnabled()) {
            this.emit('vscode.presence.active', 'presence', {
                projectCode: (0, workspaceConfig_1.getActiveProjectCode)(),
            });
            this.startFileTimer();
            this.touchActivity();
        }
        // Start 60-second periodic heartbeat for real-time manager presence
        this.heartbeatTimer = setInterval(() => {
            void this.sendPresenceHeartbeat();
        }, 60_000);
        context.subscriptions.push({
            dispose: () => {
                this.flushFileActivity();
                this.endCodingSession();
                if (this.idleTimer) {
                    clearTimeout(this.idleTimer);
                }
                if (this.heartbeatTimer) {
                    clearInterval(this.heartbeatTimer);
                }
            },
        });
    }
    trackOutput(action, metadata, workItemId) {
        this.hub.track(this.buildEvent(action, 'output', {
            ...metadata,
            projectCode: (0, workspaceConfig_1.getActiveProjectCode)(),
            workItemId,
        }));
    }
    switchFile(newPath) {
        if (this.currentFilePath === newPath) {
            return;
        }
        this.flushFileActivity();
        this.currentFilePath = newPath;
        this.startFileTimer();
    }
    startFileTimer() {
        if (this.currentFilePath) {
            this.currentFileStartedAt = Date.now();
            this.fileKeystrokes = 0;
        }
    }
    flushFileActivity() {
        if (!this.currentFilePath || !this.currentFileStartedAt) {
            return;
        }
        const durationMs = Date.now() - this.currentFileStartedAt;
        const file = this.currentFilePath;
        const keystrokes = this.fileKeystrokes;
        this.currentFileStartedAt = undefined;
        this.fileKeystrokes = 0;
        // Only record if actively worked for more than 2 seconds
        if (durationMs > 2000 && this.hub.isEnabled()) {
            void this.emitFileActivity(file, durationMs, keystrokes);
        }
    }
    async emitFileActivity(filePath, durationMs, keystrokes) {
        const relFile = this.getRelativePath(filePath);
        const workItemId = await this.getLinkedWorkItemId();
        const projectCode = (0, workspaceConfig_1.getActiveProjectCode)();
        this.hub.track(this.buildEvent('vscode.activity.file_time', 'activity', {
            file: relFile,
            durationMs,
            keystrokes,
            workItemId,
            projectCode,
        }));
    }
    async emitFileEvent(action, category, filePath) {
        const relFile = this.getRelativePath(filePath);
        const workItemId = await this.getLinkedWorkItemId();
        const projectCode = (0, workspaceConfig_1.getActiveProjectCode)();
        this.hub.track(this.buildEvent(action, category, {
            file: relFile,
            workItemId,
            projectCode,
        }));
    }
    async sendPresenceHeartbeat() {
        if (!this.codingActive || !this.windowFocused || !this.hub.isEnabled()) {
            return;
        }
        const relFile = this.currentFilePath ? this.getRelativePath(this.currentFilePath) : undefined;
        const workItemId = await this.getLinkedWorkItemId();
        const projectCode = (0, workspaceConfig_1.getActiveProjectCode)();
        this.emit('vscode.presence.heartbeat', 'presence', {
            file: relFile,
            workItemId,
            projectCode,
            durationSeconds: 60,
        });
    }
    async getLinkedWorkItemId() {
        if (!this.gitBranchService) {
            return undefined;
        }
        try {
            const ctx = await this.gitBranchService.getBranchContext();
            return ctx.linkedWorkItemId;
        }
        catch {
            return undefined;
        }
    }
    getRelativePath(fullPath) {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            return path.relative(folders[0].uri.fsPath, fullPath) || path.basename(fullPath);
        }
        return path.basename(fullPath);
    }
    touchActivity() {
        const wasIdle = !this.codingActive && this.sessionStartedAt !== undefined;
        this.lastActivityAt = Date.now();
        if (!this.codingActive) {
            this.codingActive = true;
            this.sessionStartedAt = this.lastActivityAt;
            this.emit('vscode.coding.active', 'activity', { projectCode: (0, workspaceConfig_1.getActiveProjectCode)() });
        }
        else if (wasIdle) {
            this.emit('vscode.coding.resumed', 'activity', { projectCode: (0, workspaceConfig_1.getActiveProjectCode)() });
        }
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        const idleMs = this.getIdleThresholdMs();
        this.idleTimer = setTimeout(() => {
            if (this.codingActive && Date.now() - this.lastActivityAt >= idleMs) {
                this.flushFileActivity();
                this.emit('vscode.coding.idle', 'presence', {
                    idleMinutes: idleMs / 60_000,
                    projectCode: (0, workspaceConfig_1.getActiveProjectCode)(),
                });
                this.codingActive = false;
            }
        }, idleMs);
    }
    endCodingSession() {
        if (!this.codingActive || !this.sessionStartedAt) {
            return;
        }
        const durationMs = Date.now() - this.sessionStartedAt;
        this.hub.track(this.buildEvent('vscode.coding.session_end', 'activity', {
            durationMs,
            projectCode: (0, workspaceConfig_1.getActiveProjectCode)(),
        }));
        this.codingActive = false;
        this.sessionStartedAt = undefined;
    }
    getIdleThresholdMs() {
        const minutes = vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .get('hub.idleThresholdMinutes', 3);
        return Math.max(1, minutes) * 60_000;
    }
    emit(action, category, metadata) {
        this.hub.track(this.buildEvent(action, category, metadata));
    }
    buildEvent(action, category, metadata) {
        const { workItemId, durationMs, ...rest } = metadata ?? {};
        return {
            platform: 'vscode',
            category,
            action,
            timestamp: new Date().toISOString(),
            durationMs,
            workItemId,
            metadata: Object.keys(rest).length > 0 ? rest : undefined,
        };
    }
}
exports.ActivityTrackerService = ActivityTrackerService;
//# sourceMappingURL=activityTrackerService.js.map