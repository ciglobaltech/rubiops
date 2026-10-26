#!/usr/bin/env node
/**
 * vsce secretlint uses os.cpus().length as p-map concurrency.
 * Some sandboxed environments report 0 CPUs, which crashes packaging.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(
  __dirname,
  '..',
  'node_modules',
  '@secretlint',
  'node',
  'module',
  'index.js'
);

if (!fs.existsSync(target)) {
  process.exit(0);
}

const original = fs.readFileSync(target, 'utf8');
const next = original.replace(
  /concurrency:\s*os\.cpus\(\)\.length\s*,/,
  'concurrency: Math.max(1, os.cpus().length || 1),'
);

if (next !== original) {
  fs.writeFileSync(target, next);
  console.log('Patched @secretlint/node concurrency fallback for packaging.');
}
