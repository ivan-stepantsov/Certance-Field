const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

async function importCoreModule(fileName) {
  const filePath = path.resolve(__dirname, '..', '..', 'scripts', 'lib', fileName);
  return import(pathToFileURL(filePath).href);
}

// Loads the exact file the extension resolves at runtime (loadSharedLibrary ->
// src/shared/lib/index.js), so this test sees the shipped/bundled surface, not
// a direct import that could expose more than index.js re-exports.
async function importRuntimeShared() {
  const filePath = path.resolve(__dirname, '..', 'src', 'shared', 'lib', 'index.js');
  return import(pathToFileURL(filePath).href);
}

// Every function the runtime invokes as `shared.foo(` must be exported by the
// shared index. Nothing else guarded this: the chat/palette tests all MOCK
// `shared`, so a missing re-export (e.g. explainSelection) only surfaced as a
// runtime "shared.X is not a function". This test enforces the real contract.
test('the shared index exports every function the runtime calls as shared.X()', async () => {
  const mod = await importRuntimeShared();
  const srcDir = path.resolve(__dirname, '..', 'src');
  const called = new Set();
  for (const file of fs.readdirSync(srcDir)) {
    if (!file.endsWith('.cjs')) {
      continue;
    }
    const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
    for (const m of source.matchAll(/\bshared\.([a-zA-Z_]\w*)\s*\(/g)) {
      called.add(m[1]);
    }
  }

  assert.ok(called.size > 0, 'expected to find shared.X() call sites in src/*.cjs');
  const missing = [...called].filter(name => typeof mod[name] !== 'function');
  assert.deepEqual(missing, [], `shared index is missing runtime-called exports: ${missing.join(', ')}`);
});

test('prompt-normalize exports deterministic normalization primitives', async () => {
  const mod = await importCoreModule('prompt-normalize.js');
  assert.equal(typeof mod.normalizePrompt, 'function');
  assert.equal(typeof mod.extractConstraints, 'function');
  assert.equal(typeof mod.extractInlinePath, 'function');
  assert.equal(typeof mod.detectLanguageTag, 'function');

  assert.equal(mod.normalizePrompt('please fixing the login flow'), 'Fix the login flow.');
  assert.equal(mod.extractInlinePath('fix src/auth.spec.ts now'), 'src/auth.spec.ts');
  assert.equal(mod.detectLanguageTag('tests/login.spec.ts'), '[Playwright/TypeScript]');
});

test('prompt-selection detects diff and stack-trace selections', async () => {
  const mod = await importCoreModule('prompt-selection.js');
  const diff = 'diff --git a/a.ts b/a.ts\n@@ -1,1 +1,1 @@\n-a\n+b';
  const trace = 'Error: boom\n    at run (/tmp/a.ts:12:5)';

  assert.equal(mod.detectSelectionKind(diff), 'diff');
  assert.equal(mod.detectSelectionKind(trace), 'stack-trace');

  const summarized = mod.summarizeSelection(diff);
  assert.match(summarized.summary, /Selected diff/);
  assert.match(summarized.summary, /files=1/);
  assert.match(summarized.summary, /risk=/);
  assert.ok(summarized.summary.length <= 220);
});

test('prompt-selection supports expanded diff summary mode', async () => {
  const mod = await importCoreModule('prompt-selection.js');
  const diff = [
    'diff --git a/src/auth.ts b/src/auth.ts',
    '@@ -1,2 +1,2 @@',
    '-const x = 1;',
    '+const x = 2;',
    'diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml',
    '@@ -1,2 +1,3 @@',
    '+name: ci',
  ].join('\n');

  const summarized = mod.summarizeSelection(diff, { diffSummaryMode: 'expanded' });
  assert.match(summarized.summary, /Selected diff summary:/);
  assert.match(summarized.summary, /Files changed: 2/);
  assert.match(summarized.summary, /Risk:/);
});

test('prompt-warnings emits expected warning families', async () => {
  const mod = await importCoreModule('prompt-warnings.js');
  const warnings = mod.buildWarnings(
    'Run 987654321234 at 2026-06-04T10:12:00Z failed in /tmp/build/log.txt. Please do a code review for this PR.',
    {}
  );

  assert.ok(warnings.some(w => /High-cost review request detected/i.test(w)));
  assert.ok(warnings.some(w => /Volatile context detected/i.test(w)));
});

test('prompt-assemble produces structured optimizePrompt output', async () => {
  const mod = await importCoreModule('prompt-assemble.js');
  const result = mod.optimizePrompt('please fix src/auth.spec.ts, do not add dependencies', {
    file: 'src/auth.spec.ts',
  });

  assert.equal(typeof result.optimizedPrompt, 'string');
  assert.equal(typeof result.beforeTokens, 'number');
  assert.equal(typeof result.afterTokens, 'number');
  assert.equal(typeof result.contextType, 'string');
  assert.ok(Array.isArray(result.warnings));
});

test('prompt-skeleton builds deterministic skeleton ids', async () => {
  const mod = await importCoreModule('prompt-skeleton.js');
  const promptA = 'please fix src/auth.spec.ts. do not add dependencies';
  const promptB = 'please fix src/auth.spec.ts. do not add dependencies';
  const promptC = 'please fix src/billing.spec.ts. do not add dependencies';

  const idA = mod.buildPromptSkeletonId(promptA, { file: 'src/auth.spec.ts' });
  const idB = mod.buildPromptSkeletonId(promptB, { file: 'src/auth.spec.ts' });
  const idC = mod.buildPromptSkeletonId(promptC, { file: 'src/billing.spec.ts' });

  assert.equal(idA, idB);
  assert.notEqual(idA, idC);
  assert.match(idA, /^psk_[a-f0-9]{8}$/);
});
