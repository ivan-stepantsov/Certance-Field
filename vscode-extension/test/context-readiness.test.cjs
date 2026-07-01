const test = require('node:test');
const assert = require('node:assert/strict');

const { buildWorkspaceReadiness, collectReadinessGaps } = require('../src/context-readiness.cjs');

test('buildWorkspaceReadiness scores a ready workspace', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const workspace = buildWorkspaceReadiness({
    name: 'Token Kit',
    path: '/repo',
    hasRepoInstructions: true,
    pathInstructionCount: 2,
    hasAgentsFile: true,
    hasContentExclusion: true,
    hasCopilotIgnore: true,
    hasMcpConfig: true,
    mcpServerCount: 2,
    mcpAllowlistServerCount: 2,
    mcpDeferredServerCount: 2,
    hasDevcontainer: true,
    latestContextUpdateMs: now - (14 * 24 * 60 * 60 * 1000),
  }, now);

  assert.equal(workspace.score, 100);
  assert.equal(workspace.verdict, 'Ready');
  assert.equal(workspace.recommendations.length, 0);
});

test('buildWorkspaceReadiness highlights missing core context files', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const workspace = buildWorkspaceReadiness({
    name: 'Bare Repo',
    path: '/bare',
    hasRepoInstructions: false,
    pathInstructionCount: 0,
    hasAgentsFile: false,
    hasContentExclusion: false,
    hasCopilotIgnore: false,
    hasMcpConfig: false,
    mcpServerCount: 0,
    mcpAllowlistServerCount: 0,
    mcpDeferredServerCount: 0,
    hasDevcontainer: false,
    latestContextUpdateMs: null,
  }, now);

  assert.equal(workspace.verdict, 'Incomplete');
  assert.match(workspace.recommendations.join('\n'), /Repository instructions/);
  assert.match(workspace.recommendations.join('\n'), /Agent policy/);
  assert.match(workspace.recommendations.join('\n'), /Content exclusion/);
});

test('buildWorkspaceReadiness degrades MCP quality when allowlists and deferred loading are missing', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const workspace = buildWorkspaceReadiness({
    name: 'Partial MCP Repo',
    path: '/mcp',
    hasRepoInstructions: true,
    pathInstructionCount: 1,
    hasAgentsFile: true,
    hasContentExclusion: true,
    hasCopilotIgnore: true,
    hasMcpConfig: true,
    mcpServerCount: 3,
    mcpAllowlistServerCount: 1,
    mcpDeferredServerCount: 0,
    hasDevcontainer: true,
    latestContextUpdateMs: now,
  }, now);

  const mcpSignal = workspace.signals.find(signal => signal.id === 'mcpConfig');
  assert.equal(mcpSignal.status, 'warn');
  assert.match(mcpSignal.detail, /allowlists on 1\/3/);
  assert.match(workspace.recommendations.join('\n'), /allowed_tools and defer_loading/);
});

test('every signal carries the points it earned', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const workspace = buildWorkspaceReadiness({
    name: 'Sample Repo',
    path: '/sample',
    hasRepoInstructions: true,
    pathInstructionCount: 1,
    hasAgentsFile: true,
    hasContentExclusion: true,
    hasCopilotIgnore: false,
    hasMcpConfig: false,
    mcpServerCount: 0,
    mcpAllowlistServerCount: 0,
    mcpDeferredServerCount: 0,
    hasDevcontainer: false,
    latestContextUpdateMs: now,
  }, now);

  assert.equal(workspace.score, 86);
  assert.equal(workspace.signals.find(s => s.id === 'repoInstructions').earned, 20);
  assert.equal(workspace.signals.find(s => s.id === 'mcpConfig').earned, 8);
  assert.equal(workspace.signals.find(s => s.id === 'copilotIgnore').earned, 3);
});

