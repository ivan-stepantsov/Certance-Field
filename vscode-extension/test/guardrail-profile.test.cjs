const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GUARDRAIL_ASSETS,
  buildGuardrailPlan,
  buildMcpReport,
  renderGuardrailReport,
} = require('../src/guardrail-profile.cjs');

test('buildGuardrailPlan writes missing assets and skips existing ones (non-destructive)', () => {
  const all = GUARDRAIL_ASSETS.map(a => a.path);
  // Pretend the lean-output file already exists.
  const plan = buildGuardrailPlan(['.github/instructions/lean-output.instructions.md']);

  assert.ok(plan.skipped.includes('.github/instructions/lean-output.instructions.md'), 'existing file is skipped, never overwritten');
  assert.ok(!plan.toWrite.some(w => w.path === '.github/instructions/lean-output.instructions.md'), 'existing file is not rewritten');
  assert.equal(plan.toWrite.length + plan.skipped.length, all.length, 'every asset is accounted for');
  for (const w of plan.toWrite) {
    assert.ok(typeof w.content === 'string' && w.content.length > 0, 'each written asset carries content');
  }
});

test('buildGuardrailPlan writes everything on a fresh repo, idempotent on re-run', () => {
  const fresh = buildGuardrailPlan([]);
  assert.equal(fresh.toWrite.length, GUARDRAIL_ASSETS.length);
  assert.equal(fresh.skipped.length, 0);

  // Second run, with all assets now present → writes nothing.
  const rerun = buildGuardrailPlan(GUARDRAIL_ASSETS.map(a => a.path));
  assert.equal(rerun.toWrite.length, 0, 'idempotent: nothing rewritten on re-apply');
  assert.equal(rerun.skipped.length, GUARDRAIL_ASSETS.length);
});

test('guardrail profile never ships .copilotignore (it is not a real Copilot feature)', () => {
  assert.ok(!GUARDRAIL_ASSETS.some(a => a.path.includes('.copilotignore')), '.copilotignore must not be deployed');
});

test('buildMcpReport advises allowlist/defer but never suggests removing connections', () => {
  const report = buildMcpReport({ serverCount: 4, allowlistServerCount: 1, deferredServerCount: 0 });
  assert.match(report, /Servers configured: \*\*4\*\*/);
  assert.match(report, /allowed_tools/);
  assert.match(report, /defer_loading/);
  assert.match(report, /your connections are never changed/);
  assert.doesNotMatch(report, /remove|delete|disconnect/i, 'must not advise removing the user\'s MCP servers');
});

test('buildMcpReport handles no MCP config', () => {
  assert.match(buildMcpReport(null), /No MCP config/);
  assert.match(buildMcpReport({ serverCount: 0 }), /No MCP config/);
});

test('renderGuardrailReport states the content-exclusion agent-mode caveat', () => {
  const out = renderGuardrailReport({
    written: ['.github/instructions/lean-output.instructions.md'],
    skipped: ['.github/copilot-instructions.md'],
    mcpReport: 'No MCP config found.',
  });
  assert.match(out, /Added/);
  assert.match(out, /Already present/);
  assert.match(out, /Content exclusion does \*\*not\*\* cover agent mode/);
  assert.match(out, /MCP report/);
});
