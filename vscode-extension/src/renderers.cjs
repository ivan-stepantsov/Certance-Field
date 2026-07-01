function formatDelta(beforeTokens, afterTokens) {
  const delta = beforeTokens - afterTokens;
  if (delta > 0) {
    return `saved ~${delta.toLocaleString()} tokens`;
  }
  if (delta < 0) {
    return `added ~${Math.abs(delta).toLocaleString()} tokens`;
  }
  return 'no token change';
}

// Turns the readiness gap list into an actionable block: what is wrong, how many
// points closing each gap would add (already ranked by impact), and the fix.
// `gaps` is undefined for a persisted summary (older stored stats) — render
// nothing extra then; an empty array means a live check found everything passing.
function renderReadinessGapLines(gaps) {
  if (!Array.isArray(gaps)) {
    return [];
  }
  if (gaps.length === 0) {
    return ['', 'All readiness signals pass — nothing to improve.'];
  }
  const available = gaps.reduce((sum, gap) => sum + gap.toClose, 0);
  const lines = ['', `### Close these gaps to raise the score (+${available} available)`, ''];
  for (const gap of gaps) {
    if (gap.why) {
      lines.push(
        `- ${gap.label} — ${gap.status.toUpperCase()} ${gap.earned}/${gap.weight} (+${gap.toClose})`,
        `\tWhat it is: ${gap.why}`,
        `  Fix: ${gap.action}`
      );
    } else {
      lines.push(`- ${gap.label} — ${gap.status.toUpperCase()} ${gap.earned}/${gap.weight} (+${gap.toClose}): ${gap.action}`);
    }
  }
  lines.push('', 'Run "CE: Check Context Readiness" for the full per-signal breakdown.');
  return lines;
}

