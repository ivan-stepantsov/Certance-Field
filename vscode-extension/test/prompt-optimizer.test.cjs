const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadSharedPromptOptimizer() {
  const filePath = path.resolve(__dirname, '..', 'src', 'shared', 'lib', 'prompt-optimizer.js');
  return import(pathToFileURL(filePath).href);
}

test('buildWarnings flags high-cost review prompts without diff context', async () => {
  const shared = await loadSharedPromptOptimizer();
  const warnings = shared.buildWarnings('Please do a code review for this PR.', {});

  assert.ok(
    warnings.some(w => /High-cost review request detected/i.test(w)),
    'Expected high-cost review warning for broad code review request'
  );
});

test('buildWarnings does not flag high-cost review prompts when diff context is present', async () => {
  const shared = await loadSharedPromptOptimizer();
  const warnings = shared.buildWarnings('Please do a code review for this PR.', {
    selectionKind: 'diff',
    selection: 'Selected diff: 1 file(s), 2 hunk(s), +10/-4.',
  });

  assert.ok(
    warnings.every(w => !/High-cost review request detected/i.test(w)),
    'Did not expect high-cost review warning when diff context is already present'
  );
});

test('buildWarnings flags recurring preference-style instructions without concrete scope', async () => {
  const shared = await loadSharedPromptOptimizer();
  const warnings = shared.buildWarnings('I prefer concise answers. Always respond with short bullet points.', {});

  assert.ok(
    warnings.some(w => /Recurring preference-style instruction detected/i.test(w)),
    'Expected recurring preference-style warning when prompt repeats personal defaults without file or selection scope'
  );
});

test('buildWarnings does not flag recurring preference-style instructions when scoped to a concrete file', async () => {
  const shared = await loadSharedPromptOptimizer();
  const warnings = shared.buildWarnings('I prefer concise answers.', {
    file: 'src/app.ts',
  });

  assert.ok(
    warnings.every(w => !/Recurring preference-style instruction detected/i.test(w)),
    'Did not expect recurring preference-style warning for file-scoped prompt'
  );
});

test('buildWarnings flags repeated verbosity controls without concrete exception scope', async () => {
  const shared = await loadSharedPromptOptimizer();
  const warnings = shared.buildWarnings('Code only, no explanation. Keep it brief. Answer concisely.', {});

  assert.ok(
    warnings.some(w => /Repeated verbosity controls detected/i.test(w)),
    'Expected repeated verbosity warning when prompt repeats terse-output controls'
  );
});

test('buildWarnings flags bloated instruction-like selections', async () => {
  const shared = await loadSharedPromptOptimizer();
  const selectionText = [
    '# Copilot Instructions',
    '',
    '- Keep this file short.',
    '- Move narrow rules into .github/instructions/*.instructions.md.',
    '- Review stale rules periodically.',
    '',
    'Repeat this section to exceed the threshold.'.repeat(60),
  ].join('\n');
  const warnings = shared.buildWarnings('Review this selection.', {
    file: '.github/copilot-instructions.md',
    selectionText,
  });

  assert.ok(
    warnings.some(w => /Instruction-like selection detected/i.test(w)),
    'Expected instruction-like selection warning for large repo-instruction content'
  );
});

test('buildWarnings flags volatile context and low prompt reuse score for run-specific noise placed first', async () => {
  const shared = await loadSharedPromptOptimizer();
  const warnings = shared.buildWarnings(
    'Run 987654321234 at 2026-06-04T10:12:00Z failed in /tmp/build/worker/log.txt with trace id 1234567890123456. Fix the failing auth test in src/auth.spec.ts.',
    {}
  );

  assert.ok(
    warnings.some(w => /Volatile context detected/i.test(w)),
    'Expected volatile context warning for run-specific noise'
  );
  assert.ok(
    warnings.some(w => /Low prompt reuse score detected/i.test(w)),
    'Expected low prompt reuse warning when volatile context dominates early prompt structure'
  );
  assert.ok(
    warnings.some(w => /Optional structure: put stable task instructions first, then file names, errors, IDs, timestamps, and logs/i.test(w)),
    'Expected actionable cache-structure guidance in the low prompt reuse warning'
  );
  assert.ok(
    warnings.some(w => /Unstable prompt prefix detected/i.test(w)),
    'Expected unstable prefix warning when volatile content appears early in the prompt'
  );
});

test('buildWarnings does not flag volatile warning for stable file-scoped prompt', async () => {
  const shared = await loadSharedPromptOptimizer();
  const warnings = shared.buildWarnings(
    'Fix the failing assertion in tests/auth.spec.ts. Constraint: do not add dependencies.',
    { file: 'tests/auth.spec.ts' }
  );

  assert.ok(
    warnings.every(w => !/Volatile context detected/i.test(w)),
    'Did not expect volatile context warning for stable prompt'
  );
  assert.ok(
    warnings.every(w => !/Low prompt reuse score detected/i.test(w)),
    'Did not expect low prompt reuse warning for stable prompt'
  );
});