test('collectReadinessGaps ranks non-passing signals by points to close', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const workspace = buildWorkspaceReadiness({
    name: 'Sample Repo',
    path: '/sample',
    hasRepoInstructions: true,
    pathInstructionCount: 1,
    hasAgentsFile: true,
    hasContentExclusion: true,
    hasCopilotIgnore: false,
    hasMcpConfig: false,
    mcpServerCount: 0,
    mcpAllowlistServerCount: 0,
    mcpDeferredServerCount: 0,
    hasDevcontainer: false,
    latestContextUpdateMs: now,
  }, now);

  const gaps = collectReadinessGaps({ workspaces: [workspace] });

  // ranked by impact, passing signals excluded
  assert.deepEqual(gaps.map(gap => gap.id), ['mcpConfig', 'devcontainer', 'copilotIgnore']);
  assert.deepEqual(gaps.map(gap => gap.toClose), [7, 5, 2]);
  assert.ok(!gaps.some(gap => gap.id === 'repoInstructions'));

  const mcp = gaps.find(gap => gap.id === 'mcpConfig');
  assert.equal(mcp.earned, 8);
  assert.equal(mcp.weight, 15);
  assert.match(mcp.action, /MCP config/);
  assert.match(mcp.why, /MCP servers and tools/, 'each gap carries a plain-English explanation');
});

const CLEAN_PROBE = {
  name: 'x',
  path: '/x',
  hasRepoInstructions: true,
  pathInstructionCount: 1,
  hasAgentsFile: true,
  hasContentExclusion: true,
  hasCopilotIgnore: true,
  hasMcpConfig: true,
  mcpServerCount: 1,
  mcpAllowlistServerCount: 1,
  mcpDeferredServerCount: 1,
  hasDevcontainer: true,
};

test('agentsPolicy degrades to warn when agent definitions lack tool scope', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const ws = buildWorkspaceReadiness({
    ...CLEAN_PROBE,
    latestContextUpdateMs: now,
    agentDefinitions: { total: 3, unscoped: 2, undescribed: 0 },
  }, now);

  const sig = ws.signals.find(s => s.id === 'agentsPolicy');
  assert.equal(sig.status, 'warn');
  assert.match(sig.detail, /2 of 3 agent definition\(s\) declare no tool scope/);
  assert.equal(sig.earned, 8);
});

test('repoInstructions degrades to warn for a bloated, unanchored instructions file', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const ws = buildWorkspaceReadiness({
    ...CLEAN_PROBE,
    latestContextUpdateMs: now,
    instructionHygiene: { lineCount: 340, bloated: true, broadScopeHits: 1, broadScopeExamples: ['@workspace'] },
  }, now);

  const sig = ws.signals.find(s => s.id === 'repoInstructions');
  assert.equal(sig.status, 'warn');
  assert.match(sig.detail, /340 lines/);
  assert.match(sig.detail, /@workspace/);
  assert.equal(sig.earned, 10);
});

test('MCP finding names the specific under-scoped servers', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const ws = buildWorkspaceReadiness({
    ...CLEAN_PROBE,
    latestContextUpdateMs: now,
    mcpServerCount: 3,
    mcpAllowlistServerCount: 1,
    mcpDeferredServerCount: 0,
    mcpServerNames: ['github', 'playwright', 'filesystem'],
    mcpServerGaps: [
      { name: 'github', needsAllowlist: false, needsDeferred: true },
      { name: 'playwright', needsAllowlist: true, needsDeferred: true },
      { name: 'filesystem', needsAllowlist: true, needsDeferred: true },
    ],
  }, now);

  const sig = ws.signals.find(s => s.id === 'mcpConfig');
  assert.equal(sig.status, 'warn');
  // Lists which servers were found, then names the offenders + what each needs.
  assert.match(sig.detail, /Found 3 MCP server\(s\) \(github, playwright, filesystem\); allowlists on 1\/3/);
  assert.match(sig.detail, /To fix: github \(needs defer_loading\), playwright \(needs allowed_tools \+ defer_loading\), filesystem \(needs allowed_tools \+ defer_loading\)\./);
  // The Recommended Actions "Fix:" (signal.action) names the servers too, not "each active MCP server".
  assert.match(sig.action, /Add the missing allowed_tools and defer_loading to: github, playwright, filesystem\./);
});

test('agentsPolicy and repoInstructions stay pass with a clean agentic setup', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const ws = buildWorkspaceReadiness({
    ...CLEAN_PROBE,
    latestContextUpdateMs: now,
    agentDefinitions: { total: 2, unscoped: 0, undescribed: 0 },
    instructionHygiene: { lineCount: 40, bloated: false, broadScopeHits: 0, broadScopeExamples: [] },
  }, now);

  assert.equal(ws.score, 100);
  assert.equal(ws.signals.find(s => s.id === 'agentsPolicy').status, 'pass');
  assert.equal(ws.signals.find(s => s.id === 'repoInstructions').status, 'pass');
});