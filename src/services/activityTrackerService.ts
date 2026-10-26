import * as vscode from 'vscode';
import * as path from 'path';
import { ActivityEventPayload } from '../models/activityEvent';
import { HubClient } from './hubClient';
import { GitBranchService } from './gitBranchService';
import { getActiveProjectCode } from '../utils/workspaceConfig';

export class ActivityTrackerService {
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private lastActivityAt = Date.now();
  private codingActive = false;
  private windowFocused = false;
  private sessionStartedAt: number | undefined;

  // File-level active telemetry
  private currentFilePath: string | undefined;
  private currentFileStartedAt: number | undefined;
  private fileKeystrokes = 0;

  constructor(
    private readonly hub: HubClient,
    private readonly gitBranchService?: GitBranchService
  ) {}

  start(context: vscode.ExtensionContext): void {
    const register = (): void => {
      if (!this.hub.isEnabled()) {
        return;
      }
      this.emit('vscode.presence.extension_started', 'presence', {
        projectCode: getActiveProjectCode(),
      });
    };

    register();

    // Track active file on startup
    if (vscode.window.activeTextEditor) {
      this.switchFile(vscode.window.activeTextEditor.document.uri.fsPath);
    }

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('devopsQuickUpdate.hub.enabled') && this.hub.isEnabled()) {
          register();
        }
      }),

      // Window focus / blur (Alt-Tab detection)
      vscode.window.onDidChangeWindowState((state) => {
        this.windowFocused = state.focused;
        if (state.focused) {
          this.emit('vscode.presence.active', 'presence', {
            projectCode: getActiveProjectCode(),
          });
          this.startFileTimer();
          this.touchActivity();
        } else {
          this.flushFileActivity();
          this.endCodingSession();
          this.emit('vscode.presence.away', 'presence', {
            projectCode: getActiveProjectCode(),
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
      })
    );

    this.windowFocused = vscode.window.state.focused;
    if (this.windowFocused && this.hub.isEnabled()) {
      this.emit('vscode.presence.active', 'presence', {
        projectCode: getActiveProjectCode(),
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

  trackOutput(action: string, metadata?: Record<string, unknown>, workItemId?: number): void {
    this.hub.track(
      this.buildEvent(action, 'output', {
        ...metadata,
        projectCode: getActiveProjectCode(),
        workItemId,
      })
    );
  }

  private switchFile(newPath: string | undefined): void {
    if (this.currentFilePath === newPath) {
      return;
    }
    this.flushFileActivity();
    this.currentFilePath = newPath;
    this.startFileTimer();
  }

  private startFileTimer(): void {
    if (this.currentFilePath) {
      this.currentFileStartedAt = Date.now();
      this.fileKeystrokes = 0;
    }
  }

  private flushFileActivity(): void {
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

  private async emitFileActivity(filePath: string, durationMs: number, keystrokes: number): Promise<void> {
    const relFile = this.getRelativePath(filePath);
    const workItemId = await this.getLinkedWorkItemId();
    const projectCode = getActiveProjectCode();

    this.hub.track(
      this.buildEvent('vscode.activity.file_time', 'activity', {
        file: relFile,
        durationMs,
        keystrokes,
        workItemId,
        projectCode,
      })
    );
  }

  private async emitFileEvent(action: string, category: ActivityEventPayload['category'], filePath: string): Promise<void> {
    const relFile = this.getRelativePath(filePath);
    const workItemId = await this.getLinkedWorkItemId();
    const projectCode = getActiveProjectCode();

    this.hub.track(
      this.buildEvent(action, category, {
        file: relFile,
        workItemId,
        projectCode,
      })
    );
  }

  private async sendPresenceHeartbeat(): Promise<void> {
    if (!this.codingActive || !this.windowFocused || !this.hub.isEnabled()) {
      return;
    }

    const relFile = this.currentFilePath ? this.getRelativePath(this.currentFilePath) : undefined;
    const workItemId = await this.getLinkedWorkItemId();
    const projectCode = getActiveProjectCode();

    this.emit('vscode.presence.heartbeat', 'presence', {
      file: relFile,
      workItemId,
      projectCode,
      durationSeconds: 60,
    });
  }

  private async getLinkedWorkItemId(): Promise<number | undefined> {
    if (!this.gitBranchService) {
      return undefined;
    }
    try {
      const ctx = await this.gitBranchService.getBranchContext();
      return ctx.linkedWorkItemId;
    } catch {
      return undefined;
    }
  }

  private getRelativePath(fullPath: string): string {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return path.relative(folders[0].uri.fsPath, fullPath) || path.basename(fullPath);
    }
    return path.basename(fullPath);
  }

  private touchActivity(): void {
    const wasIdle = !this.codingActive && this.sessionStartedAt !== undefined;
    this.lastActivityAt = Date.now();

    if (!this.codingActive) {
      this.codingActive = true;
      this.sessionStartedAt = this.lastActivityAt;
      this.emit('vscode.coding.active', 'activity', { projectCode: getActiveProjectCode() });
    } else if (wasIdle) {
      this.emit('vscode.coding.resumed', 'activity', { projectCode: getActiveProjectCode() });
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
          projectCode: getActiveProjectCode(),
        });
        this.codingActive = false;
      }
    }, idleMs);
  }

  private endCodingSession(): void {
    if (!this.codingActive || !this.sessionStartedAt) {
      return;
    }

    const durationMs = Date.now() - this.sessionStartedAt;
    this.hub.track(
      this.buildEvent('vscode.coding.session_end', 'activity', {
        durationMs,
        projectCode: getActiveProjectCode(),
      })
    );
    this.codingActive = false;
    this.sessionStartedAt = undefined;
  }

  private getIdleThresholdMs(): number {
    const minutes = vscode.workspace
      .getConfiguration('devopsQuickUpdate')
      .get<number>('hub.idleThresholdMinutes', 3);
    return Math.max(1, minutes) * 60_000;
  }

  private emit(
    action: string,
    category: ActivityEventPayload['category'],
    metadata?: Record<string, unknown>
  ): void {
    this.hub.track(this.buildEvent(action, category, metadata));
  }

  private buildEvent(
    action: string,
    category: ActivityEventPayload['category'],
    metadata?: Record<string, unknown> & { workItemId?: number; durationMs?: number }
  ): ActivityEventPayload {
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
