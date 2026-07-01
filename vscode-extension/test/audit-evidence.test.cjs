const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAuditEvidence } = require('../src/audit-evidence.cjs');

const baseStats = {
  totalBeforeTokens: 8000,
  totalAfterTokens: 3000,
  selectionBeforeTokens: 6000,
  selectionAfterTokens: 2000,
  redactionsTotal: 12,
  contextReadiness: { verdict: 'Ready', score: 85, maxScore: 100 },
  commandRuns: { chatCompress: 4, chatConcise: 2 },
};
const meta = { generatedAt: '2026-06-30T00:00:00Z', version: '0.2.31', workspace: 'demo' };

test('buildAuditEvidence reports token savings, redactions, readiness, and exclusion caveat', () => {
  const { markdown, json } = buildAuditEvidence({
    stats: baseStats, mcp: null, exclusionPresent: true, leanOutputPresent: true, meta, costPerMillionTokensUSD: 0,
  });

  assert.equal(json.tokenSavings.saved, 5000);
  assert.equal(json.tokenSavings.savedPct, 63);
  assert.equal(json.secretRedactions, 12);
  assert.equal(json.estimatedCostSavedUSD, null, 'no cost figure when rate is 0');

  assert.match(markdown, /Estimated tokens saved: \*\*5,000 \(63%\)\*\*/);
  assert.match(markdown, /secret values redacted before display\/send: \*\*12\*\*/);
  assert.match(markdown, /Readiness: \*\*Ready\*\* \(score 85\/100\)/);
  assert.match(markdown, /does \*\*not\*\* cover agent mode/);
  assert.match(markdown, /set `ceTokenKit\.costPerMillionTokensUSD`/, 'prompts for the rate when unset');
  assert.match(markdown, /Local-only/, 'states the no-content attestation');
});

test('buildAuditEvidence renders the enforced-vs-advisory governance matrix', () => {
  const { markdown, json } = buildAuditEvidence({
    stats: baseStats, mcp: { serverCount: 2, allowlistServerCount: 1, deferredServerCount: 0 },
    exclusionPresent: true, leanOutputPresent: true, agentsPolicyPresent: true, meta, costPerMillionTokensUSD: 0,
  });

  assert.equal(json.agentPolicyPresent, true);
  assert.match(markdown, /Governance & enforcement boundaries/);
  assert.match(markdown, /GitHub content exclusion \| \*\*Platform-enforced\*\*/);
  assert.match(markdown, /`AGENTS\.md` agent policy \| \*\*Behavioural \/ advisory\*\*/);
  assert.match(markdown, /Model routing advice \| \*\*Advisory\*\*/);
  assert.match(markdown, /Agent-mode policy present: ✅ yes/);
  assert.match(markdown, /MCP posture checked: ✅ 2 server\(s\)/);
  assert.match(markdown, /Secret redaction this period: ✅ 12 value\(s\) masked/);
});

test('governance posture reflects missing controls on a bare workspace', () => {
  const { markdown, json } = buildAuditEvidence({
    stats: { commandRuns: {} }, mcp: null,
    exclusionPresent: false, leanOutputPresent: false, agentsPolicyPresent: false, meta, costPerMillionTokensUSD: 0,
  });
  assert.equal(json.agentPolicyPresent, false);
  assert.match(markdown, /Agent-mode policy present: ❌ no/);
  assert.match(markdown, /MCP posture checked: — none found/);
  assert.match(markdown, /Secret redaction this period: — none yet/);
});

test('audit pack shows model cost posture only when recommendations were run', () => {
  const withAdvice = buildAuditEvidence({
    stats: { ...baseStats, modelAdviceRuns: 5, localTransformOpportunities: 2 },
    mcp: null, exclusionPresent: false, leanOutputPresent: false, agentsPolicyPresent: false, meta, costPerMillionTokensUSD: 0,
  });
  assert.equal(withAdvice.json.modelAdviceRuns, 5);
  assert.match(withAdvice.markdown, /Model cost posture/);
  assert.match(withAdvice.markdown, /recommendations run this period: \*\*5\*\*/);
  assert.match(withAdvice.markdown, /answerable \*\*locally\*\* \(avoided model calls\): \*\*2\*\*/);

  const withoutAdvice = buildAuditEvidence({
    stats: baseStats, mcp: null, exclusionPresent: false, leanOutputPresent: false, agentsPolicyPresent: false, meta, costPerMillionTokensUSD: 0,
  });
  assert.doesNotMatch(withoutAdvice.markdown, /Model cost posture/);
});

test('buildAuditEvidence converts tokens to an estimated $ saved when a rate is set', () => {
  const { markdown, json } = buildAuditEvidence({
    stats: baseStats, mcp: { serverCount: 3, allowlistServerCount: 1, deferredServerCount: 0 },
    exclusionPresent: false, leanOutputPresent: false, meta, costPerMillionTokensUSD: 10,
  });

  // 5000 tokens saved at $10 / 1,000,000 = $0.05
  assert.equal(json.estimatedCostSavedUSD, 0.05);
  assert.match(markdown, /Estimated cost saved: \$0\.05/);
  assert.match(markdown, /Servers: 3/);
});

test('buildAuditEvidence is safe on empty stats (fresh install)', () => {
  const { json, markdown } = buildAuditEvidence({
    stats: { commandRuns: {} }, mcp: null, exclusionPresent: false, leanOutputPresent: false, meta, costPerMillionTokensUSD: 0,
  });
  assert.equal(json.tokenSavings.saved, 0);
  assert.equal(json.tokenSavings.savedPct, 0);
  assert.equal(json.secretRedactions, 0);
  assert.match(markdown, /Readiness not yet computed/);
});
