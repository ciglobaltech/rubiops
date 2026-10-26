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
exports.BugWatchService = void 0;
exports.runBrokenVerifyCommand = runBrokenVerifyCommand;
const vscode = __importStar(require("vscode"));
const bugWorkPlanService_1 = require("./bugWorkPlanService");
const brokenDeepTestService_1 = require("./brokenDeepTestService");
const descriptionBlocks_1 = require("../utils/descriptionBlocks");
const patScopes_1 = require("../utils/patScopes");
const workspaceConfig_1 = require("../utils/workspaceConfig");
/**
 * VS Code autopilot:
 * - All assigned Bugs: TodayAssigned + Work Plan in Description
 * - Broken-tagged: login + test + screenshots + ADO comment
 * - Manual run opens full-screen progress UI
 */
class BugWatchService {
    authService;
    workItemService;
    hubClient;
    notifications;
    context;
    output;
    timer;
    running = false;
    status;
    progressPanel;
    autoCodeFix;
    constructor(authService, workItemService, hubClient, notifications, context, output) {
        this.authService = authService;
        this.workItemService = workItemService;
        this.hubClient = hubClient;
        this.notifications = notifications;
        this.context = context;
        this.output = output;
        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
        this.status.command = 'devopsQuickUpdate.runBugWatch';
        this.context.subscriptions.push(this.status);
    }
    setProgressPanel(panel) {
        this.progressPanel = panel;
    }
    setAutoCodeFix(service) {
        this.autoCodeFix = service;
    }
    start() {
        if (!this.isEnabled()) {
            this.output.appendLine('BugWatch disabled in settings.');
            return;
        }
        void this.poll('startup', false, false);
        this.restartTimer();
        this.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('devopsQuickUpdate.bugWatch') ||
                event.affectsConfiguration('devopsQuickUpdate.brokenVerify')) {
                this.restartTimer();
                if (this.isEnabled()) {
                    void this.poll('config', false, false);
                }
            }
        }), {
            dispose: () => {
                if (this.timer) {
                    clearInterval(this.timer);
                }
            },
        });
    }
    async pollNow(showUi = true) {
        if (this.running) {
            if (showUi && this.progressPanel) {
                await this.progressPanel.show();
                this.progressPanel.push({
                    phase: 'starting',
                    title: 'Autopilot already running',
                    detail: 'A run is in progress — watch the live log. Click again after it finishes.',
                    running: true,
                    percent: undefined,
                    logLine: 'Ignored duplicate Run — Autopilot already in progress',
                });
            }
            else {
                this.notifications.toast('Bug Autopilot is already running…');
            }
            return;
        }
        if (showUi && this.progressPanel) {
            this.progressPanel.resetLogs();
            await this.progressPanel.show();
        }
        // Manual run always force-retests Broken bugs (even if an old report exists).
        await this.poll('manual', showUi, showUi);
    }
    emit(event) {
        if (event.logLine) {
            this.output.appendLine(event.logLine);
        }
        this.progressPanel?.push(event);
    }
    restartTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        if (!this.isEnabled()) {
            return;
        }
        const minutes = Math.max(1, vscode.workspace.getConfiguration('devopsQuickUpdate').get('bugWatch.pollMinutes', 5));
        this.timer = setInterval(() => {
            void this.poll('interval', false, false);
        }, minutes * 60_000);
    }
    isEnabled() {
        return vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .get('bugWatch.enabled', true);
    }
    async poll(reason, showUi, forceBrokenRetest) {
        if (this.running || !this.isEnabled()) {
            return;
        }
        const authenticated = await this.authService.isAuthenticated();
        if (!authenticated) {
            this.output.appendLine(`BugWatch (${reason}): skipped — not connected to ADO.`);
            return;
        }
        this.running = true;
        this.status.text = '$(sync~spin) RubiOps Bug Autopilot…';
        this.status.show();
        let tagged = 0;
        let planned = 0;
        let brokenDeep = 0;
        let failed = 0;
        let commentsPosted = 0;
        let patWriteError = false;
        const markPatWriteError = (message) => {
            if (/Personal Access Token|Work Items — Read|Failed to .*update work item|Failed to .*add discussion/i.test(message)) {
                patWriteError = true;
            }
        };
        const log = (line, extra) => {
            markPatWriteError(line);
            if (showUi) {
                this.emit({
                    phase: extra?.phase ?? this.guessPhase(line),
                    title: extra?.title ?? 'RubiOps Autopilot',
                    detail: extra?.detail ?? line,
                    logLine: line,
                    running: true,
                    percent: extra?.percent,
                    workItemId: extra?.workItemId,
                    workItemTitle: extra?.workItemTitle,
                    patWriteError: patWriteError || extra?.patWriteError,
                    commentsPosted: extra?.commentsPosted ?? commentsPosted,
                    brokenList: extra?.brokenList,
                });
            }
            else {
                this.output.appendLine(line);
            }
        };
        try {
            if (showUi) {
                this.emit({
                    phase: 'starting',
                    title: 'Starting Bug Autopilot',
                    detail: 'Connecting to Azure DevOps and preparing the run…',
                    percent: 2,
                    running: true,
                    logLine: `Bug Autopilot started (${reason})`,
                });
            }
            const client = await this.workItemService.ensureClient();
            log('Scanning open Bugs assigned to you (Broken tag first)…', {
                phase: 'scanning',
                title: 'Scanning assigned Bugs',
                percent: 8,
            });
            const todayTag = this.todayAssignedTag();
            const brokenTag = this.brokenTag();
            const prodUrl = this.prodUrl();
            const autoWritePlan = vscode.workspace
                .getConfiguration('devopsQuickUpdate')
                .get('bugWatch.autoWritePlanToDescription', true);
            const [brokenBugs, allBugs] = await Promise.all([
                client.getAssignedBrokenBugs(brokenTag),
                client.getAssignedBugs(),
            ]);
            // Broken-tagged bugs first, then the rest (dedupe by id).
            const byId = new Map();
            for (const bug of [...brokenBugs, ...allBugs]) {
                byId.set(bug.id, bug);
            }
            const bugs = [...byId.values()].sort((a, b) => {
                const aBroken = hasWorkItemTag(a.tags, brokenTag) ? 0 : 1;
                const bBroken = hasWorkItemTag(b.tags, brokenTag) ? 0 : 1;
                if (aBroken !== bBroken) {
                    return aBroken - bBroken;
                }
                return 0;
            });
            const brokenQueue = brokenBugs.map((b) => ({
                id: b.id,
                title: b.title,
                state: b.state,
                status: 'queued',
            }));
            log(`Found ${bugs.length} bug(s) (${brokenBugs.length} with tag ${brokenTag}) · forceRetest=${forceBrokenRetest}`, {
                phase: 'scanning',
                title: `Found ${bugs.length} Bug(s) · ${brokenBugs.length} Broken`,
                detail: `TodayAssigned + work plan · Broken → test environment on ${prodUrl}`,
                percent: 12,
                brokenList: brokenQueue,
            });
            if (brokenBugs.length > 0) {
                log(`Broken queue: ${brokenBugs.map((b) => `#${b.id} (${b.state})`).join(', ')}`, { phase: 'scanning', percent: 14, brokenList: brokenQueue });
            }
            else {
                log(`No Bugs with tag "${brokenTag}" assigned to you were returned by ADO WIQL — check assignment + tag spelling (Resolved+Broken are included).`, { phase: 'scanning', percent: 14, brokenList: [] });
            }
            const planService = new bugWorkPlanService_1.BugWorkPlanService();
            const deepService = new brokenDeepTestService_1.BrokenDeepTestService();
            for (let index = 0; index < bugs.length; index++) {
                const bug = bugs[index];
                const basePercent = 12 + Math.floor((index / Math.max(bugs.length, 1)) * 80);
                const inBrokenQueue = brokenQueue.some((item) => item.id === bug.id);
                try {
                    this.status.text = `$(sync~spin) Autopilot #${bug.id}…`;
                    log(`Autopilot #${bug.id}: ${bug.title}`, {
                        phase: 'tagging',
                        title: `Working on #${bug.id}`,
                        detail: bug.title,
                        percent: basePercent,
                        workItemId: bug.id,
                        workItemTitle: bug.title,
                    });
                    let fresh = await client.getWorkItem(bug.id);
                    const hasToday = hasWorkItemTag(fresh.tags, todayTag);
                    const hasBroken = hasWorkItemTag(fresh.tags, brokenTag);
                    const inactiveState = ['resolved', 'closed', 'done', 'completed'].includes(fresh.state.toLowerCase());
                    log(`  tags=[${fresh.tags.join('; ') || 'none'}] · Broken=${hasBroken} · Assigned=${fresh.assignedTo} · State=${fresh.state}`, {
                        phase: 'tagging',
                        workItemId: bug.id,
                        workItemTitle: bug.title,
                        percent: basePercent + 1,
                    });
                    // Don't block Broken deep-test on Resolved/Closed by failing TodayAssigned writes first.
                    if (!hasToday && !inactiveState) {
                        log(`  + tagging #${bug.id} with ${todayTag}`, {
                            phase: 'tagging',
                            title: `Tagging #${bug.id}`,
                            detail: `Applying ${todayTag}`,
                            percent: basePercent + 2,
                            workItemId: bug.id,
                            workItemTitle: bug.title,
                        });
                        await client.addWorkItemTag(fresh.id, todayTag);
                        tagged += 1;
                        this.hubClient.track({
                            platform: 'ado',
                            category: 'activity',
                            action: 'ado.activity.bug_assigned',
                            timestamp: new Date().toISOString(),
                            workItemId: fresh.id,
                            metadata: { todayTag, auto: true },
                        });
                        fresh = await client.getWorkItem(bug.id);
                    }
                    if (autoWritePlan &&
                        !(0, descriptionBlocks_1.hasDescriptionBlock)(fresh.description, 'Work Plan') &&
                        !inactiveState) {
                        log(`  + writing work plan to #${bug.id} Description`, {
                            phase: 'planning',
                            title: `Work plan for #${bug.id}`,
                            detail: 'Generating suggestions and updating Description…',
                            percent: basePercent + 5,
                            workItemId: bug.id,
                            workItemTitle: bug.title,
                        });
                        await this.writeWorkPlan(client, fresh, planService);
                        planned += 1;
                        fresh = await client.getWorkItem(bug.id);
                    }
                    if (hasBroken) {
                        if (inBrokenQueue) {
                            this.progressPanel?.updateBrokenItem(bug.id, { status: 'running' });
                        }
                        const alreadyCommented = forceBrokenRetest
                            ? false
                            : await client.hasRubiOpsBrokenTestComment(fresh.project, fresh.id);
                        if (alreadyCommented) {
                            log(`  · Broken deep test already commented on #${bug.id} — skip (background)`, {
                                phase: 'testing',
                                workItemId: bug.id,
                                workItemTitle: bug.title,
                                percent: basePercent + 10,
                            });
                            if (inBrokenQueue) {
                                this.progressPanel?.updateBrokenItem(bug.id, {
                                    status: 'skipped',
                                    verdict: 'already_reported',
                                });
                            }
                        }
                        else {
                            if (forceBrokenRetest) {
                                log(`  → force retest Broken #${bug.id} (manual Autopilot)`, {
                                    phase: 'testing',
                                    workItemId: bug.id,
                                    workItemTitle: bug.title,
                                });
                            }
                            log(`  → Broken tag: login + media + test cases + screenshots + comment`, {
                                phase: 'testing',
                                title: `Broken test #${bug.id}`,
                                detail: `Logging into ${prodUrl} and running automated checks…`,
                                percent: basePercent + 8,
                                workItemId: bug.id,
                                workItemTitle: bug.title,
                            });
                            const result = await deepService.run(client, fresh, prodUrl, (line) => log(line, {
                                phase: 'testing',
                                title: `Broken test #${bug.id}`,
                                detail: line,
                                percent: Math.min(95, basePercent + 12),
                                workItemId: bug.id,
                                workItemTitle: bug.title,
                            }));
                            // Comments are posted inside BrokenDeepTestService; count successful run as posted.
                            commentsPosted += 1;
                            log(`  + automated test completed for #${bug.id} (${result.verdict})`, {
                                phase: 'commenting',
                                title: `Automated test complete #${bug.id}`,
                                detail: `Verdict: ${result.verdict} · comments + screenshots written`,
                                percent: basePercent + 15,
                                workItemId: bug.id,
                                workItemTitle: bug.title,
                                commentsPosted,
                            });
                            const summary = [
                                `Verdict: ${result.verdict}`,
                                `Logged in: ${result.loggedIn ? 'yes' : 'no'}`,
                                `Engine: ${result.engine}`,
                                `Screenshots: ${result.screenshotNames.length}`,
                                `Evidence: ${result.evidence}`,
                                `Checked: ${result.checkedAt}`,
                            ].join('\n');
                            const nextDescription = (0, descriptionBlocks_1.upsertDescriptionBlock)((await client.getWorkItem(fresh.id)).description, 'Broken Verify', summary);
                            await client.updateWorkItemDescription(fresh.id, nextDescription);
                            brokenDeep += 1;
                            if (inBrokenQueue) {
                                this.progressPanel?.updateBrokenItem(bug.id, {
                                    status: 'tested',
                                    verdict: result.verdict,
                                });
                            }
                            this.hubClient.track({
                                platform: 'vscode',
                                category: 'output',
                                action: 'vscode.output.broken_deep_test',
                                timestamp: new Date().toISOString(),
                                workItemId: fresh.id,
                                metadata: {
                                    verdict: result.verdict,
                                    engine: result.engine,
                                    testCases: result.testCases.length,
                                    screenshots: result.screenshotNames.length,
                                },
                            });
                            const runAutoFix = vscode.workspace
                                .getConfiguration('devopsQuickUpdate')
                                .get('autoFix.afterBrokenVerify', false);
                            if (runAutoFix &&
                                result.verdict === 'broken_now' &&
                                this.autoCodeFix &&
                                showUi) {
                                log(`  → Auto Code Fix after Broken now #${bug.id}`, {
                                    phase: 'planning',
                                    title: `Auto Code Fix #${bug.id}`,
                                    detail: 'Starting unattended Cursor fix…',
                                    workItemId: bug.id,
                                    workItemTitle: bug.title,
                                });
                                // Allow Autopilot loop to continue after fix attempt.
                                await this.autoCodeFix.run(bug.id, summary);
                            }
                        }
                    }
                    else {
                        log(`  · no ${brokenTag} tag on #${bug.id} — skip deep test`, {
                            phase: 'planning',
                            workItemId: bug.id,
                            workItemTitle: bug.title,
                            percent: basePercent + 10,
                        });
                    }
                }
                catch (error) {
                    failed += 1;
                    const message = error instanceof Error ? error.message : String(error);
                    markPatWriteError(message);
                    if (inBrokenQueue) {
                        this.progressPanel?.updateBrokenItem(bug.id, {
                            status: 'failed',
                            verdict: 'ado_write_failed',
                        });
                    }
                    log(`  ! failed #${bug.id}: ${message}`, {
                        phase: 'error',
                        title: `Failed on #${bug.id}`,
                        detail: message,
                        workItemId: bug.id,
                        workItemTitle: bug.title,
                        patWriteError,
                    });
                }
            }
            const summary = `Bug Autopilot done: ${bugs.length} · tagged ${tagged} · plans ${planned} · Broken deep ${brokenDeep} · comments ${commentsPosted}${failed ? ` · failed ${failed}` : ''}${patWriteError ? ' · PAT WRITE FAILED' : ''}`;
            if (showUi) {
                this.emit({
                    phase: 'done',
                    title: patWriteError ? 'Autopilot finished — fix PAT to post comments' : 'Autopilot complete',
                    detail: patWriteError
                        ? `${summary}\n\n${(0, patScopes_1.formatPatScopeHint)('update work items / post comments')}`
                        : brokenDeep > 0
                            ? `${summary} · Automated testing completed for Broken queue`
                            : summary,
                    percent: 100,
                    running: false,
                    logLine: summary,
                    patWriteError,
                    commentsPosted,
                    testsCompleted: brokenDeep,
                    brokenList: brokenQueue,
                });
            }
            else {
                this.output.appendLine(summary);
            }
            this.notifications.toast(patWriteError
                ? 'Bug Autopilot: ADO write failed — reconnect with Work Items Read & write PAT'
                : summary);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (showUi) {
                this.emit({
                    phase: 'error',
                    title: 'Autopilot error',
                    detail: message,
                    percent: 100,
                    running: false,
                    logLine: `BugWatch error (${reason}): ${message}`,
                });
            }
            else {
                this.output.appendLine(`BugWatch error (${reason}): ${message}`);
            }
            this.notifications.toast(`Bug Autopilot error: ${message}`);
        }
        finally {
            this.running = false;
            this.status.text = '$(bug) RubiOps Bug Autopilot';
            this.status.tooltip = 'Click to run Bug Autopilot now';
            this.status.show();
        }
    }
    guessPhase(line) {
        const lower = line.toLowerCase();
        if (lower.includes('login') || lower.includes('broken') || lower.includes('screenshot')) {
            return 'testing';
        }
        if (lower.includes('comment') || lower.includes('posting') || lower.includes('verdict')) {
            return 'commenting';
        }
        if (lower.includes('plan')) {
            return 'planning';
        }
        if (lower.includes('tag')) {
            return 'tagging';
        }
        if (lower.includes('scan') || lower.includes('found')) {
            return 'scanning';
        }
        return 'starting';
    }
    async writeWorkPlan(client, bug, planService) {
        const fresh = await client.getWorkItem(bug.id);
        const plan = planService.buildPlan(fresh);
        const nextDescription = (0, descriptionBlocks_1.upsertDescriptionBlock)(fresh.description, 'Work Plan', plan.plainText);
        await client.updateWorkItemDescription(bug.id, nextDescription);
    }
    todayAssignedTag() {
        return (vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .get('bugWatch.todayAssignedTag', 'TodayAssigned')
            ?.trim() || 'TodayAssigned');
    }
    brokenTag() {
        return (vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .get('brokenVerify.tag', 'Broken')
            ?.trim() || 'Broken');
    }
    prodUrl() {
        const fromProject = (0, workspaceConfig_1.loadWorkspaceProjectConfig)()?.testing?.prodUrl;
        if (fromProject) {
            return fromProject;
        }
        return (vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .get('brokenVerify.prodUrl', '')
            ?.trim() || 'https://preprod.internal.example.com');
    }
}
exports.BugWatchService = BugWatchService;
async function runBrokenVerifyCommand(workItemService, notifications, hubClient, workItemId, output) {
    const client = await workItemService.ensureClient();
    const bug = await client.getWorkItem(workItemId);
    const fromProject = (0, workspaceConfig_1.loadWorkspaceProjectConfig)()?.testing?.prodUrl;
    const prodUrl = fromProject ||
        vscode.workspace
            .getConfiguration('devopsQuickUpdate')
            .get('brokenVerify.prodUrl', '')
            ?.trim() ||
        'https://preprod.internal.example.com';
    const log = (line) => output?.appendLine(line);
    const result = await new brokenDeepTestService_1.BrokenDeepTestService().run(client, bug, prodUrl, log ?? (() => undefined));
    const summary = [
        `Verdict: ${result.verdict}`,
        `Engine: ${result.engine}`,
        `Prod: ${result.prodUrl}`,
        `Test cases: ${result.testCases.length}`,
        `Screenshots: ${result.screenshotNames.join(', ') || 'none'}`,
        `Evidence: ${result.evidence}`,
        `Checked: ${result.checkedAt}`,
    ].join('\n');
    const fresh = await client.getWorkItem(bug.id);
    await client.updateWorkItemDescription(bug.id, (0, descriptionBlocks_1.upsertDescriptionBlock)(fresh.description, 'Broken Verify', summary));
    hubClient.track({
        platform: 'vscode',
        category: 'output',
        action: 'vscode.output.broken_deep_test',
        timestamp: new Date().toISOString(),
        workItemId: bug.id,
        metadata: { verdict: result.verdict, engine: result.engine, manual: true },
    });
    notifications.toast(`#${bug.id}: ${result.verdict.replace(/_/g, ' ')} — report in comments`);
}
function hasWorkItemTag(tags, wanted) {
    const needle = wanted.toLowerCase().trim();
    if (!needle) {
        return false;
    }
    return tags.some((tag) => {
        const value = tag.toLowerCase().trim();
        return value === needle || value.split(/[;,]/).map((p) => p.trim()).includes(needle);
    });
}
//# sourceMappingURL=bugWatchService.js.map