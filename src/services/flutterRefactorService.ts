/**
 * Flutter & Dart Standards Refactor Service.
 * Detects Flutter 3.x+ deprecations, Effective Dart violations, and applies
 * verified automated fixes across selected workspace files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { getWorkspacePath } from '../utils/workspace';

export interface FlutterCodeFix {
  id: string;
  line: number;
  original: string;
  replacement: string;
  description: string;
  previewLineHtml: string;
}

export interface FlutterFileFixGroup {
  filePath: string; // e.g. "lib/FunctionalRequirements/Config/colors.dart"
  fileName: string; // e.g. "colors.dart"
  directory: string; // e.g. "lib/FunctionalRequirements/Config"
  fullPath: string; // absolute path
  fixes: FlutterCodeFix[];
}

export interface FlutterScanSummary {
  isFlutter: boolean;
  totalFiles: number;
  totalFixes: number;
  groups: FlutterFileFixGroup[];
}

export class FlutterRefactorService {
  private currentGroups: FlutterFileFixGroup[] = [];
  private onFixesChangedEmitter = new vscode.EventEmitter<FlutterFileFixGroup[]>();
  public readonly onFixesChanged = this.onFixesChangedEmitter.event;

  public getFixes(): FlutterFileFixGroup[] {
    return this.currentGroups;
  }

  public setFixes(groups: FlutterFileFixGroup[]): void {
    this.currentGroups = groups;
    this.onFixesChangedEmitter.fire(groups);
  }

  public async isFlutterWorkspace(rootPath?: string): Promise<boolean> {
    const root = rootPath || getWorkspacePath();
    if (!root) {
      return false;
    }
    try {
      const pubspec = path.join(root, 'pubspec.yaml');
      await fs.access(pubspec);
      return true;
    } catch {
      // Check if lib folder exists with .dart files
      try {
        const libDir = path.join(root, 'lib');
        const entries = await fs.readdir(libDir);
        return entries.some((name) => name.endsWith('.dart') || !name.startsWith('.'));
      } catch {
        return false;
      }
    }
  }

  /**
   * Scans the workspace or specified files for modern Flutter standard fixes.
   */
  public async scanWorkspace(targetFiles?: string[]): Promise<FlutterFileFixGroup[]> {
    const root = getWorkspacePath();
    if (!root) {
      return [];
    }

    const filesToScan: string[] = [];
    if (targetFiles && targetFiles.length > 0) {
      for (const f of targetFiles) {
        const full = path.isAbsolute(f) ? f : path.join(root, f);
        if (full.endsWith('.dart')) {
          filesToScan.push(full);
        }
      }
    } else {
      await this.collectDartFiles(root, filesToScan, 0);
    }

    const groups: FlutterFileFixGroup[] = [];

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
      } catch {
        // Skip unreadable files
      }
    }

    this.setFixes(groups);
    return groups;
  }

  /**
   * Parses AI-suggested fixes from code review markdown and merges them.
   */
  public mergeAiReviewFixes(
    existingGroups: FlutterFileFixGroup[],
    reviewMarkdown: string
  ): FlutterFileFixGroup[] {
    const root = getWorkspacePath() || '';
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

      const groupsMap = new Map<string, FlutterFileFixGroup>();
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
        const isDuplicate = group.fixes.some(
          (f) => f.original.trim() === item.original.trim()
        );

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
    } catch (err) {
      console.warn('Failed to parse AI refactor fixes json:', err);
      return existingGroups;
    }
  }

  /**
   * Applies the selected fixes using VS Code's WorkspaceEdit API.
   */
  public async applyFixes(
    selectedFilePaths: string[]
  ): Promise<{ appliedFiles: number; appliedFixes: number }> {
    const root = getWorkspacePath();
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
    const modifiedUris: vscode.Uri[] = [];

    for (const group of groupsToApply) {
      const uri = vscode.Uri.file(group.fullPath);
      let content: string;
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        content = doc.getText();
      } catch {
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
          } catch {
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

  private async collectDartFiles(dir: string, collected: string[], depth: number): Promise<void> {
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
        } else if (entry.name.endsWith('.dart') && !entry.name.endsWith('.g.dart') && !entry.name.endsWith('.freezed.dart')) {
          collected.push(full);
        }
      }
    } catch {
      // Ignore directory read errors
    }
  }

  private analyzeDartContent(content: string, filePath: string): FlutterCodeFix[] {
    const lines = content.split('\n');
    const fixes: FlutterCodeFix[] = [];

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

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightDiff(lineText: string, original: string, replacement: string): string {
  const idx = lineText.indexOf(original);
  if (idx === -1) {
    return `<span class="diff-del">${escapeHtml(original)}</span><span class="diff-add">${escapeHtml(replacement)}</span>`;
  }
  const before = lineText.slice(0, idx);
  const after = lineText.slice(idx + original.length);
  return `${escapeHtml(before)}<span class="diff-del">${escapeHtml(original)}</span><span class="diff-add">${escapeHtml(replacement)}</span>${escapeHtml(after)}`;
}

function createDiffHtml(original: string, replacement: string): string {
  return `<span class="diff-del">${escapeHtml(original)}</span><span class="diff-add">${escapeHtml(replacement)}</span>`;
}
