/**
 * Runs a task in the open project instead of only describing the steps.
 * Start/dev servers stay in a terminal. Test, build, and install run to completion
 * and their output is returned to the agent window.
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { getWorkspacePath } from '../utils/workspace';

const TASK_PATTERN = /\b(run|start|launch|serve|boot|build|test|install|execute)\b/i;

export function isRunnableTask(query: string): boolean {
  return TASK_PATTERN.test(query) && !/\b(file\s*names?|filename)\b/i.test(query);
}

export async function executeTask(query: string): Promise<string> {
  const cwd = getWorkspacePath();
  if (!cwd) {
    throw new Error('Open the project folder first, then ask me to run it.');
  }

  const appDir = await findAppDir(cwd);
  const planned = await planCommand(appDir, query);
  if (!planned) {
    throw new Error(`I could not find a start, test, or build script in ${cwd}.`);
  }

  if (planned.keepAlive) {
    const terminal = vscode.window.createTerminal({ name: 'RubiOps', cwd });
    terminal.show(true);
    terminal.sendText(planned.command);
    return [
      `I started it.`,
      '',
      `Command: \`${planned.command}\``,
      `Folder: ${cwd}`,
      'The RubiOps terminal is open and the process is running. Use the URL printed there.',
    ].join('\n');
  }

  const output = await runToEnd(planned.command, cwd);
  return [`I ran \`${planned.command}\`.`, '', output || 'Finished with no output.'].join('\n');
}

async function findAppDir(cwd: string): Promise<string> {
  if (await exists(path.join(cwd, 'package.json')) || await exists(path.join(cwd, 'pubspec.yaml'))) {
    return cwd;
  }
  const entries = await fs.readdir(cwd, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }
    const child = path.join(cwd, entry.name);
    if (await exists(path.join(child, 'package.json')) || await exists(path.join(child, 'pubspec.yaml'))) {
      return child;
    }
  }
  return cwd;
}

async function planCommand(cwd: string, query: string): Promise<{ command: string; keepAlive: boolean } | undefined> {
  const kind = taskKind(query);
  const packageJson = await readJson(path.join(cwd, 'package.json'));
  const scripts = packageJson?.scripts ?? {};
  const runner = await packageRunner(cwd);

  if (kind === 'install') {
    return { command: runner === 'yarn' ? 'yarn install' : runner === 'pnpm' ? 'pnpm install' : 'npm install', keepAlive: false };
  }
  if (kind === 'test') {
    if (scripts.test) {
      return { command: `${runner} test`, keepAlive: false };
    }
    if (await exists(path.join(cwd, 'pubspec.yaml'))) {
      return { command: 'flutter test', keepAlive: false };
    }
  }
  if (kind === 'build') {
    const script = firstScript(scripts, ['build', 'compile']);
    if (script) {
      return { command: scriptCommand(runner, script), keepAlive: false };
    }
    if (await exists(path.join(cwd, 'pubspec.yaml'))) {
      return { command: 'flutter build', keepAlive: false };
    }
  }

  const start = firstScript(scripts, ['dev', 'start', 'serve']);
  if (start) {
    return { command: scriptCommand(runner, start), keepAlive: true };
  }
  if (await exists(path.join(cwd, 'pubspec.yaml'))) {
    return { command: 'flutter run', keepAlive: true };
  }
  if (await hasProjectFile(cwd, '.csproj')) {
    return { command: 'dotnet run', keepAlive: true };
  }
  if (await exists(path.join(cwd, 'manage.py'))) {
    return { command: 'python manage.py runserver', keepAlive: true };
  }
  return undefined;
}

function taskKind(query: string): 'install' | 'test' | 'build' | 'run' {
  if (/\binstall\b/i.test(query)) {
    return 'install';
  }
  if (/\btest\b/i.test(query)) {
    return 'test';
  }
  if (/\bbuild\b/i.test(query)) {
    return 'build';
  }
  return 'run';
}

function firstScript(scripts: Record<string, string>, names: string[]): string | undefined {
  return names.find((name) => typeof scripts[name] === 'string');
}

function scriptCommand(runner: string, script: string): string {
  if (script === 'start' || script === 'test') {
    return runner === 'npm' ? `npm ${script}` : `${runner} ${script}`;
  }
  return runner === 'npm' ? `npm run ${script}` : `${runner} ${script}`;
}

async function packageRunner(cwd: string): Promise<'npm' | 'yarn' | 'pnpm'> {
  if (await exists(path.join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (await exists(path.join(cwd, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm';
}

async function readJson(file: string): Promise<{ scripts?: Record<string, string> } | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as { scripts?: Record<string, string> };
  } catch {
    return undefined;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function hasProjectFile(cwd: string, extension: string): Promise<boolean> {
  const entries = await fs.readdir(cwd);
  return entries.some((name) => name.endsWith(extension));
}

function runToEnd(command: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true });
    let output = '';
    const take = (chunk: Buffer) => {
      output = `${output}${chunk.toString()}`.slice(-4000);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const timer = setTimeout(() => {
      child.kill();
      resolve(`${output}\nStopped after 90 seconds.`);
    }, 90_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(`${output}\nExit code: ${code ?? 'unknown'}`);
    });
  });
}
