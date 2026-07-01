const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');

// A regulated shop pins the model-calling surfaces OFF by policy. Those surfaces
// must be gated in the MANIFEST via a `when` clause — a runtime gate alone is not
// enough, because VS Code populates the @-picker / tool list from package.json.
// Without `when`, a disabled participant still appears and throws "No activated
// agent…" when used, which breaks the "removed entirely" lockdown claim.

test('the concise participant is manifest-gated on its setting (Transform-only lockdown)', () => {
  const concise = (pkg.contributes.chatParticipants || [])
    .find(p => p.id === 'ivan-stepantsov.cetoken-concise');
  assert.ok(concise, 'concise participant must be declared in the manifest');
  assert.equal(
    concise.when,
    'config.ceTokenKit.concise.enabled',
    'concise participant must be hidden from the picker when concise.enabled is false',
  );
});

test('the @cetoken transform participant is always available (no lockdown gate)', () => {
  const base = (pkg.contributes.chatParticipants || [])
    .find(p => p.id === 'ivan-stepantsov.cetoken');
  assert.ok(base, '@cetoken participant must be declared');
  // Transform mode makes no model call, so it is never pinned off; it must not
  // carry a disabling `when`.
  assert.equal(base.when, undefined, '@cetoken must not be gated off');
});

test('the agent tool is manifest-gated on its setting (Transform-only lockdown)', () => {
  const tool = (pkg.contributes.languageModelTools || [])
    .find(t => t.name === 'ce_compress');
  assert.ok(tool, 'agent tool must be declared in the manifest');
  assert.equal(
    tool.when,
    'config.ceTokenKit.agentTool.enabled',
    'agent tool must be gated on agentTool.enabled',
  );
});
