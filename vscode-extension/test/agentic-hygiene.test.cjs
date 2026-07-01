const test = require('node:test');
const assert = require('node:assert/strict');

const {
  summarizeAgentDefinitions,
  summarizeInstructionHygiene,
} = require('../src/agentic-hygiene.cjs');

test('summarizeAgentDefinitions flags agents with no tool scope or no description', () => {
  const files = [
    { name: 'good.agent.md', text: '---\nname: good\ndescription: use for X\ntools:\n  - read\n---\nbody' },
    { name: 'no-tools.agent.md', text: '---\nname: nt\ndescription: use for Y\n---\nbody' },
    { name: 'no-desc.agent.md', text: '---\nname: nd\ntools: [read]\n---\nbody' },
    { name: 'bare.agent.md', text: '# just a heading, no frontmatter' },
  ];
  const summary = summarizeAgentDefinitions(files);
  assert.equal(summary.total, 4);
  assert.equal(summary.unscoped, 2, 'no-desc has tools; no-tools and bare do not');
  assert.equal(summary.undescribed, 2, 'no-tools has description; no-desc and bare do not');
});

test('summarizeAgentDefinitions returns a clean summary for a well-scoped set', () => {
  const files = [
    { name: 'a.agent.md', text: '---\ndescription: a\ntools: [read]\n---\n' },
    { name: 'b.agent.md', text: '---\ndescription: b\ntools:\n  - search\n---\n' },
  ];
  const summary = summarizeAgentDefinitions(files);
  assert.deepEqual(summary, { total: 2, unscoped: 0, undescribed: 0 });
});

test('summarizeAgentDefinitions tolerates no agent files', () => {
  assert.deepEqual(summarizeAgentDefinitions([]), { total: 0, unscoped: 0, undescribed: 0 });
  assert.deepEqual(summarizeAgentDefinitions(undefined), { total: 0, unscoped: 0, undescribed: 0 });
});

test('summarizeInstructionHygiene flags a bloated always-loaded file', () => {
  const big = Array.from({ length: 250 }, (_, i) => `line ${i}`).join('\n');
  const summary = summarizeInstructionHygiene(big);
  assert.equal(summary.lineCount, 250);
  assert.equal(summary.bloated, true);
});

test('summarizeInstructionHygiene flags broad-scope directives', () => {
  const summary = summarizeInstructionHygiene('Always use @workspace and read all files in the entire repo.');
  assert.ok(summary.broadScopeHits >= 2);
  assert.ok(summary.broadScopeExamples.some(e => /@workspace/i.test(e)));
});

test('summarizeInstructionHygiene passes a lean, anchored file', () => {
  const summary = summarizeInstructionHygiene('Run `npm test`. Edit only files under src/. Keep answers terse.');
  assert.equal(summary.bloated, false);
  assert.equal(summary.broadScopeHits, 0);
});