function renderStats(stats) {
  const netSaved = stats.totalBeforeTokens - stats.totalAfterTokens;
  const savedPct = stats.totalBeforeTokens > 0 ? Math.round((Math.abs(netSaved) / stats.totalBeforeTokens) * 100) : 0;
  const savedLine = netSaved >= 0
    ? `- Estimated tokens saved: ${netSaved.toLocaleString()} (${savedPct}% smaller)`
    : `- Estimated tokens added: ${Math.abs(netSaved).toLocaleString()} (${savedPct}% larger)`;
  // Split the aggregate so the headline isn't diluted: compression runs (the
  // real savings) vs prompt-shaping runs (which often add scaffolding tokens).
  const selBefore = stats.selectionBeforeTokens ?? 0;
  const compSaved = selBefore - (stats.selectionAfterTokens ?? 0);
  const compPct = selBefore > 0 ? Math.round((compSaved / selBefore) * 100) : 0;
  const promDelta = (stats.promptBeforeTokens ?? 0) - (stats.promptAfterTokens ?? 0);
  const promLine = promDelta >= 0
    ? `- Prompt-shaping delta (prompt runs): ${promDelta.toLocaleString()} saved`
    : `- Prompt-shaping delta (prompt runs): ${Math.abs(promDelta).toLocaleString()} added`;
  const reviewPreflightShare = stats.selectionRuns > 0
    ? Math.round((stats.commandRuns.reviewDiff / stats.selectionRuns) * 100)
    : 0;
  const topRecurringSkeletons = Object.entries(stats.skeletonCounts ?? {})
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
  const readinessLines = stats.contextReadiness
    ? [
      '',
      '## Context Readiness',
      '',
      `- Last verdict: ${stats.contextReadiness.verdict}`,
      `- Last score: ${stats.contextReadiness.score}/${stats.contextReadiness.maxScore}`,
      `- Workspaces checked: ${stats.contextReadiness.workspaceCount}`,
      `- Last generated: ${stats.contextReadiness.generatedAt}`,
      ...renderReadinessGapLines(stats.contextReadiness.gaps),
    ]
    : [];
  const recurringSkeletonLines = topRecurringSkeletons.length > 0
    ? [
      '',
      '## Top Recurring Skeletons',
      '',
      ...topRecurringSkeletons.map(([id, count]) => `- ${id}: ${count} runs`),
      '',
      '→ Promote these recurring prompts to `.github/copilot-instructions.md` (or a path-specific `.instructions.md`) so Copilot applies them automatically and you stop re-paying for the scaffolding.',
    ]
    : [];
  return [
    '# Certance Token Kit — Stats',
    '',
    `- Prompt runs: ${stats.promptRuns}`,
    `- Selection runs: ${stats.selectionRuns}`,
    `- Optimize Prompt runs: ${stats.commandRuns.optimizePrompt}`,
    `- Review Diff runs: ${stats.commandRuns.reviewDiff}`,
    `- Debug Stack Trace runs: ${stats.commandRuns.debugStackTrace}`,
    `- Explain Selection runs: ${stats.commandRuns.explainSelection}`,
    `- @cetoken Optimize runs: ${stats.commandRuns.chatOptimize ?? 0}`,
    `- @cetoken /compress runs: ${stats.commandRuns.chatCompress ?? 0}`,
    `- @cetoken /outline runs: ${stats.commandRuns.chatOutline ?? 0}`,
    `- @cetoken /review runs: ${stats.commandRuns.chatReview ?? 0}`,
    `- @cetoken /debug runs: ${stats.commandRuns.chatDebug ?? 0}`,
    `- @cetoken /explain runs: ${stats.commandRuns.chatExplain ?? 0}`,
    `- @cetoken-concise runs: ${stats.commandRuns.chatConcise ?? 0}`,
    `- #ceCompress agent-tool runs: ${stats.commandRuns.agentCompress ?? 0}`,
    `- Estimated before tokens: ${stats.totalBeforeTokens.toLocaleString()}`,
    `- Estimated after tokens: ${stats.totalAfterTokens.toLocaleString()}`,
    savedLine,
    `- Compression savings (selection runs): ${compSaved.toLocaleString()} (${compPct}% smaller)`,
    promLine,
    `- Review-preflight share: ${reviewPreflightShare}% of selection runs`,
    `- Warning count: ${stats.totalWarnings}`,
    `- Volatile-context warnings: ${stats.volatileContextWarnings}`,
    `- Low-reuse warnings: ${stats.lowReuseWarnings}`,
    `- Instruction-selection warnings: ${stats.instructionSelectionWarnings}`,
    `- Verbosity-control warnings: ${stats.verbosityControlWarnings}`,
    `- MCP tool-bloat warnings: ${stats.mcpToolBloatWarnings ?? 0}`,
    `- MCP deferred-loading warnings: ${stats.mcpDeferredLoadingWarnings ?? 0}`,
    `- Repeated prompt skeletons: ${stats.repeatedPromptSkeletons}`,
    `- Unique prompt skeletons: ${stats.uniquePromptSkeletons}`,
    `- Last context type: ${stats.lastContextType}`,
    ...readinessLines,
    ...recurringSkeletonLines,
  ].join('\n');
}

