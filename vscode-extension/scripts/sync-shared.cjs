#!/usr/bin/env node
'use strict';

/**
 * Single-source-of-truth sync for the extension's bundled shared library.
 *
 * `scripts/lib/` and `scripts/compressors/` (repo root) are the ONLY hand-edited
 * copy of the prompt/compression engine. The VS Code extension must bundle this
 * code under `src/shared/` because a packaged .vsix cannot reference files
 * outside its own folder. Rather than maintain a second copy by hand, this
 * script regenerates `src/shared/` from the root source.
 *
 *   node scripts/sync-shared.cjs           # write src/shared/ from source
 *   node scripts/sync-shared.cjs --check   # exit 1 if src/shared/ is out of date
 *
 * The --check form runs in CI so drift can never be merged.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const extRoot = path.resolve(__dirname, '..');

// source dir (relative to repo root) -> dest dir (relative to extension root)
const PAIRS = [
  { src: path.join(repoRoot, 'scripts', 'lib'), dest: path.join(extRoot, 'src', 'shared', 'lib') },
  { src: path.join(repoRoot, 'scripts', 'compressors'), dest: path.join(extRoot, 'src', 'shared', 'compressors') },
];

const isShippable = (name) => name.endsWith('.js') && !name.endsWith('.test.js');

/** Files that should exist in dest, keyed by relative path, with their source content. */
function plannedFiles() {
  const planned = new Map();
  for (const { src, dest } of PAIRS) {
    for (const name of fs.readdirSync(src)) {
      if (!isShippable(name)) continue;
      planned.set(path.join(dest, name), fs.readFileSync(path.join(src, name)));
    }
  }
  return planned;
}

/** Generated .js files currently present in the dest dirs (excluding tests, which are never copied). */
function existingDestFiles() {
  const existing = [];
  for (const { dest } of PAIRS) {
    if (!fs.existsSync(dest)) continue;
    for (const name of fs.readdirSync(dest)) {
      if (name.endsWith('.js') && !name.endsWith('.test.js')) existing.push(path.join(dest, name));
    }
  }
  return existing;
}

const rel = (p) => path.relative(extRoot, p);

function diff() {
  const planned = plannedFiles();
  const drift = [];

  for (const [file, content] of planned) {
    const current = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (current === null) drift.push({ file, kind: 'missing' });
    else if (!current.equals(content)) drift.push({ file, kind: 'stale' });
  }
  for (const file of existingDestFiles()) {
    if (!planned.has(file)) drift.push({ file, kind: 'extraneous' });
  }
  return drift;
}

function write() {
  const planned = plannedFiles();
  for (const { dest } of PAIRS) fs.mkdirSync(dest, { recursive: true });
  for (const [file, content] of planned) fs.writeFileSync(file, content);
  for (const file of existingDestFiles()) {
    if (!planned.has(file)) fs.rmSync(file);
  }
  console.log(`[sync-shared] wrote ${planned.size} file(s) into src/shared/ from scripts/lib + scripts/compressors`);
}

function check() {
  const drift = diff();
  if (drift.length === 0) {
    console.log('[sync-shared] src/shared/ is in sync with scripts/lib + scripts/compressors');
    return;
  }
  console.error('[sync-shared] src/shared/ is OUT OF SYNC with the root source:');
  for (const { file, kind } of drift) console.error(`  ${kind.padEnd(11)} ${rel(file)}`);
  console.error('\nFix: run `npm run sync` in vscode-extension/, then commit the result.');
  process.exit(1);
}

if (process.argv.includes('--check')) check();
else write();