test('buildWarnings flags MCP tool-bloat risk without allowlist controls', async () => {
  const shared = await loadSharedPromptOptimizer();
  const warnings = shared.buildWarnings(
    'Review the full MCP tool catalog and use all tools for this task.',
    {}
  );

  assert.ok(
    warnings.some(w => /MCP\/tool-bloat risk detected/i.test(w)),
    'Expected MCP tool-bloat warning for broad tool usage without allowlist'
  );
});

test('optimizePrompt returns cacheability metrics', async () => {
  const shared = await loadSharedPromptOptimizer();
  const result = shared.optimizePrompt(
    'Fix the failing assertion in tests/auth.spec.ts. Error: Expected visible, received hidden. Run 123456789012 at 2026-06-04T10:12:00Z.',
    { file: 'tests/auth.spec.ts' }
  );

  assert.equal(typeof result.cacheability?.score, 'number');
  assert.equal(typeof result.cacheability?.stablePrefixRatio, 'number');
  assert.equal(typeof result.cacheability?.volatilityDensity, 'number');
});

test('assessCacheStructure detects everyday volatile tokens (bare time, run id, relative date)', async () => {
  const shared = await loadSharedPromptOptimizer();
  // "today", "case 7", and "14:32" are volatile but matched nothing before.
  const volatile = shared.assessCacheStructure('refactor the auth module; run failed today on case 7 at 14:32');
  assert.ok(volatile.volatilityDensity > 0.1, `expected volatile density, got ${volatile.volatilityDensity}`);
  assert.ok(volatile.score < 100, 'volatile prompt should not score a perfect 100');
  // No false positive on a clean technical prompt.
  const clean = shared.assessCacheStructure('Refactor the auth module to use async/await.');
  assert.equal(clean.volatilityDensity, 0);
  assert.equal(clean.score, 100);
});

test('optimizePrompt strips conversational filler from a padded prompt while keeping the technical ask', async () => {
  const shared = await loadSharedPromptOptimizer();
  const padded = 'Hey there, so I was really hoping that maybe you could possibly help me out with something whenever you get a spare moment, there is absolutely no rush at all and I totally understand if you are busy, but honestly I have been staring at it for hours and I just cannot seem to figure out why the isValidSession function rejects a session at its exact expiry boundary, oh and I suspect an off-by-one error, anyway if you could kindly take a look and suggest the smallest fix I would really really appreciate it, thanks so so much in advance, you are the best!';
  const result = shared.optimizePrompt(padded, { file: null, selectionText: '' });

  // Meaningfully smaller (was roughly break-even before filler stripping).
  assert.ok(result.afterTokens < result.beforeTokens * 0.75, `expected >25% smaller, got ${result.beforeTokens}->${result.afterTokens}`);
  // Technical content survives.
  assert.match(result.optimizedPrompt, /isValidSession/);
  assert.match(result.optimizedPrompt, /off-by-one/);
  // Pleasantries are gone.
  for (const filler of [/hey there/i, /really hoping/i, /no rush/i, /thanks so/i, /you are the best/i, /kindly/i]) {
    assert.doesNotMatch(result.optimizedPrompt, filler, `filler survived: ${filler}`);
  }
  // No cleanup artifacts.
  assert.doesNotMatch(result.optimizedPrompt, /\b(and|but|so)\s+\1\b/i, 'doubled connector left behind');
});

test('optimizePrompt produces well-formed output from a multi-sentence padded prompt', async () => {
  const shared = await loadSharedPromptOptimizer();
  const padded = 'Hi there! Ok so I really hate to bother you, but I was wondering if you might possibly help me out whenever you get a free moment, absolutely no pressure at all and please take your time. Basically the checkout flow spec has been really really flaky lately and honestly I have spent the whole afternoon trying to figure out why. It keeps timing out on CI where it waits for the payment confirmation modal. Do not touch the global Playwright config because other teams depend on it. Thanks a million in advance, you are an absolute lifesaver!';
  const result = shared.optimizePrompt(padded, { file: null, selectionText: '' });

  // Technical content kept.
  assert.match(result.optimizedPrompt, /checkout flow spec/);
  assert.match(result.optimizedPrompt, /payment confirmation modal/);
  // Long, over-60-char constraint is extracted (not left inline).
  assert.match(result.optimizedPrompt, /Constraint: Do not touch the global Playwright config/);
  // Pleasantries removed.
  for (const filler of [/hi there/i, /hate to bother/i, /no pressure/i, /thanks a million/i, /lifesaver/i]) {
    assert.doesNotMatch(result.optimizedPrompt, filler, `filler survived: ${filler}`);
  }
  // Well-formed: no lower-case sentence starts, no connective orphaned on a boundary.
  assert.doesNotMatch(result.optimizedPrompt, /[.!?]\s+[a-z]/, 'a sentence starts lower-case');
  assert.doesNotMatch(result.optimizedPrompt, /(?:^|[.!?])\s*(?:and|but|or|so)\s*[.!?]/i, 'a connective is stranded on a sentence boundary');
});

