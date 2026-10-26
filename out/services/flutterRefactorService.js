"use strict";
/**
 * Flutter & Dart Standards Refactor Service.
 * Detects Flutter 3.x+ deprecations, Effective Dart violations, and applies
 * verified automated fixes across selected workspace files.
 */
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
exports.FlutterRefactorService = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const workspace_1 = require("../utils/workspace");
class FlutterRefactorService {
    currentGroups = [];
    onFixesChangedEmitter = new vscode.EventEmitter();
    onFixesChanged = this.onFixesChangedEmitter.event;
    getFixes() {
        return this.currentGroups;
    }
    setFixes(groups) {
        this.currentGroups = groups;
        this.onFixesChangedEmitter.fire(groups);
    }
    async isFlutterWorkspace(rootPath) {
        const root = rootPath || (0, workspace_1.getWorkspacePath)();
        if (!root) {
            return false;
        }
        try {
            const pubspec = path.join(root, 'pubspec.yaml');
            await fs.access(pubspec);
            return true;
        }
        catch {
            // Check if lib folder exists with .dart files
            try {
                const libDir = path.join(root, 'lib');
                const entries = await fs.readdir(libDir);
                return entries.some((name) => name.endsWith('.dart') || !name.startsWith('.'));
            }
            catch {
                return false;
            }
        }
    }
    /**
     * Scans the workspace or specified files for modern Flutter standard fixes.
     */
    async scanWorkspace(targetFiles) {
        const root = (0, workspace_1.getWorkspacePath)();
        if (!root) {
            return [];
        }
        const filesToScan = [];
        if (targetFiles && targetFiles.length > 0) {
            for (const f of targetFiles) {
                const full = path.isAbsolute(f) ? f : path.join(root, f);
                if (full.endsWith('.dart')) {
                    filesToScan.push(full);
                }
            }
        }
        else {
            await this.collectDartFiles(root, filesToScan, 0);
        }
        const groups = [];
        for (const fullPath of filesToScan) {
            try {
                const content = await fs.readFile(fullPath, 'utf8');
                const relative = path.relative(root, fullPath);
                const fileName = path.basename(fullPath);
                const directory = path.dirname(relative);
                const fixes = this.analyzeDartContent(content, relative);
                if (fixes.length > 0) {
                    groups.push({
                        filePath: relative,
                        fileName,
                        directory: directory === '.' ? '' : directory,
                        fullPath,
                        fixes,
                    });
                }
            }
            catch {
                // Skip unreadable files
            }
        }
        this.setFixes(groups);
        return groups;
    }
    /**
     * Parses AI-suggested fixes from code review markdown and merges them.
     */
    mergeAiReviewFixes(existingGroups, reviewMarkdown) {
        const root = (0, workspace_1.getWorkspacePath)() || '';
        const aiFixesMatch = reviewMarkdown.match(/```json:flutter-refactor-fixes\s*([\s\S]*?)```/i)
            || reviewMarkdown.match(/```json:refactor-fixes\s*([\s\S]*?)```/i);
        if (!aiFixesMatch) {
            return existingGroups;
        }
        try {
            const parsed = JSON.parse(aiFixesMatch[1].trim());
            if (!Array.isArray(parsed)) {
                return existingGroups;
            }
            const groupsMap = new Map();
            for (const g of existingGroups) {
                groupsMap.set(g.filePath, { ...g, fixes: [...g.fixes] });
            }
            for (const item of parsed) {
                if (!item.file || !item.original || !item.replacement) {
                    continue;
                }
                const relPath = item.file.replace(/^\/+/, '');
                const fullPath = path.isAbsolute(relPath) ? relPath : path.join(root, relPath);
                const fileName = path.basename(relPath);
                const directory = path.dirname(relPath);
                let group = groupsMap.get(relPath);
                if (!group) {
                    group = {
                        filePath: relPath,
                        fileName,
                        directory: directory === '.' ? '' : directory,
                        fullPath,
                        fixes: [],
                    };
                    groupsMap.set(relPath, group);
                }
                // Avoid duplicate fix
                const isDuplicate = group.fixes.some((f) => f.original.trim() === item.original.trim());
                if (!isDuplicate) {
                    const preview = createDiffHtml(item.original, item.replacement);
                    group.fixes.push({
                        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        line: typeof item.line === 'number' ? item.line : 1,
                        original: item.original,
                        replacement: item.replacement,
                        description: item.description || 'Flutter standard refactor recommendation',
                        previewLineHtml: preview,
                    });
                }
            }
            const result = Array.from(groupsMap.values()).filter((g) => g.fixes.length > 0);
            this.setFixes(result);
            return result;
        }
        catch (err) {
            console.warn('Failed to parse AI refactor fixes json:', err);
            return existingGroups;
        }
    }
    /**
     * Applies the selected fixes using VS Code's WorkspaceEdit API.
     */
    async applyFixes(selectedFilePaths) {
        const root = (0, workspace_1.getWorkspacePath)();
        if (!root || !this.currentGroups.length) {
            return { appliedFiles: 0, appliedFixes: 0 };
        }
        const selectedSet = new Set(selectedFilePaths);
        const groupsToApply = this.currentGroups.filter((g) => selectedSet.has(g.filePath));
        if (!groupsToApply.length) {
            return { appliedFiles: 0, appliedFixes: 0 };
        }
        const workspaceEdit = new vscode.WorkspaceEdit();
        let totalAppliedFixes = 0;
        const modifiedUris = [];
        for (const group of groupsToApply) {
            const uri = vscode.Uri.file(group.fullPath);
            let content;
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                content = doc.getText();
            }
            catch {
                content = await fs.readFile(group.fullPath, 'utf8');
            }
            let updatedContent = content;
            let fileModified = false;
            // Apply each fix
            for (const fix of group.fixes) {
                if (updatedContent.includes(fix.original)) {
                    updatedContent = updatedContent.replace(fix.original, fix.replacement);
                    totalAppliedFixes += 1;
                    fileModified = true;
                }
            }
            if (fileModified) {
                // Replace entire document content cleanly
                const fullRange = new vscode.Range(0, 0, Number.MAX_VALUE, Number.MAX_VALUE);
                workspaceEdit.replace(uri, fullRange, updatedContent);
                modifiedUris.push(uri);
            }
        }
        if (modifiedUris.length > 0) {
            const success = await vscode.workspace.applyEdit(workspaceEdit);
            if (success) {
                // Save modified files
                for (const uri of modifiedUris) {
                    try {
                        const doc = await vscode.workspace.openTextDocument(uri);
                        await doc.save();
                    }
                    catch {
                        // Already handled
                    }
                }
            }
        }
        // Remove applied groups from memory
        this.currentGroups = this.currentGroups.filter((g) => !selectedSet.has(g.filePath));
        this.onFixesChangedEmitter.fire(this.currentGroups);
        return {
            appliedFiles: modifiedUris.length,
            appliedFixes: totalAppliedFixes,
        };
    }
    async collectDartFiles(dir, collected, depth) {
        if (depth > 8 || collected.length >= 80) {
            return;
        }
        const skip = new Set(['.git', '.dart_tool', 'build', 'android', 'ios', 'web', 'windows', 'linux', 'macos']);
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (collected.length >= 80) {
                    return;
                }
                if (entry.name.startsWith('.') || skip.has(entry.name)) {
                    continue;
                }
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await this.collectDartFiles(full, collected, depth + 1);
                }
                else if (entry.name.endsWith('.dart') && !entry.name.endsWith('.g.dart') && !entry.name.endsWith('.freezed.dart')) {
                    collected.push(full);
                }
            }
        }
        catch {
            // Ignore directory read errors
        }
    }
    analyzeDartContent(content, filePath) {
        const lines = content.split('\n');
        const fixes = [];
        lines.forEach((lineText, idx) => {
            const lineNum = idx + 1;
            const trimmed = lineText.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
                return;
            }
            // Rule 1: withOpacity -> withValues(alpha: ...) (Flutter 3.27+)
            // Example: themePrimary.withOpacity(0.12) -> themePrimary.withValues(alpha: 0.12)
            const opacityMatch = lineText.match(/(\.withOpacity\(\s*([^)]+)\s*\))/);
            if (opacityMatch) {
                const fullMatch = opacityMatch[1];
                const val = opacityMatch[2];
                const replacement = `.withValues(alpha: ${val})`;
                fixes.push({
                    id: `fix-opacity-${lineNum}-${idx}`,
                    line: lineNum,
                    original: fullMatch,
                    replacement,
                    description: 'Use withValues(alpha: ...) instead of deprecated withOpacity() (Flutter 3.27+)',
                    previewLineHtml: highlightDiff(lineText, fullMatch, replacement),
                });
            }
            // Rule 2: MaterialState -> WidgetState (Flutter 3.22+)
            // MaterialStatePropertyAll, MaterialStateColor, MaterialStateProperty, etc.
            const matStateMatch = lineText.match(/\b(MaterialState(PropertyAll|Color|Property|TextStyle|BorderSide|OutlineBorder|MouseCursor)?)\b/);
            if (matStateMatch) {
                const orig = matStateMatch[1];
                const rep = orig.replace('MaterialState', 'WidgetState');
                fixes.push({
                    id: `fix-widgetstate-${lineNum}-${idx}`,
                    line: lineNum,
                    original: orig,
                    replacement: rep,
                    description: `Use modern ${rep} instead of deprecated ${orig} (Flutter 3.22+)`,
                    previewLineHtml: highlightDiff(lineText, orig, rep),
                });
            }
            // Rule 3: textScaleFactor -> textScaler: TextScaler.linear(...) (Flutter 3.16+)
            // Example: textScaleFactor: themeController.textScaleFactor,
            const textScaleMatch = lineText.match(/(textScaleFactor:\s*([^,\n\)]+))/);
            if (textScaleMatch) {
                const orig = textScaleMatch[1];
                const expr = textScaleMatch[2].trim();
                const rep = `textScaler: TextScaler.linear(${expr})`;
                fixes.push({
                    id: `fix-textscaler-${lineNum}-${idx}`,
                    line: lineNum,
                    original: orig,
                    replacement: rep,
                    description: 'Use textScaler: TextScaler.linear(...) instead of deprecated textScaleFactor (Flutter 3.16+)',
                    previewLineHtml: highlightDiff(lineText, orig, rep),
                });
            }
            // Rule 4: final -> const for literal constants (Effective Dart)
            // Example: final service = 's3'; -> const service = 's3';
            const finalConstMatch = lineText.match(/(^|\s)(final)(\s+[a-zA-Z0-9_]+\s*=\s*(['"][^'"]*['"]|\b[0-9]+(?:\.[0-9]+)?\b|\btrue\b|\bfalse\b)\s*;)/);
            if (finalConstMatch && !lineText.includes('class') && !lineText.includes('void') && !lineText.includes('Future')) {
                const orig = `${finalConstMatch[1]}final${finalConstMatch[3]}`;
                const rep = `${finalConstMatch[1]}const${finalConstMatch[3]}`;
                fixes.push({
                    id: `fix-const-${lineNum}-${idx}`,
                    line: lineNum,
                    original: orig,
                    replacement: rep,
                    description: 'Prefer const over final for compile-time constants (Effective Dart)',
                    previewLineHtml: highlightDiff(lineText, 'final', 'const'),
                });
            }
            // Rule 5: Container() -> const SizedBox.shrink() or const SizedBox()
            // Example: = true ? Container() : const CircularProgressIndicator()
            const containerMatch = lineText.match(/(\bContainer\(\s*\))/);
            if (containerMatch) {
                const orig = containerMatch[1];
                const rep = 'const SizedBox.shrink()';
                fixes.push({
                    id: `fix-container-${lineNum}-${idx}`,
                    line: lineNum,
                    original: orig,
                    replacement: rep,
                    description: 'Replace empty Container() with const SizedBox.shrink() for better render performance',
                    previewLineHtml: highlightDiff(lineText, orig, rep),
                });
            }
            // Rule 6: Missing const CircularProgressIndicator()
            const cpiMatch = lineText.match(/([^a-zA-Z0-9_]|^)(CircularProgressIndicator\(\s*\))/);
            if (cpiMatch && !lineText.includes('const CircularProgressIndicator')) {
                const orig = cpiMatch[2];
                const rep = 'const CircularProgressIndicator()';
                fixes.push({
                    id: `fix-const-cpi-${lineNum}-${idx}`,
                    line: lineNum,
                    original: orig,
                    replacement: rep,
                    description: 'Add const to CircularProgressIndicator() constructor to avoid rebuilds',
                    previewLineHtml: highlightDiff(lineText, orig, rep),
                });
            }
        });
        return fixes;
    }
}
exports.FlutterRefactorService = FlutterRefactorService;
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function highlightDiff(lineText, original, replacement) {
    const idx = lineText.indexOf(original);
    if (idx === -1) {
        return `<span class="diff-del">${escapeHtml(original)}</span><span class="diff-add">${escapeHtml(replacement)}</span>`;
    }
    const before = lineText.slice(0, idx);
    const after = lineText.slice(idx + original.length);
    return `${escapeHtml(before)}<span class="diff-del">${escapeHtml(original)}</span><span class="diff-add">${escapeHtml(replacement)}</span>${escapeHtml(after)}`;
}
function createDiffHtml(original, replacement) {
    return `<span class="diff-del">${escapeHtml(original)}</span><span class="diff-add">${escapeHtml(replacement)}</span>`;
}
//# sourceMappingURL=flutterRefactorService.js.map