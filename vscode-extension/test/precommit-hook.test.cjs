const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  generateHookScanner,
  buildHookShell,
  planHookInstall,
  renderInstallReport,
  HOOK_MARKER,
  SCANNER_REL_PATH,
} = require('../src/precommit-hook.cjs');

test('planHookInstall installs fresh when no hook exists', () => {
  const plan = planHookInstall({ hooksPathConfig: '', existingHookContent: null });
  assert.equal(plan.action, 'fresh');
  assert.equal(plan.writeHook, true);
  assert.equal(plan.writeScanner, true);
});

test('planHookInstall refreshes its own hook idempotently', () => {
  const plan = planHookInstall({ hooksPathConfig: '', existingHookContent: `#!/bin/sh\n# ${HOOK_MARKER}\n` });
  assert.equal(plan.action, 'already');
  assert.equal(plan.writeHook, true);
});

test('planHookInstall never overwrites a foreign pre-commit hook', () => {
  const plan = planHookInstall({ hooksPathConfig: '', existingHookContent: '#!/bin/sh\nnpm test\n' });
  assert.equal(plan.action, 'conflict-custom');
  assert.equal(plan.writeHook, false, 'a hook we did not write is left untouched');
  assert.equal(plan.writeScanner, true, 'scanner is still written for manual wiring');
});

test('planHookInstall does not override a custom core.hooksPath (e.g. husky)', () => {
  const plan = planHookInstall({ hooksPathConfig: '.husky', existingHookContent: null });
  assert.equal(plan.action, 'conflict-hookspath');
  assert.equal(plan.writeHook, false);
  assert.equal(plan.hooksPath, '.husky');
});

test('buildHookShell carries the marker, scanner path, and a node fail-open guard', () => {
  const shell = buildHookShell();
  assert.match(shell, /^#!\/bin\/sh/);
  assert.ok(shell.includes(HOOK_MARKER));
  assert.ok(shell.includes(SCANNER_REL_PATH));
  assert.match(shell, /command -v node/, 'fails open with a warning when node is absent');
});

// Load the REAL shared secret-protection surface (pattern summaries + the
// suppression source), so the generated hook we test is exactly what ships.
async function sharedSecretLib() {
  const { pathToFileURL } = require('node:url');
  const file = path.resolve(__dirname, '..', 'src', 'shared', 'lib', 'index.js');
  return import(pathToFileURL(file).href);
}

// Generate the hook from given summaries + the REAL suppression source, write it,
// and require it so the generated scanner logic is executed (not just built).
async function buildHook(summaries) {
  const shared = await sharedSecretLib();
  const source = generateHookScanner(summaries, shared.getScannerSuppressionSource());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-hook-'));
  const file = path.join(dir, 'gen-scan.cjs');
  fs.writeFileSync(file, source);
  return { source, mod: require(file), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('generateHookScanner produces a runnable, self-contained scanner', async () => {
  const summaries = [
    { id: 'github-token', source: '\\b(?:gh[pousr]_[A-Za-z0-9]{36,255})\\b', flags: 'g' },
    { id: 'aws-access-key-id', source: '\\b(?:AKIA)[A-Z0-9]{16}\\b', flags: 'g' },
  ];
  const { source, mod, cleanup } = await buildHook(summaries);
  assert.ok(source.includes(HOOK_MARKER));
  assert.ok(source.includes('github-token') && source.includes('aws-access-key-id'));

  const hit = mod.scanText('const k = "ghp_' + 'a'.repeat(40) + '";', 'src/x.ts');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].id, 'github-token');
  assert.equal(hit[0].line, 1);

  assert.deepEqual(mod.scanText('just ordinary code', 'src/x.ts'), [], 'clean text => no findings');

  // A staged real .env flags every non-placeholder assignment value.
  const env = mod.scanText('PORT=3000\nDB=localhost', '.env');
  assert.equal(env.filter(f => f.id === 'dotenv-assignment').length, 2);

  cleanup();
});

// SEC-05 — the generated hook must apply the SAME value-suppression as
// scanSecrets, so the commit gate and the workspace scan agree. Uses the REAL
// pattern set so sensitive-env-assignment / auth-header / dotenv are present.
test('the generated hook mirrors scanSecrets suppression (bidirectional)', async () => {
  const shared = await sharedSecretLib();
  const { mod, cleanup } = await buildHook(shared.getSecretPatternSummaries());
  const scan = (text, file) => mod.scanText(text, file || 'x');

  try {
    // MUST NOT block — the FP class that was false-blocking commits.
    assert.deepEqual(scan('max_tokens = max_tokens', 'fp.py'), [], 'kwarg identifier value');
    assert.deepEqual(scan('next_page_token = data.get("nextPageToken")', 'jira.py'), [], 'code-expression value');
    assert.deepEqual(scan('x = data.get("k")', 'x.py'), [], 'non-sensitive key');
    assert.deepEqual(scan('GITLAB_TOKEN=glpat-...  # note', '.env.example'), [], 'placeholder + inline comment');
    assert.deepEqual(scan('- `X-API-Key: <key>` for machine clients', 'SKILL.md'), [], 'backtick <placeholder> in docs');

    // MUST STILL block — real secrets (the redaction-integrity guard).
    assert.ok(scan('const k = "ghp_' + 'a'.repeat(36) + '";').some(f => f.id === 'github-token'), 'github token');
    assert.ok(scan('SERVICE_API_KEY=Xk9mP2realHighEntropyValue1234').some(f => f.id === 'sensitive-env-assignment'), 'high-entropy env value');
    const jwt = 'eyJ' + 'a'.repeat(12) + '.' + 'b'.repeat(12) + '.' + 'c'.repeat(12);
    assert.ok(scan('Authorization: Bearer ' + jwt).some(f => f.id === 'bearer-token' || f.id === 'jwt-token'), 'bearer/jwt');
    assert.ok(scan('AKIAIOSFODNN7EXAMPLE').some(f => f.id === 'aws-access-key-id'), 'aws key');
    // A real key committed to .env.example is still caught, line-scoped.
    const example = 'ANTHROPIC_API_KEY=sk-ant-...\nGITHUB_TOKEN=ghp_' + 'a'.repeat(36);
    const findings = scan(example, '.env.example');
    assert.ok(findings.length >= 1 && findings.every(f => f.line === 2), 'real key in .env.example still blocks (line 2 only)');
  } finally {
    cleanup();
  }
});

test('renderInstallReport explains each plan honestly', () => {
  const fresh = renderInstallReport({ plan: { action: 'fresh' }, hookPath: '.git/hooks/pre-commit', patternCount: 25 });
  assert.match(fresh, /✅ Installed/);
  assert.match(fresh, /staged content only/);
  assert.match(fresh, /--no-verify/, 'documents the honest bypass');
  assert.match(fresh, /not a guarantee/, 'does not oversell');

  const custom = renderInstallReport({ plan: { action: 'conflict-custom' }, hookPath: '.git/hooks/pre-commit', patternCount: 25 });
  assert.match(custom, /left untouched/);
  assert.match(custom, /git rev-parse --show-toplevel/, 'gives the wiring snippet');

  const husky = renderInstallReport({ plan: { action: 'conflict-hookspath', hooksPath: '.husky' }, hookPath: '.git/hooks/pre-commit', patternCount: 25 });
  assert.match(husky, /core\.hooksPath/);
  assert.match(husky, /\.husky/);
});