test('optimizePrompt does NOT over-strip legitimate technical prompts', async () => {
  const shared = await loadSharedPromptOptimizer();
  const cases = [
    ['Refactor the auth module to use async/await and add error handling for the login flow.', ['async/await', 'error handling', 'login flow']],
    ['The function you could call here is validateSession; can you check why it returns null?', ['validateSession', 'returns null']],
    ['Implement exponential backoff in the retry helper and cap it at 5 attempts.', ['exponential backoff', 'retry helper', '5 attempts']],
  ];
  for (const [input, mustKeep] of cases) {
    const out = shared.optimizePrompt(input, { file: null, selectionText: '' }).optimizedPrompt;
    for (const token of mustKeep) {
      assert.ok(out.includes(token), `over-stripped "${token}" from: ${input}\n  got: ${out}`);
    }
  }
});

test('optimizeSelectionText preserves the failing assertion when compressing a stack trace', async () => {
  const shared = await loadSharedPromptOptimizer();
  const stack = [
    'Running 14 tests using 4 workers',
    '  ✓  tests/login.spec.ts:5:1 › login works (1.2s)',
    '  ✓  tests/home.spec.ts:8:1 › home renders (0.8s)',
    '  ✓  tests/footer.spec.ts:3:1 › footer renders (0.3s)',
    '  1) tests/dashboard.spec.ts:43:1 › greeting shows the user name',
    'Error: expect(received).toHaveText(expected)',
    '',
    'Expected string: "Welcome, Alice"',
    'Received string: "Welcome, Guest"',
    '',
    "  42 |   await page.goto('/dashboard');",
    "> 43 |   await expect(page.locator('[data-testid=\"greeting\"]')).toHaveText('Welcome, Alice');",
    "  44 |   await page.click('#logout');",
    '',
    '    at /Users/dev/app/tests/dashboard.spec.ts:43:58',
    '    at TestController._runTest (/Users/dev/app/node_modules/@playwright/test/lib/runner.js:812:14)',
    '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
  ].join('\n');

  const result = shared.optimizeSelectionText(stack, {});

  assert.equal(result.kind, 'stack-trace');
  // The whole point of compressing a stack trace: the assertion detail must survive.
  assert.match(result.output, /Expected string: "Welcome, Alice"/);
  assert.match(result.output, /Received string: "Welcome, Guest"/);
  assert.match(result.output, />\s*43 \|/, 'code frame marker should be preserved');
  assert.match(result.output, /dashboard\.spec\.ts/, 'source frame should be preserved');
  // Runtime-internal noise frames (with a function name before the location) are dropped.
  assert.doesNotMatch(result.output, /node:internal/, 'node internal frame should be stripped');
  assert.doesNotMatch(result.output, /node_modules/, 'node_modules frame should be stripped');
  // It still has to actually compress.
  assert.ok(result.afterTokens < result.beforeTokens, 'should reduce tokens');
});

