const VOLATILE_WARNING_RE = /Volatile context detected/i;
const LOW_REUSE_WARNING_RE = /Low prompt reuse score detected/i;
const INSTRUCTION_SELECTION_WARNING_RE = /Instruction-like selection detected/i;
const VERBOSITY_CONTROL_WARNING_RE = /Repeated verbosity controls detected/i;
const MCP_TOOL_BLOAT_WARNING_RE = /MCP\/tool-bloat risk detected/i;
const MCP_DEFERRED_LOADING_WARNING_RE = /Large MCP tool catalog detected without deferred loading/i;
const REDACTION_WARNING_RE = /secret patterns were redacted locally \((\d+) match/i;

function emptyStats() {
  return {
    promptRuns: 0,
    selectionRuns: 0,
    commandRuns: {
      optimizePrompt: 0,
      reviewDiff: 0,
      debugStackTrace: 0,
      explainSelection: 0,
      chatOptimize: 0,
      chatCompress: 0,
      chatFocus: 0,
      chatOutline: 0,
      chatReview: 0,
      chatDebug: 0,
      chatExplain: 0,
      chatConcise: 0,
      agentCompress: 0,
    },
    totalBeforeTokens: 0,
    totalAfterTokens: 0,
    // Per-group token subtotals so the report can separate real compression
    // savings (selection runs) from prompt-shaping deltas (prompt runs), which
    // often *add* scaffolding tokens and would otherwise dilute the headline %.
    selectionBeforeTokens: 0,
    selectionAfterTokens: 0,
    promptBeforeTokens: 0,
    promptAfterTokens: 0,
    totalWarnings: 0,
    redactionsTotal: 0,
    // Cost-posture aggregate: how many model recommendations were emitted, and
    // how many flagged the task as answerable locally (an avoided model call).
    modelAdviceRuns: 0,
    localTransformOpportunities: 0,
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
  };
}

function applyRunToStats(currentStats, details) {
  const commandRuns = {
    ...currentStats.commandRuns,
    [details.commandKey]: (currentStats.commandRuns[details.commandKey] ?? 0) + 1,
  };

  const warnings = details.result.warnings ?? [];
  const volatileWarningCount = warnings.filter(w => VOLATILE_WARNING_RE.test(w)).length;
  const lowReuseWarningCount = warnings.filter(w => LOW_REUSE_WARNING_RE.test(w)).length;
  const instructionSelectionWarningCount = warnings.filter(w => INSTRUCTION_SELECTION_WARNING_RE.test(w)).length;
  const verbosityControlWarningCount = warnings.filter(w => VERBOSITY_CONTROL_WARNING_RE.test(w)).length;
  const mcpToolBloatWarningCount = warnings.filter(w => MCP_TOOL_BLOAT_WARNING_RE.test(w)).length;
  const mcpDeferredLoadingWarningCount = warnings.filter(w => MCP_DEFERRED_LOADING_WARNING_RE.test(w)).length;
  const redactionCount = warnings.reduce((sum, w) => {
    const match = typeof w === 'string' ? w.match(REDACTION_WARNING_RE) : null;
    return sum + (match ? Number(match[1]) : 0);
  }, 0);

  let repeatedPromptSkeletons = currentStats.repeatedPromptSkeletons;
  let uniquePromptSkeletons = currentStats.uniquePromptSkeletons;
  let skeletonCounts = currentStats.skeletonCounts ?? {};

  if (details.group === 'prompt' && details.promptSkeletonId) {
    const previousCount = skeletonCounts[details.promptSkeletonId] ?? 0;
    const nextCount = previousCount + 1;
    skeletonCounts = {
      ...skeletonCounts,
      [details.promptSkeletonId]: nextCount,
    };
    if (previousCount > 0) {
      repeatedPromptSkeletons += 1;
    }
    uniquePromptSkeletons = Object.keys(skeletonCounts).length;
  }

  return {
    ...currentStats,
    promptRuns: currentStats.promptRuns + (details.group === 'prompt' ? 1 : 0),
    selectionRuns: currentStats.selectionRuns + (details.group === 'selection' ? 1 : 0),
    commandRuns,
    totalBeforeTokens: currentStats.totalBeforeTokens + details.result.beforeTokens,
    totalAfterTokens: currentStats.totalAfterTokens + details.result.afterTokens,
    selectionBeforeTokens: (currentStats.selectionBeforeTokens ?? 0) + (details.group === 'selection' ? details.result.beforeTokens : 0),
    selectionAfterTokens: (currentStats.selectionAfterTokens ?? 0) + (details.group === 'selection' ? details.result.afterTokens : 0),
    promptBeforeTokens: (currentStats.promptBeforeTokens ?? 0) + (details.group === 'prompt' ? details.result.beforeTokens : 0),
    promptAfterTokens: (currentStats.promptAfterTokens ?? 0) + (details.group === 'prompt' ? details.result.afterTokens : 0),
    totalWarnings: currentStats.totalWarnings + warnings.length,
    redactionsTotal: (currentStats.redactionsTotal ?? 0) + redactionCount,
    volatileContextWarnings: currentStats.volatileContextWarnings + volatileWarningCount,
    lowReuseWarnings: currentStats.lowReuseWarnings + lowReuseWarningCount,
    instructionSelectionWarnings: currentStats.instructionSelectionWarnings + instructionSelectionWarningCount,
    verbosityControlWarnings: currentStats.verbosityControlWarnings + verbosityControlWarningCount,
    mcpToolBloatWarnings: (currentStats.mcpToolBloatWarnings ?? 0) + mcpToolBloatWarningCount,
    mcpDeferredLoadingWarnings: (currentStats.mcpDeferredLoadingWarnings ?? 0) + mcpDeferredLoadingWarningCount,
    repeatedPromptSkeletons,
    uniquePromptSkeletons,
    skeletonCounts,
    lastContextType: details.result.contextType ?? details.result.kind ?? 'unknown',
  };
}

module.exports = {
  emptyStats,
  applyRunToStats,
};