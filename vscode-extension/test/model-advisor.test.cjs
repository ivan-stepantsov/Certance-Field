const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyTask, renderModelAdvice } = require('../src/model-advisor.cjs');

test('classifyTask sends cheap/mechanical work to the economy tier', () => {
  const result = classifyTask({ text: 'rename a variable and fix a typo' });
  assert.equal(result.tier, 'economy');
  assert.ok(result.reasons.some(r => /rename/.test(r)));
});

test('classifyTask sends reasoning-heavy work to the premium tier', () => {
  const result = classifyTask({ text: 'debug a race condition in the auth refactor' });
  assert.equal(result.tier, 'premium');
  assert.ok(result.premiumScore >= 1);
});

test('classifyTask defaults to standard when there is no strong signal', () => {
  const result = classifyTask({ text: 'update the readme wording' });
  assert.equal(result.tier, 'standard');
  assert.match(result.reasons.join(' '), /no strong signal/);
});

test('classifyTask treats a large selection as a complexity signal', () => {
  const result = classifyTask({ text: '', selectionLength: 5000 });
  assert.equal(result.tier, 'premium');
  assert.ok(result.reasons.some(r => /large selection/.test(r)));
});

test('classifyTask favours the safer tier on a tie (premium wins)', () => {
  // "rename" (economy) + "refactor" (premium) => premium, since under-powering
  // a real task erodes trust more than a little overspend.
  const result = classifyTask({ text: 'rename during this refactor' });
  assert.equal(result.tier, 'premium');
});

test('renderModelAdvice is honest: zero-token, advisory, defers to the picker', () => {
  const result = classifyTask({ text: 'fix a typo' });
  const md = renderModelAdvice(result, { taskText: 'fix a typo', selectionLength: 0 });

  assert.match(md, /Model Recommendation — \*\*Economy/);
  assert.match(md, /model picker/, 'points to VS Code’s picker for live multipliers');
  assert.match(md, /escalate to a premium model only if/, 'gives the savings ladder');
  assert.match(md, /no AI \(zero tokens\)/, 'states zero-token');
  assert.match(md, /can’t switch the model for you/, 'states advisory-only');
  assert.match(md, /Task: _fix a typo_/, 'echoes the task');
});

test('renderModelAdvice handles the no-input case gracefully', () => {
  const result = classifyTask({});
  const md = renderModelAdvice(result, {});
  assert.match(md, /No task description or selection/);
  assert.match(md, /Model Recommendation — \*\*Standard/);
});

test('classifyTask routes each spend-risk case correctly', () => {
  assert.equal(classifyTask({ text: 'compress this test output' }).routing, 'local-transform');
  assert.equal(classifyTask({ text: 'shorten this test output' }).routing, 'local-transform');
  assert.equal(classifyTask({ text: 'rename a variable' }).routing, 'completion-or-base');
  // "tidy the imports" is a code edit, not a context transform — it must NOT route
  // to local-transform (/compress can't rename or reorganize imports).
  assert.equal(classifyTask({ text: 'rename a variable and tidy the imports' }).routing, 'completion-or-base');
  assert.equal(classifyTask({ text: 'debug a race condition in the auth refactor' }).routing, 'premium');
  assert.equal(classifyTask({ text: 'update the readme wording' }).routing, 'auto');
  assert.equal(classifyTask({ text: 'classify every file in the dataset' }).routing, 'batch-offline');
});

test('renderModelAdvice shows the cost-posture routing section and links to official billing docs', () => {
  const md = renderModelAdvice(classifyTask({ text: 'update the readme wording' }), { taskText: 'x' });
  assert.match(md, /\*\*Route:\*\* Auto model selection/);
  assert.match(md, /Auto\*\* routes by complexity/);
  assert.match(md, /usage-based billing/, 'links to billing docs instead of hardcoding rates');
  assert.doesNotMatch(md, /\$\d/, 'no hardcoded prices in the report');
});