function renderContextReadinessReport(report) {
  const overallVerdict = report.workspaces.every(workspace => workspace.verdict === 'Ready')
    ? 'Ready'
    : report.workspaces.some(workspace => workspace.verdict === 'Incomplete')
      ? 'Incomplete'
      : 'Needs attention';

  const lines = [
    '# Certance Token Kit — Context Readiness',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Workspaces: ${report.workspaces.length}`,
    `- Overall verdict: ${overallVerdict}`,
    '',
    'This prototype checks repository context surfaces that materially affect Copilot and agent quality. It does not inspect session logs or score historical anti-patterns.',
  ];

  if (report.coaching) {
    lines.push(
      '',
      '## Coaching Snapshot',
      '',
      `- Total warnings: ${report.coaching.totalWarnings}`,
      `- Volatile-context warnings: ${report.coaching.volatileContextWarnings}`,
      `- Low-reuse warnings: ${report.coaching.lowReuseWarnings}`,
      `- Instruction-selection warnings: ${report.coaching.instructionSelectionWarnings}`,
      `- MCP tool-bloat warnings: ${report.coaching.mcpToolBloatWarnings}`,
      `- MCP deferred-loading warnings: ${report.coaching.mcpDeferredLoadingWarnings}`,
      `- Repeated prompt skeletons: ${report.coaching.repeatedPromptSkeletons}`,
      `- Unique prompt skeletons: ${report.coaching.uniquePromptSkeletons}`,
      '',
      'Use this as a lightweight behavior signal: repeated warnings and prompt skeletons suggest candidates for better instructions, MCP cleanup, or reusable prompt patterns.'
    );

    lines.push('', '### Top Recurring Skeletons', '');

    if (Array.isArray(report.coaching.topRecurringSkeletons) && report.coaching.topRecurringSkeletons.length > 0) {
      for (const skeleton of report.coaching.topRecurringSkeletons) {
        lines.push(`- ${skeleton.id}: ${skeleton.count} runs`);
      }
    } else {
      lines.push('- None.');
    }
  }

  for (const workspace of report.workspaces) {
    lines.push(
      '',
      `## ${workspace.name}`,
      '',
      `- Path: ${workspace.path}`,
      `- Score: ${workspace.score}/${workspace.maxScore}`,
      `- Verdict: ${workspace.verdict}`,
      '',
      '### Signals',
      ''
    );

    for (const signal of workspace.signals) {
      const hasPoints = typeof signal.earned === 'number' && typeof signal.weight === 'number';
      const points = hasPoints ? ` ${signal.earned}/${signal.weight}` : '';
      const toClose = hasPoints && signal.status !== 'pass'
        ? ` (+${signal.weight - signal.earned} to close)`
        : '';
      lines.push(`- ${signal.label}: ${signal.status.toUpperCase()}${points}${toClose} — ${signal.detail}`);
    }

    // Gap-only remediation: each non-passing signal gets its "what it is" and the
    // fix together, so the Signals list above stays a scannable scoreboard.
    const gapSignals = workspace.signals.filter(signal => signal.status !== 'pass');
    lines.push('', '### Recommended Actions', '');

    if (gapSignals.length === 0) {
      lines.push('- None. All signals pass.');
    } else {
      for (const signal of gapSignals) {
        const hasPoints = typeof signal.earned === 'number' && typeof signal.weight === 'number';
        const plus = hasPoints ? ` (+${signal.weight - signal.earned})` : '';
        lines.push(`- ${signal.label}${plus}`);
        if (signal.why) {
          lines.push(`\tWhat it is: ${signal.why}`);
        }
        lines.push(`\tFix: ${signal.action}`, '');
      }
    }
  }

  return lines.join('\n');
}

function renderWarningActions(warnings) {
  const actions = [];
  if (warnings.some(warning => /MCP\/tool-bloat risk detected/i.test(warning))) {
    actions.push('- MCP/tool bloat: scope the task to required tools only and set an allowlist (for example `allowed_tools`).');
  }
  if (warnings.some(warning => /Large MCP tool catalog detected without deferred loading/i.test(warning))) {
    actions.push('- MCP deferred loading: enable `defer_loading` for low-frequency tools so large catalogs are loaded only when needed.');
  }
  if (warnings.some(warning => /Instruction-like selection detected/i.test(warning))) {
    actions.push('- Instruction-like selection: compress the file with `--mode instructions` or split repo-wide rules from path-specific guidance.');
  }
  if (warnings.some(warning => /Repeated verbosity controls detected/i.test(warning))) {
    actions.push('- Repeated verbosity controls: move stable direct-answer defaults into repo instructions and keep per-prompt shaping for exceptions.');
  }
  if (warnings.some(warning => /High-cost review request detected/i.test(warning))) {
    actions.push('- High-cost review request: run local diff review first and send only risky hunks to Copilot review.');
  }
  if (warnings.some(warning => /Volatile context detected/i.test(warning))) {
    actions.push('- Volatile context: move run-specific details after stable instructions or trim them before sending.');
  }
  if (warnings.some(warning => /Unstable prompt prefix detected/i.test(warning))) {
    actions.push('- Unstable prefix: keep stable instructions first, then append timestamps, IDs, and stack traces at the end.');
  }
  if (warnings.some(warning => /Low prompt reuse score detected/i.test(warning))) {
    actions.push('- Reuse structure: use a stable template (goal, file, constraints) and place volatile runtime data in a final error/details block.');
  }
  return actions;
}

