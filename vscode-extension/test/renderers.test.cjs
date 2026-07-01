const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatDelta,
  renderContextReadinessReport,
  renderExplainSelectionResult,
  renderPromptResult,
  renderSelectionResult,
  renderStats,
  selectionFollowUpPrompt,
  buildSelectionClipboard,
} = require('../src/renderers.cjs');

test('formatDelta reports saved and added tokens', () => {
  assert.equal(formatDelta(100, 40), 'saved ~60 tokens');
  assert.equal(formatDelta(10, 25), 'added ~15 tokens');
  assert.equal(formatDelta(12, 12), 'no token change');
});

test('renderPromptResult includes context and warnings sections', () => {
  const output = renderPromptResult({
    optimizedPrompt: 'Fix the failing test.',
    beforeTokens: 20,
    afterTokens: 10,
    contextType: 'prompt-only',
    cacheability: {
      score: 82,
      stablePrefixRatio: 0.76,
      volatilityDensity: 0.05,
    },
    warnings: ['Use a narrower file scope.'],
  });

  assert.match(output, /# Optimized Prompt/);
  assert.match(output, /Fix the failing test\./);
  assert.match(output, /Use a narrower file scope\./);
  assert.match(output, /## Cacheability/);
  assert.match(output, /Reuse score: 82\/100 \(stable prefix 76%\)/);
  // Volatile (density 0.05 / prefix < 1) -> shows the "move noise to the end" guidance.
  assert.match(output, /move run-specific noise \(IDs, timestamps, error dumps\) to the END/);
  assert.match(output, /## Suggested Actions/);
});

test('renderSelectionResult chooses diff renderer', () => {
  const output = renderSelectionResult(
    { commandKey: 'reviewDiff' },
    { beforeTokens: 40, afterTokens: 10, output: 'Diff summary', warnings: [] },
    'src/app.ts'
  );

  assert.match(output, /# Review Diff/);
  assert.match(output, /Diff summary/);
  assert.match(output, /regressions, changed behavior/);
  assert.match(output, /Cost note: Use this as a local preflight before Copilot code review/);
});

test('selection renderers omit the file entirely when the selection has no file (scratch buffer)', () => {
  const base = { beforeTokens: 40, afterTokens: 10, output: 'summary', warnings: [] };
  for (const commandKey of ['reviewDiff', 'debugStackTrace', 'explainSelection']) {
    const out = renderSelectionResult({ commandKey }, { ...base, kind: 'code' }, null);
    assert.doesNotMatch(out, /\bnull\b/, `${commandKey} must not stringify a null file`);
    assert.doesNotMatch(out, /: null|in null|from null/, `${commandKey} must not render a null file reference`);
  }
});

test('renderSelectionResult chooses stack trace renderer', () => {
  const output = renderSelectionResult(
    { commandKey: 'debugStackTrace' },
    { beforeTokens: 40, afterTokens: 20, output: 'Stack summary', warnings: ['Add the error line.'] },
    'logs/error.txt'
  );

  assert.match(output, /# Debug Stack Trace/);
  assert.match(output, /Stack summary/);
  assert.match(output, /Add the error line\./);
});

test('renderExplainSelectionResult formats a compressed selection with an "Optimized" label and delta', () => {
  const output = renderExplainSelectionResult(
    { kind: 'code', beforeTokens: 80, afterTokens: 40, output: 'Selected code summary', warnings: [] },
    'src/widget.ts'
  );

  assert.match(output, /# Explain Selection/);
  assert.match(output, /Selected code summary/);
  // The follow-up points at the pasted content ("this code"), not the source file
  // — pointing Copilot back at the file would re-read the uncompressed original.
  assert.match(output, /Explain this code briefly and concretely/);
  assert.doesNotMatch(output, /from src\/widget.ts/);
  // …but the file is still surfaced for provenance in the Source line.
  assert.match(output, /- Source: src\/widget.ts/);
  // Tokens actually dropped (80 -> 40), so claiming a delta and "Optimized" is honest.
  assert.match(output, /## Optimized Selection/);
  assert.match(output, /Estimated delta:/);
});

test('renderExplainSelectionResult presents a verbatim selection honestly (no "Optimized", no delta)', () => {
  const output = renderExplainSelectionResult(
    { kind: 'code', outlined: false, beforeTokens: 136, afterTokens: 136, output: 'export class X {}', warnings: [] },
    'pages/TaskDetailPage.ts'
  );

  // Nothing was compressed, so it must not masquerade as optimized…
  assert.match(output, /## Selection to explain \(comments kept\)/);
  assert.doesNotMatch(output, /## Optimized Selection/);
  // …and must not report a pointless "no token change" delta.
  assert.doesNotMatch(output, /Estimated delta/);
  // The concise follow-up prompt is the actual value delivered here.
  assert.match(output, /Explain this code briefly and concretely/);
});

test('renderExplainSelectionResult labels an outlined selection and keeps the delta', () => {
  const output = renderExplainSelectionResult(
    { kind: 'code', outlined: true, beforeTokens: 1200, afterTokens: 300, output: 'export class X {...}', warnings: [] },
    'src/Big.ts'
  );

  assert.match(output, /## Outlined Selection/);
  assert.match(output, /Mode: outline \(signatures kept, bodies dropped\)/);
  assert.match(output, /Estimated delta:/);
  assert.match(output, /responsibilities, the main pieces/);
});

// --- Clipboard bundle: prompt + compressed content, ready to paste ---------

test('buildSelectionClipboard puts the review prompt first, then the diff fenced as ```diff', () => {
  const result = { output: 'diff --git a/x b/x\n-old\n+new', kind: 'diff', outlined: false };
  const bundle = buildSelectionClipboard('reviewDiff', result);

  // Prompt leads, so "this diff" refers to the block pasted right below it.
  assert.match(bundle, /^Review this diff\. Focus on regressions/);
  assert.match(bundle, /```diff\n/);
  assert.match(bundle, /diff --git a\/x b\/x/);
  assert.ok(bundle.indexOf('Review this diff') < bundle.indexOf('diff --git'), 'prompt precedes content');
});

test('buildSelectionClipboard bundles the debug prompt with the stack trace', () => {
  const bundle = buildSelectionClipboard('debugStackTrace', { output: 'Error: boom\n  at f (x:1:1)', kind: 'stacktrace' });
  assert.match(bundle, /^Debug this stack trace\./);
  assert.match(bundle, /Error: boom/);
});

test('buildSelectionClipboard bundles the explain prompt (outlined vs plain) and fences JSON', () => {
  const outlined = buildSelectionClipboard('explainSelection', { output: 'class X {}', kind: 'code', outlined: true });
  assert.match(outlined, /^Explain what this code does:/);

  const plain = buildSelectionClipboard('explainSelection', { output: '{"a":1}', kind: 'json', outlined: false });
  assert.match(plain, /^Explain this json briefly/);
  assert.match(plain, /```json\n/);
});

test('buildSelectionClipboard fence outgrows any backtick run inside the content', () => {
  // Explaining a markdown file that itself contains a ``` block must not break
  // the bundle — the fence has to be longer than the longest inner run.
  const bundle = buildSelectionClipboard('explainSelection', { output: 'before ```js\ncode\n``` after', kind: 'text', outlined: false });
  assert.match(bundle, /````/, 'uses a 4+ backtick fence to survive the inner ```');
  assert.ok(bundle.endsWith('````'), 'closes with the longer fence');
});

test('the clipboard bundle and the result doc use the SAME follow-up prompt (no drift)', () => {
  const result = { output: 'diff --git a/x b/x\n-a\n+b', kind: 'diff', outlined: false, beforeTokens: 50, afterTokens: 30, warnings: [] };
  const doc = renderSelectionResult({ commandKey: 'reviewDiff' }, result, 'x.diff');
  const bundle = buildSelectionClipboard('reviewDiff', result);
  const prompt = selectionFollowUpPrompt('reviewDiff', result);

  assert.ok(doc.includes(prompt), 'the result document shows the shared prompt');
  assert.ok(bundle.startsWith(prompt), 'the clipboard bundle starts with the shared prompt');
  // The doc tells the user the clipboard is a ready-to-send bundle.
  assert.match(doc, /already bundled on your clipboard/);
});

test('renderStats shows per-command counts', () => {
  const output = renderStats({
    promptRuns: 2,
    selectionRuns: 3,
    commandRuns: {
      optimizePrompt: 2,
      reviewDiff: 1,
      debugStackTrace: 1,
      explainSelection: 1,
    },
    totalBeforeTokens: 100,
    totalAfterTokens: 60,
    totalWarnings: 2,
    volatileContextWarnings: 1,
    lowReuseWarnings: 1,
    instructionSelectionWarnings: 1,
    verbosityControlWarnings: 2,
    mcpToolBloatWarnings: 3,
    mcpDeferredLoadingWarnings: 2,
    repeatedPromptSkeletons: 2,
    uniquePromptSkeletons: 3,
    skeletonCounts: {
      'fix-auth-spec': 4,
      'review-diff-risk': 3,
      'one-off': 1,
    },
    lastContextType: 'diff',
    contextReadiness: {
      verdict: 'Needs attention',
      score: 73,
      maxScore: 100,
      workspaceCount: 2,
      generatedAt: '2026-06-09T12:00:00.000Z',
    },
  });

  assert.match(output, /Optimize Prompt runs: 2/);
  assert.match(output, /Review Diff runs: 1/);
  assert.match(output, /Estimated tokens saved: 40 \(40% smaller\)/);
  assert.match(output, /Review-preflight share: 33% of selection runs/);
  assert.match(output, /Volatile-context warnings: 1/);
  assert.match(output, /Low-reuse warnings: 1/);
  assert.match(output, /Instruction-selection warnings: 1/);
  assert.match(output, /Verbosity-control warnings: 2/);
  assert.match(output, /MCP tool-bloat warnings: 3/);
  assert.match(output, /MCP deferred-loading warnings: 2/);
  assert.match(output, /Repeated prompt skeletons: 2/);
  assert.match(output, /Unique prompt skeletons: 3/);
  assert.match(output, /## Context Readiness/);
  assert.match(output, /Last verdict: Needs attention/);
  assert.match(output, /Last score: 73\/100/);
  assert.match(output, /## Top Recurring Skeletons/);
  assert.match(output, /fix-auth-spec: 4 runs/);
  assert.doesNotMatch(output, /one-off: 1 runs/);
  assert.match(output, /Promote these recurring prompts to `\.github\/copilot-instructions\.md`/);
});

test('renderStats spells out readiness gaps with points to close', () => {
  const output = renderStats({
    promptRuns: 0,
    selectionRuns: 0,
    commandRuns: {},
    totalBeforeTokens: 0,
    totalAfterTokens: 0,
    totalWarnings: 0,
    lastContextType: 'none',
    contextReadiness: {
      verdict: 'Needs attention',
      score: 86,
      maxScore: 100,
      workspaceCount: 1,
      generatedAt: '2026-07-05T00:00:00.000Z',
      gaps: [
        { label: 'MCP configuration', status: 'warn', earned: 8, weight: 15, toClose: 7, action: 'Add a minimal MCP config.' },
        { label: 'Dev container', status: 'warn', earned: 5, weight: 10, toClose: 5, action: 'Add a dev container.' },
      ],
    },
  });

  assert.match(output, /### Close these gaps to raise the score \(\+12 available\)/);
  assert.match(output, /- MCP configuration — WARN 8\/15 \(\+7\): Add a minimal MCP config\./);
  assert.match(output, /- Dev container — WARN 5\/10 \(\+5\): Add a dev container\./);
  assert.match(output, /Run "CE: Check Context Readiness" for the full per-signal breakdown\./);
});

test('renderStats reports a clean bill when a live readiness check finds no gaps', () => {
  const output = renderStats({
    promptRuns: 0,
    selectionRuns: 0,
    commandRuns: {},
    totalBeforeTokens: 0,
    totalAfterTokens: 0,
    totalWarnings: 0,
    lastContextType: 'none',
    contextReadiness: {
      verdict: 'Ready',
      score: 100,
      maxScore: 100,
      workspaceCount: 1,
      generatedAt: '2026-07-05T00:00:00.000Z',
      gaps: [],
    },
  });

  assert.match(output, /All readiness signals pass — nothing to improve\./);
  assert.doesNotMatch(output, /Close these gaps/);
});

test('renderStats explains each gap with a plain-English "what it is" when provided', () => {
  const output = renderStats({
    promptRuns: 0,
    selectionRuns: 0,
    commandRuns: {},
    totalBeforeTokens: 0,
    totalAfterTokens: 0,
    totalWarnings: 0,
    lastContextType: 'none',
    contextReadiness: {
      verdict: 'Incomplete',
      score: 40,
      maxScore: 100,
      workspaceCount: 1,
      generatedAt: '2026-07-05T00:00:00.000Z',
      gaps: [
        {
          label: 'Content exclusion',
          status: 'missing',
          earned: 0,
          weight: 15,
          toClose: 15,
          action: 'Add a repository content-exclusion file and mirror it in GitHub Copilot settings.',
          why: 'GitHub Copilot\'s enforced privacy layer that stops it reading listed paths.',
        },
      ],
    },
  });

  assert.match(output, /- Content exclusion — MISSING 0\/15 \(\+15\)/);
  assert.match(output, /What it is: GitHub Copilot's enforced privacy layer that stops it reading listed paths\./);
  assert.match(output, /Fix: Add a repository content-exclusion file/);
});

test('renderStats surfaces chat-participant and agent-tool run counts', () => {
  const output = renderStats({
    promptRuns: 0,
    selectionRuns: 0,
    commandRuns: {
      optimizePrompt: 0,
      reviewDiff: 0,
      debugStackTrace: 0,
      explainSelection: 0,
      chatOptimize: 5,
      chatCompress: 4,
      chatReview: 3,
      chatDebug: 2,
      chatExplain: 1,
      agentCompress: 7,
    },
    totalBeforeTokens: 0,
    totalAfterTokens: 0,
    totalWarnings: 0,
    volatileContextWarnings: 0,
    lowReuseWarnings: 0,
    instructionSelectionWarnings: 0,
    verbosityControlWarnings: 0,
    mcpToolBloatWarnings: 0,
    mcpDeferredLoadingWarnings: 0,
    repeatedPromptSkeletons: 0,
    uniquePromptSkeletons: 0,
    skeletonCounts: {},
    lastContextType: 'none',
    contextReadiness: null,
  });

  assert.match(output, /@cetoken Optimize runs: 5/);
  assert.match(output, /@cetoken \/compress runs: 4/);
  assert.match(output, /@cetoken \/review runs: 3/);
  assert.match(output, /@cetoken \/debug runs: 2/);
  assert.match(output, /@cetoken \/explain runs: 1/);
  assert.match(output, /#ceCompress agent-tool runs: 7/);
});

test('renderStats separates compression savings from prompt-shaping deltas', () => {
  const output = renderStats({
    promptRuns: 2,
    selectionRuns: 4,
    commandRuns: { optimizePrompt: 2 },
    totalBeforeTokens: 1000,
    totalAfterTokens: 700,
    // Selection (compression) runs saved 400; prompt-shaping runs ADDED 100.
    selectionBeforeTokens: 800,
    selectionAfterTokens: 400,
    promptBeforeTokens: 200,
    promptAfterTokens: 300,
    totalWarnings: 0,
    volatileContextWarnings: 0,
    lowReuseWarnings: 0,
    instructionSelectionWarnings: 0,
    verbosityControlWarnings: 0,
    repeatedPromptSkeletons: 0,
    uniquePromptSkeletons: 0,
    skeletonCounts: {},
    lastContextType: 'code',
    contextReadiness: null,
  });

  // Aggregate stays (300 net), but the breakdown shows the real compression win
  // (400, 50% smaller) is not diluted by the prompt-shaping cost (+100 added).
  assert.match(output, /Estimated tokens saved: 300 \(30% smaller\)/);
  assert.match(output, /Compression savings \(selection runs\): 400 \(50% smaller\)/);
  assert.match(output, /Prompt-shaping delta \(prompt runs\): 100 added/);
});

test('renderStats tolerates stats stored before per-group token tracking existed', () => {
  // Old globalState has commandRuns but no selection*/prompt* fields — the new
  // per-group lines must fall back to 0, not NaN.
  const output = renderStats({
    promptRuns: 1,
    selectionRuns: 1,
    commandRuns: { optimizePrompt: 1, reviewDiff: 0, debugStackTrace: 0, explainSelection: 0 },
    totalBeforeTokens: 100,
    totalAfterTokens: 80,
    totalWarnings: 0,
    volatileContextWarnings: 0,
    lowReuseWarnings: 0,
    instructionSelectionWarnings: 0,
    verbosityControlWarnings: 0,
    repeatedPromptSkeletons: 0,
    uniquePromptSkeletons: 0,
    skeletonCounts: {},
    lastContextType: 'code',
    contextReadiness: null,
  });

  assert.match(output, /Compression savings \(selection runs\): 0 \(0% smaller\)/);
  assert.match(output, /Prompt-shaping delta \(prompt runs\): 0 saved/);
  assert.doesNotMatch(output, /NaN/);
});

test('renderContextReadinessReport includes workspace scores and actions', () => {
  const output = renderContextReadinessReport({
    generatedAt: '2026-06-09T12:00:00.000Z',
    coaching: {
      totalWarnings: 9,
      volatileContextWarnings: 2,
      lowReuseWarnings: 3,
      instructionSelectionWarnings: 1,
      mcpToolBloatWarnings: 2,
      mcpDeferredLoadingWarnings: 1,
      repeatedPromptSkeletons: 4,
      uniquePromptSkeletons: 6,
      topRecurringSkeletons: [
        { id: 'fix-auth-spec', count: 4 },
        { id: 'review-diff-risk', count: 3 },
      ],
    },
    workspaces: [
      {
        name: 'Token Kit',
        path: '/repo',
        score: 75,
        maxScore: 100,
        verdict: 'Needs attention',
        signals: [
          {
            label: 'Repository instructions',
            status: 'pass',
            detail: 'Found .github/copilot-instructions.md.',
          },
          {
            label: 'MCP configuration',
            status: 'warn',
            detail: 'Found 2 MCP server(s); allowlists on 1/2, deferred loading on 0/2.',
            why: 'Declares which MCP servers and tools agents may use.',
            action: 'Add allowed_tools and defer_loading for each active MCP server to keep tool exposure and schema overhead small.',
          },
        ],
        recommendations: [
          'MCP configuration: Add allowed_tools and defer_loading for each active MCP server to keep tool exposure and schema overhead small.',
        ],
      },
    ],
  });

  assert.match(output, /# Certance Token Kit — Context Readiness/);
  assert.match(output, /Overall verdict: Needs attention/);
  assert.match(output, /## Coaching Snapshot/);
  assert.match(output, /Repeated prompt skeletons: 4/);
  assert.match(output, /### Top Recurring Skeletons/);
  assert.match(output, /fix-auth-spec: 4 runs/);
  assert.match(output, /## Token Kit/);
  assert.match(output, /Score: 75\/100/);
  assert.match(output, /MCP configuration: WARN/);
  assert.match(output, /What it is: Declares which MCP servers and tools agents may use\./);
  assert.match(output, /Fix: Add allowed_tools and defer_loading/);
  // Signals list stays a clean scoreboard — the explanation lives only in the
  // Recommended Actions block, not doubled onto every signal line.
  assert.equal((output.match(/What it is:/g) || []).length, 1);
});