test('optimizeSelectionText compresses a diff to its changed lines, not a stats summary', async () => {
  const shared = await loadSharedPromptOptimizer();
  const diff = [
    'diff --git a/src/auth.ts b/src/auth.ts',
    '@@ -10,3 +10,3 @@',
    '   const user = lookup(email);',
    '-  if (user.password === pass) {',
    '+  if (bcrypt.compareSync(pass, user.hash)) {',
    '   }',
  ].join('\n');

  const result = shared.optimizeSelectionText(diff, {});

  assert.equal(result.kind, 'diff');
  // The model can see the actual change…
  assert.match(result.output, /\+\s+if \(bcrypt\.compareSync/);
  assert.match(result.output, /-\s+if \(user\.password === pass\)/);
  // …not the old stats-only summary, and unchanged context is dropped.
  assert.doesNotMatch(result.output, /Selected diff:/);
  assert.doesNotMatch(result.output, /const user = lookup/);
});

test('optimizeSelectionText keeps nested call-log diagnostics for a locator/strict-mode failure', async () => {
  const shared = await loadSharedPromptOptimizer();
  const failure = [
    '  1) cart.spec.ts:30:3 › removes an item',
    '',
    "    Error: locator.click: strict mode violation: getByRole('button', { name: 'Remove' }) resolved to 3 elements",
    '',
    '    Call log:',
    "      - waiting for getByRole('button', { name: 'Remove' })",
    '      -   locator resolved to 3 elements. Proceeding with the first one',
    '      -   attempting click action',
    '      -   element is not stable - waiting 20ms',
    '',
    '    > 30 |   await page.getByRole(\'button\', { name: \'Remove\' }).click();',
    '',
    '        at /app/tests/cart.spec.ts:30:50',
  ].join('\n');

  const result = shared.optimizeSelectionText(failure, {});

  assert.equal(result.kind, 'stack-trace');
  // These diagnostic lines exist only in the call log — they're the signal for
  // flaky / locator-resolution failures and must survive compression.
  assert.match(result.output, /element is not stable/, 'flakiness diagnostic should survive');
  assert.match(result.output, /attempting click action/, 'action diagnostic should survive');
});

test('explainSelection keeps comments on a small code selection (the "why" is the point)', async () => {
  const shared = await loadSharedPromptOptimizer();
  const code = [
    '// Retry with backoff: the upstream 429s under burst load.',
    'async function fetchWithRetry(url) {',
    '  for (let i = 0; i < 3; i++) {',
    '    const res = await fetch(url);',
    '    if (res.ok) return res;',
    '    await sleep(2 ** i * 100); // exponential backoff',
    '  }',
    '}',
  ].join('\n');

  const result = shared.explainSelection(code, { filename: 'retry.ts' });

  assert.equal(result.kind, 'code');
  assert.equal(result.outlined, false, 'a small selection is not outlined');
  // Comments carry the intent the user wants explained — they must survive.
  assert.match(result.output, /Retry with backoff/, 'lead comment must be kept');
  assert.match(result.output, /exponential backoff/, 'inline rationale must be kept');
});

test('explainSelection outlines a selection at or above the threshold', async () => {
  const shared = await loadSharedPromptOptimizer();
  // Build a code body large enough to cross EXPLAIN_OUTLINE_THRESHOLD_TOKENS,
  // with multi-line method bodies so outlining (signatures kept, bodies dropped)
  // measurably shrinks it.
  const filler = Array.from({ length: 120 }, (_, i) => [
    `  helper${i}(value) {`,
    `    const scaled = value * ${i};`,
    `    const shifted = scaled + ${i};`,
    '    return shifted;',
    '  }',
  ].join('\n')).join('\n');
  const code = `export class BigService {\n${filler}\n}`;

  // estimateTokens ≈ ceil(len / 4); the fixture must clear the outline threshold.
  assert.ok(
    Math.ceil(code.length / 4) >= shared.EXPLAIN_OUTLINE_THRESHOLD_TOKENS,
    'fixture must exceed the outline threshold',
  );

  const result = shared.explainSelection(code, { filename: 'BigService.ts' });

  assert.equal(result.kind, 'code');
  assert.equal(result.outlined, true, 'a large selection is explained from its outline');
  assert.ok(result.afterTokens < result.beforeTokens, 'outline must shrink the selection');
});

test('detectSelectionKind: code that mentions "Error" behind a code file is code, not a stack trace', async () => {
  const shared = await loadSharedPromptOptimizer();
  const code = [
    'export class TaskDetailPage {',
    '  async open(id) {',
    "    if (!id) throw new Error('missing task id');",
    '    this.render(await this.fetch(id));',
    '  }',
    '}',
  ].join('\n');

  // The weak error-word heuristic must not beat a real .ts filename…
  assert.equal(shared.detectSelectionKind(code, { filename: 'TaskDetailPage.ts' }), 'code');
  // …but a genuine stack trace (real "at file:line:col" frames) still wins,
  // even with no filename behind it.
  const trace = 'Error: boom\n    at Object.<anonymous> (/app/x.js:12:9)\n    at Module._compile (node:internal/modules/cjs/loader:1254:14)';
  assert.equal(shared.detectSelectionKind(trace, {}), 'stack-trace');
});

test('explainSelection: code containing "Error" keeps comments and structure (not log-compressed)', async () => {
  const shared = await loadSharedPromptOptimizer();
  const code = [
    '// Guards a stale router id, then hydrates the panel.',
    'export class TaskDetailPage {',
    '  async open(id) {',
    "    if (!id) throw new Error('missing task id'); // early exit",
    '    this.render(await this.fetch(id));',
    '  }',
    '}',
  ].join('\n');

  const result = shared.explainSelection(code, { filename: 'TaskDetailPage.ts' });

  assert.equal(result.kind, 'code', 'must reach the code path, not stack-trace');
  assert.match(result.output, /hydrates the panel/, 'lead comment kept');
  assert.match(result.output, /early exit/, 'inline comment kept');
  // The old log compressor dropped the class-closing brace; the code path keeps it.
  assert.match(result.output.trimEnd(), /}$/, 'closing brace preserved');
});