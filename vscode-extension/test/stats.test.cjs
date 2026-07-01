const test = require('node:test');
const assert = require('node:assert/strict');

const { applyRunToStats, emptyStats } = require('../src/stats.cjs');

test('applyRunToStats increments the prompt command, warnings, and skeletons', () => {
  const initial = emptyStats();

  const next = applyRunToStats(initial, {
    commandKey: 'optimizePrompt',
    group: 'prompt',
    promptSkeletonId: 'psk_cache1234',
    result: {
      beforeTokens: 120,
      afterTokens: 80,
      contextType: 'prompt-only',
      warnings: [
        'Low prompt reuse score detected. Optional structure: put stable task instructions first, then file names, errors, IDs, timestamps, and logs. Trim repeated runtime noise before sending.',
        'MCP/tool-bloat risk detected. Limit tool exposure with an allowlist (for example `allowed_tools`) so only required tools are loaded.',
      ],
    },
  });

  assert.equal(next.promptRuns, 1);
  assert.equal(next.selectionRuns, 0);
  assert.equal(next.commandRuns.optimizePrompt, 1);
  assert.equal(next.totalBeforeTokens, 120);
  assert.equal(next.totalAfterTokens, 80);
  assert.equal(next.totalWarnings, 2);
  assert.equal(next.lowReuseWarnings, 1);
  assert.equal(next.mcpToolBloatWarnings, 1);
  assert.equal(next.uniquePromptSkeletons, 1);
  assert.equal(next.repeatedPromptSkeletons, 0);
  assert.equal(next.lastContextType, 'prompt-only');
});

test('applyRunToStats marks repeated prompt skeleton reuse', () => {
  const initial = applyRunToStats(emptyStats(), {
    commandKey: 'optimizePrompt',
    group: 'prompt',
    promptSkeletonId: 'psk_cache1234',
    result: {
      beforeTokens: 100,
      afterTokens: 70,
      contextType: 'prompt-only',
      warnings: [],
    },
  });

  const next = applyRunToStats(initial, {
    commandKey: 'optimizePrompt',
    group: 'prompt',
    promptSkeletonId: 'psk_cache1234',
    result: {
      beforeTokens: 95,
      afterTokens: 65,
      contextType: 'prompt-only',
      warnings: [],
    },
  });

  assert.equal(next.commandRuns.optimizePrompt, 2);
  assert.equal(next.promptRuns, 2);
  assert.equal(next.uniquePromptSkeletons, 1);
  assert.equal(next.repeatedPromptSkeletons, 1);
});