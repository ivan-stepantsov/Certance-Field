import test from 'node:test';
import assert from 'node:assert/strict';
import { inferResponseShape, isBrevitySensitive } from './prompt-shape.js';

// --- Phare guard: brevity must stay OFF for fact-check / false-premise / safety ---

test('isBrevitySensitive fires on false-premise, verification, and destructive prompts', () => {
  for (const prompt of [
    "Isn't it true that JavaScript passes objects by value?",
    'Python uses curly braces to delimit blocks, right?',
    'Are you sure HTTP is stateful by default?',
    'Verify that Array.prototype.sort() sorts numbers in numeric order by default.',
    'Confirm that TCP guarantees no packet loss at the application layer.',
    'Is this correct?',
    'Please double-check the auth flow.',
    'rm -rf the build directory — safe?',
    'How do I delete the production database?',
    'Should I force-push to main?',
  ]) {
    assert.equal(isBrevitySensitive(prompt), true, `expected brevity-sensitive: ${prompt}`);
  }
});

test('isBrevitySensitive does NOT over-fire on the kit\'s own domain words or benign edits', () => {
  for (const prompt of [
    'How do I reduce token usage in Copilot?',   // "token" is our domain word
    'How do I delete a key from a dict in Python?', // destructive verb, no infra object
    'What is the secret sauce of connection pooling?',
    'How is a JWT verified?',                     // "verified" != "verify"
  ]) {
    assert.equal(isBrevitySensitive(prompt), false, `should stay brevity-eligible: ${prompt}`);
  }
});

test('inferResponseShape short-circuits to the completeness line (never a brevity hint) when sensitive', () => {
  const shape = inferResponseShape('Are you sure this is safe?');
  assert.match(shape, /Answer completely/);
  assert.doesNotMatch(shape, /aim for|≤|minimal change/i);
});

test('the Phare guard wins even over an explain/diff intent', () => {
  assert.match(inferResponseShape('Explain why this is definitely thread-safe, right?'), /Answer completely/);
  assert.match(inferResponseShape('verify this', { selectionKind: 'diff' }), /Answer completely/);
});

// --- Soft, bounded, answer-first hints (Decision 2) ---

test('plain explanatory Q&A gets the soft, answer-first ≤3-sentence hint', () => {
  const shape = inferResponseShape('What is database connection pooling?');
  assert.match(shape, /Lead with the answer/);
  assert.match(shape, /≤3 sentences/);
});

test('length hints are SOFT ("aim for"), never framed as an enforced cap', () => {
  const shape = inferResponseShape('What is a JWT?');
  assert.match(shape, /aim for/i);
  assert.doesNotMatch(shape, /\bmust\b/i);
});

test('explain intent gets a soft, bounded, answer-first hint', () => {
  const shape = inferResponseShape('explain the control flow here');
  assert.match(shape, /Lead with the answer/);
  assert.match(shape, /aim for ≤5 sentences/i);
});

// --- Fail-safe default: uncertain → no brevity hint at all ---

test('fail-safe default: an uncertain prompt (no positive question signal) gets no hint', () => {
  // Not sensitive, not a question, no intent keyword → we do NOT force brevity.
  assert.equal(inferResponseShape('the login thing on staging'), null);
  assert.equal(inferResponseShape('handle the edge case around midnight rollover'), null);
});

// --- Existing structural branches unchanged ---

test('existing structural branches are unchanged (diff / review / stack-trace / fix)', () => {
  assert.match(inferResponseShape('review this', { selectionKind: 'diff' }), /highest-risk regressions/);
  assert.match(inferResponseShape('summarize', { selectionKind: 'diff' }), /changed behavior/);
  assert.match(inferResponseShape('anything', { selectionKind: 'stack-trace' }), /root cause first/);
  assert.match(inferResponseShape('review this feature'), /highest-risk findings/);
  assert.match(inferResponseShape('fix the login bug'), /minimal change needed/);
});

test('the narrow-file length hint is de-hardened to a soft "Aim for"', () => {
  const shape = inferResponseShape('tidy this up', { file: 'src/app.ts' });
  assert.match(shape, /Aim for ≤150 tokens/);
});