// Turns the raw cacheability numbers into caching guidance so the "cache-first"
// value lives inside the normal Optimize Prompt (no separate command). A high
// score confirms the prefix is reusable; a low one says exactly what to move.
function renderCacheabilityLines(cacheability) {
  if (!cacheability) {
    return [];
  }
  const { score, stablePrefixRatio, volatilityDensity } = cacheability;
  const prefixPct = Math.round(stablePrefixRatio * 100);
  const lines = ['', '## Cacheability', '', `- Reuse score: ${score}/100 (stable prefix ${prefixPct}%).`];
  if (volatilityDensity > 0 || stablePrefixRatio < 1) {
    lines.push('- To raise it: keep the stable task instructions first and move run-specific noise (IDs, timestamps, error dumps) to the END. An identical prefix across runs lets the model reuse its cached context, so you only pay for the changing tail.');
  } else {
    lines.push('- Stable prefix, no run-specific noise: repeated runs of this prompt can reuse the cached prefix.');
  }
  return lines;
}

function renderPromptResult(result) {
  const warningActions = renderWarningActions(result.warnings);
  return [
    '# Optimized Prompt',
    '',
    result.optimizedPrompt,
    '',
    '## Stats',
    '',
    `- Before: ~${result.beforeTokens.toLocaleString()} tokens`,
    `- After: ~${result.afterTokens.toLocaleString()} tokens`,
    `- Delta: ${formatDelta(result.beforeTokens, result.afterTokens)}`,
    `- Context type: ${result.contextType}`,
    ...renderCacheabilityLines(result.cacheability),
    '',
    '## Warnings',
    '',
    ...(result.warnings.length > 0 ? result.warnings.map(warning => `- ${warning}`) : ['- None']),
    '',
    '## Suggested Actions',
    '',
    ...(warningActions.length > 0 ? warningActions : ['- None']),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Selection follow-up prompt + clipboard bundle
//
// Review Diff / Debug Stack Trace / Explain Selection each compress the
// selection LOCALLY and hand the user a follow-up prompt to run against Copilot.
// The prompt text lives here in ONE place so the result document and the
// clipboard can never drift. The clipboard carries the prompt AND the compressed
// content bundled together, so a single paste into Copilot Chat is ready to send
// — "this diff" then refers to the diff pasted right below it, not the
// uncompressed source file.
// ---------------------------------------------------------------------------

function selectionFollowUpPrompt(commandKey, result) {
  if (commandKey === 'reviewDiff') {
    return 'Review this diff. Focus on regressions, changed behavior, and the smallest safe fix if an issue is found.';
  }
  if (commandKey === 'debugStackTrace') {
    return 'Debug this stack trace. Explain the likely root cause first, then propose the smallest plausible fix.';
  }
  // explainSelection
  return result && result.outlined
    ? 'Explain what this code does: its responsibilities, the main pieces, and how they fit together. Be concise.'
    : `Explain this ${result ? result.kind : 'selection'} briefly and concretely. Focus on the most decision-relevant details first.`;
}

// Best-effort fence language for the compressed content — helps Copilot parse
// the pasted block. Empty string = a plain fence (safe default for code/traces).
function fenceLangForSelection(commandKey, result) {
  if (commandKey === 'reviewDiff') { return 'diff'; }
  const kind = result && result.kind;
  if (kind === 'diff') { return 'diff'; }
  if (kind === 'json') { return 'json'; }
  return '';
}

// Wrap content in a fence long enough to survive any backtick run inside it
// (CommonMark rule) — so explaining a markdown file that itself contains a ```
// block can never break the bundle.
function fenceBlock(content, lang = '') {
  const text = String(content ?? '');
  const runs = text.match(/`+/g);
  let longestRun = 0;
  if (runs) {
    for (const run of runs) {
      longestRun = Math.max(longestRun, run.length);
    }
  }
  const ticks = '`'.repeat(Math.max(3, longestRun + 1));
  return `${ticks}${lang}\n${text}\n${ticks}`;
}

// The ready-to-send message placed on the clipboard: the follow-up prompt, then
// the compressed content fenced right below it. One paste into Copilot Chat.
function buildSelectionClipboard(commandKey, result) {
  const prompt = selectionFollowUpPrompt(commandKey, result);
  const body = fenceBlock(result ? result.output : '', fenceLangForSelection(commandKey, result));
  return `${prompt}\n\n${body}`;
}

// Lead-in shown above the follow-up prompt in the result document, telling the
// user the clipboard already holds a ready-to-paste bundle.
function clipboardLeadIn(contentNoun) {
  return `_This prompt and ${contentNoun} are already bundled on your clipboard — paste into Copilot Chat and send._`;
}

function renderDiffResult(result, file) {
  const warningActions = renderWarningActions(result.warnings);
  return [
    '# Review Diff',
    '',
    ...(file ? [`- File: ${file}`] : []),
    `- Estimated delta: ${formatDelta(result.beforeTokens, result.afterTokens)}`,
    '- Cost note: Use this as a local preflight before Copilot code review to reduce premium request and Actions-minute spend.',
    '',
    '## Optimized Diff Summary',
    '',
    result.output,
    '',
    '## Suggested Follow-up Prompt',
    '',
    clipboardLeadIn('the compressed diff'),
    '',
    selectionFollowUpPrompt('reviewDiff', result),
    '',
    '## Warnings',
    '',
    ...(result.warnings.length > 0 ? result.warnings.map(warning => `- ${warning}`) : ['- None']),
    '',
    '## Suggested Actions',
    '',
    ...(warningActions.length > 0 ? warningActions : ['- None']),
  ].join('\n');
}

function renderStackTraceResult(result, file) {
  const warningActions = renderWarningActions(result.warnings);
  return [
    '# Debug Stack Trace',
    '',
    ...(file ? [`- Source: ${file}`] : []),
    `- Estimated delta: ${formatDelta(result.beforeTokens, result.afterTokens)}`,
    '',
    '## Optimized Error Summary',
    '',
    result.output,
    '',
    '## Suggested Follow-up Prompt',
    '',
    clipboardLeadIn('the compressed stack trace'),
    '',
    selectionFollowUpPrompt('debugStackTrace', result),
    '',
    '## Warnings',
    '',
    ...(result.warnings.length > 0 ? result.warnings.map(warning => `- ${warning}`) : ['- None']),
    '',
    '## Suggested Actions',
    '',
    ...(warningActions.length > 0 ? warningActions : ['- None']),
  ].join('\n');
}

function renderExplainSelectionResult(result, file) {
  const warningActions = renderWarningActions(result.warnings);
  const followUp = selectionFollowUpPrompt('explainSelection', result);

  // Explain keeps comments and only outlines large code, so a small, clean
  // selection often comes through verbatim. Don't dress an unchanged copy as
  // "Optimized" with a "no token change" delta — that misrepresents the command,
  // whose value here is the concise follow-up prompt, not compression. Only claim
  // a delta / "optimized" when tokens actually dropped.
  const compressed = result.afterTokens < result.beforeTokens;
  const selectionHeading = result.outlined
    ? '## Outlined Selection'
    : compressed
      ? '## Optimized Selection'
      : `## Selection to explain${result.kind === 'code' ? ' (comments kept)' : ''}`;

  return [
    '# Explain Selection',
    '',
    ...(file ? [`- Source: ${file}`] : []),
    `- Kind: ${result.kind}`,
    ...(result.outlined ? ['- Mode: outline (signatures kept, bodies dropped)'] : []),
    ...(compressed ? [`- Estimated delta: ${formatDelta(result.beforeTokens, result.afterTokens)}`] : []),
    '',
    '## Suggested Follow-up Prompt',
    '',
    clipboardLeadIn('the selection'),
    '',
    followUp,
    '',
    selectionHeading,
    '',
    result.output,
    '',
    '## Warnings',
    '',
    ...(result.warnings.length > 0 ? result.warnings.map(warning => `- ${warning}`) : ['- None']),
    '',
    '## Suggested Actions',
    '',
    ...(warningActions.length > 0 ? warningActions : ['- None']),
  ].join('\n');
}

function renderSelectionResult(options, result, file) {
  if (options.commandKey === 'reviewDiff') {
    return renderDiffResult(result, file);
  }
  if (options.commandKey === 'debugStackTrace') {
    return renderStackTraceResult(result, file);
  }
  return renderExplainSelectionResult(result, file);
}

module.exports = {
  formatDelta,
  renderContextReadinessReport,
  renderStats,
  renderPromptResult,
  renderDiffResult,
  renderStackTraceResult,
  renderExplainSelectionResult,
  renderSelectionResult,
  selectionFollowUpPrompt,
  buildSelectionClipboard,
};