import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextPack } from './context-pack.js';

test('test-failure input keeps the assertion and drops passing noise', () => {
  const input = [
    'PASS  src/util.test.ts',
    '  ✓ adds numbers (2 ms)',
    '  ✓ handles zero (1 ms)',
    'FAIL  src/login.test.ts',
    '  ✕ logs in a valid user (14 ms)',
    '',
    '    AssertionError: expected 200 but got 401',
    '    Expected: 200',
    '    Received: 401',
    '      at Object.<anonymous> (src/login.test.ts:42:7)',
    '  console.log lots of unrelated setup output ...',
  ].join('\n');
  const { kind, pack, beforeTokens, afterTokens } = buildContextPack(input);

  assert.equal(kind, 'test');
  assert.ok(afterTokens < beforeTokens, 'pack is smaller than the raw failure');
  assert.match(pack, /expected 200 but got 401/, 'keeps the decisive assertion');
  assert.match(pack, /Received: 401/);
  assert.match(pack, /src\/login\.test\.ts:42/, 'keeps the failing location');
  assert.doesNotMatch(pack, /adds numbers/, 'drops passing-test noise');
});

test('stack trace keeps the error and app frames, drops node_modules', () => {
  const input = [
    'TypeError: Cannot read properties of undefined (reading "id")',
    '    at getUser (src/user.ts:88:20)',
    '    at handler (src/routes/api.ts:31:5)',
    '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
    '    at Layer.handle (node_modules/express/lib/router/layer.js:95:5)',
  ].join('\n');
  const { kind, pack } = buildContextPack(input);

  assert.equal(kind, 'stack');
  assert.match(pack, /TypeError: Cannot read properties of undefined/);
  assert.match(pack, /getUser \(src\/user\.ts:88/, 'keeps the top app frame');
  assert.doesNotMatch(pack, /node_modules\/express/, 'drops framework frames');
});

test('diff keeps hunks and changed lines, drops lockfile churn', () => {
  const input = [
    'diff --git a/src/auth.ts b/src/auth.ts',
    '--- a/src/auth.ts',
    '+++ b/src/auth.ts',
    '@@ -10,7 +10,7 @@ export function login() {',
    '-  return token',
    '+  return signedToken',
    ' unchanged context line that should be dropped',
    'diff --git a/package-lock.json b/package-lock.json',
    '+        "resolved": "https://registry.npmjs.org/x/-/x.tgz",',
  ].join('\n');
  const { kind, pack } = buildContextPack(input);

  assert.equal(kind, 'diff');
  assert.match(pack, /@@ -10,7 \+10,7/);
  assert.match(pack, /\+ {2}return signedToken/);
  assert.doesNotMatch(pack, /unchanged context line/, 'drops context lines');
  assert.doesNotMatch(pack, /registry\.npmjs\.org/, 'drops lockfile churn');
});

test('json payload surfaces error/status fields and truncates long values', () => {
  const input = JSON.stringify({
    status: 500,
    error: 'internal',
    message: 'db timeout',
    trace: 'x'.repeat(500),
  });
  const { kind, pack } = buildContextPack(input);
  assert.equal(kind, 'json');
  assert.match(pack, /status: 500/);
  assert.match(pack, /message: db timeout/);
  assert.doesNotMatch(pack, /x{200}/, 'long values are truncated');
});

test('empty and unknown input are handled gracefully', () => {
  assert.deepEqual(buildContextPack('').pack, '');
  assert.equal(buildContextPack('   ').kind, 'empty');
  // A short plain snippet with no signatures falls back to the trimmed source.
  const { pack } = buildContextPack('const x = 1');
  assert.match(pack, /const x = 1/);
});
