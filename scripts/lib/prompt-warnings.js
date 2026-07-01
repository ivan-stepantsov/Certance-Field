const BROAD_SCOPE_PATTERNS = [
  /@workspace\b/i,
  /\b(entire|whole)\s+(repo|repository|project|codebase)\b/i,
  /\bsearch\s+the\s+(repo|repository|project|codebase)\b/i,
  /\blook\s+through\s+the\s+(repo|repository|project|codebase)\b/i,
];

const VAGUE_REFERENT_RE = /\b(it|this|that|the\s+function|the\s+method|the\s+class|the\s+component|the\s+test)\b/i;
const COMPOUND_TASK_RE = /\b(and\s+also|and\s+then|while\s+also|as\s+well\s+as|in\s+addition\s+to|plus\s+also)\b/i;
const HIGH_COST_REVIEW_RE = /\b(code\s+review|review\s+the\s+pull\s+request|review\s+my\s+pr)\b/i;
const PREFERENCE_STYLE_RE = /\b(i\s+prefer|my\s+preference|always\s+respond\s+with|my\s+default\s+style|for\s+me\s+always)\b/i;
const VERBOSITY_REQUEST_RE = /\b(?:be\s+concise|answer\s+concisely|keep\s+it\s+brief|briefly|short\s+answer|3\s+bullets|bullet\s+points|code\s+only|no\s+explanation|without\s+explanation|minimal\s+change)\b/gi;
const INSTRUCTION_FILE_RE = /(?:\.github\/copilot-instructions\.md|\.github\/instructions\/|AGENTS\.md|SKILL\.md|\.instructions\.md|README\.md)/i;
const INSTRUCTION_SELECTION_RE = /(^|\n)#{1,6}\s+|(^|\n)\s*[-*]\s+|(^|\n)\s*\d+\.\s+|(^|\n)---\n|\.github\/copilot-instructions\.md|AGENTS\.md|SKILL\.md/i;
const MCP_CONTEXT_RE = /\b(mcp|model\s+context\s+protocol|playwright\s+mcp|toolset|tool\s+catalog|tool\s+schema|server\s+tools?)\b/i;
const MCP_BROAD_TOOL_INTENT_RE = /\b(all|every|entire|full|complete)\s+(mcp\s+)?(tools?|toolset|tool\s+catalog)\b/i;
const MCP_ALLOWLIST_SIGNAL_RE = /\b(allowed_tools|allowlist|tool\s+allowlist|tool_names|only\s+use\s+these\s+tools?)\b/i;
const MCP_DEFER_SIGNAL_RE = /\b(defer_loading|deferred\s+loading|lazy\s+load(?:ing)?\s+tools?)\b/i;
const VOLATILE_SEGMENT_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,                                  // plain date (2026-07-06)
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,                           // clock time (14:32, 09:15:30)
  /\b(?:today|yesterday|tomorrow|tonight)\b/gi,              // relative dates
  /\b(?:case|run|attempt|build|job|iteration|ticket|try)\s+#?\d+\b/gi, // run identifiers (case 7)
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  /\b[a-f0-9]{16,40}\b/gi,
  /\b\d{10,}\b/g,
  /^\s*at\s+.+:\d+:\d+\)?$/gm,
  /\/(tmp|var\/folders)\/[\w./-]+/gi,
];

function updateEarliest(current, idx) {
  if (idx === -1) return current;
  if (current === -1 || idx < current) return idx;
  return current;
}

function findVolatileSegments(text) {
  let earliestIndex = -1;
  let totalChars = 0;
  for (const pattern of VOLATILE_SEGMENT_PATTERNS) {
    for (const match of [...text.matchAll(pattern)]) {
      const idx = typeof match.index === 'number' ? match.index : -1;
      earliestIndex = updateEarliest(earliestIndex, idx);
      totalChars += match[0].length;
    }
  }
  return { earliestIndex, totalChars };
}

function computeCacheScore(stablePrefixRatio, volatilityDensity, length) {
  let score = 100;
  if (stablePrefixRatio < 0.35) score -= 35;
  else if (stablePrefixRatio < 0.6) score -= 15;
  if (volatilityDensity > 0.2) score -= 25;
  else if (volatilityDensity > 0.1) score -= 12;
  if (length > 300 && stablePrefixRatio < 0.5) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function assessCacheStructure(prompt) {
  const text = String(prompt ?? '');
  const length = text.length;
  if (length === 0) {
    return { score: 100, stablePrefixRatio: 1, volatilityDensity: 0, earliestVolatileIndex: -1 };
  }
  const { earliestIndex, totalChars } = findVolatileSegments(text);
  const stablePrefixRatio = earliestIndex === -1 ? 1 : earliestIndex / length;
  const volatilityDensity = Math.min(1, totalChars / length);
  return {
    score: computeCacheScore(stablePrefixRatio, volatilityDensity, length),
    stablePrefixRatio: Math.max(0, Math.min(1, Number(stablePrefixRatio.toFixed(2)))),
    volatilityDensity: Math.max(0, Math.min(1, Number(volatilityDensity.toFixed(2)))),
    earliestVolatileIndex: earliestIndex,
  };
}

function addScopeWarnings(warnings, prompt, metadata) {
  if (BROAD_SCOPE_PATTERNS.some(p => p.test(prompt)) && !metadata.file) {
    warnings.push('Broad workspace scope detected. Add a target file or narrowed search result before sending to Copilot.');
  }
  if (prompt.length > 500 && !metadata.selection) {
    warnings.push('Long prompt detected. Consider pasting compressed code, logs, or a focused snippet instead of a long narrative.');
  }
}

function isDiffWithoutDiffPrompt(metadata, prompt) {
  return metadata.selectionKind === 'diff' && !/\b(diff|change|regression|patch)\b/i.test(prompt);
}

function isInstructionLikeSelection(metadata) {
  return (
    !!metadata.selectionText &&
    metadata.selectionText.length > 1200 &&
    (INSTRUCTION_SELECTION_RE.test(metadata.selectionText) || INSTRUCTION_FILE_RE.test(metadata.file || ''))
  );
}

function addSelectionWarnings(warnings, prompt, metadata) {
  if (isDiffWithoutDiffPrompt(metadata, prompt)) {
    warnings.push('Diff-like editor selection detected. Ask about changed behavior, regressions, or risk to keep the review focused.');
  }
  if (metadata.selectionKind === 'stack-trace' && !metadata.error) {
    warnings.push('Stack trace detected. Include the failing assertion or observed error to improve root-cause quality.');
  }
  if (metadata.selectionText && metadata.selectionText.length > 2000) {
    warnings.push('Large editor selection detected. Compress or summarize the selected content before sending it to Copilot.');
  }
  if (isInstructionLikeSelection(metadata)) {
    warnings.push('Instruction-like selection detected. Compress the prose with instructions mode or split repo-wide rules from path-specific guidance before sending it to Copilot.');
  }
}

function addReferentWarning(warnings, prompt, metadata) {
  if (VAGUE_REFERENT_RE.test(prompt) && !metadata.file && !metadata.selection) {
    warnings.push('Vague reference detected. Add --file or select a symbol to give Copilot a concrete target.');
  }
}

function addCompoundWarning(warnings, prompt) {
  if (COMPOUND_TASK_RE.test(prompt)) {
    warnings.push('Multiple tasks detected. Send one task at a time for higher quality output.');
  }
}

function addReviewPathWarning(warnings, prompt, metadata) {
  if (HIGH_COST_REVIEW_RE.test(prompt) && metadata.selectionKind !== 'diff' && !metadata.selection) {
    warnings.push('High-cost review request detected. Run local diff review first, then send only risky hunks to Copilot review.');
  }
}

function addPreferenceWarning(warnings, prompt, metadata) {
  if (PREFERENCE_STYLE_RE.test(prompt) && !metadata.file && !metadata.selection) {
    warnings.push('Recurring preference-style instruction detected. If policy allows Copilot Memory, store personal defaults there instead of repeating them in each prompt.');
  }
}

function addVerbosityWarning(warnings, prompt, metadata) {
  const matches = prompt.match(VERBOSITY_REQUEST_RE) || [];
  if (matches.length >= 2 && !metadata.selection) {
    warnings.push('Repeated verbosity controls detected. Move stable direct-answer defaults into repo instructions and keep per-prompt output shaping for exceptions only.');
  }
}

function addReuseWarnings(warnings, cacheStructure) {
  if (cacheStructure.volatilityDensity >= 0.12) {
    warnings.push('Volatile context detected (timestamps/IDs/stack traces). Move volatile details after stable instructions or trim them before sending to Copilot.');
  }
  if (cacheStructure.earliestVolatileIndex !== -1 && cacheStructure.stablePrefixRatio < 0.35) {
    warnings.push('Unstable prompt prefix detected. Keep stable task instructions at the top and move run-specific IDs, timestamps, and traces after the stable prefix.');
  }
  if (cacheStructure.score < 50) {
    warnings.push('Low prompt reuse score detected. Optional structure: put stable task instructions first, then file names, errors, IDs, timestamps, and logs. Trim repeated runtime noise before sending.');
  }
}

function countLikelyToolSchemas(text) {
  if (!text) return 0;
  const matches = text.match(/"name"\s*:\s*"[\w.-]+"/g);
  return matches ? matches.length : 0;
}

function addMcpToolWarnings(warnings, prompt, metadata) {
  const combined = `${prompt}\n${metadata.selectionText ?? ''}`;
  const hasMcpContext = MCP_CONTEXT_RE.test(combined);
  if (!hasMcpContext) return;

  const hasBroadIntent = MCP_BROAD_TOOL_INTENT_RE.test(combined);
  const hasAllowlistSignal = MCP_ALLOWLIST_SIGNAL_RE.test(combined);
  const hasDeferredSignal = MCP_DEFER_SIGNAL_RE.test(combined);
  const toolSchemaCount = countLikelyToolSchemas(combined);
  const likelyLargeToolCatalog = toolSchemaCount >= 10 || combined.length > 1800;

  if ((hasBroadIntent || likelyLargeToolCatalog) && !hasAllowlistSignal) {
    warnings.push('MCP/tool-bloat risk detected. Limit tool exposure with an allowlist (for example `allowed_tools`) so only required tools are loaded.');
  }

  if (likelyLargeToolCatalog && !hasDeferredSignal) {
    warnings.push('Large MCP tool catalog detected without deferred loading. Enable deferred loading (for example `defer_loading`) for low-frequency tools to reduce token overhead.');
  }
}

export function buildWarnings(prompt, metadata = {}) {
  const warnings = [];
  const cacheStructure = assessCacheStructure(prompt);
  addScopeWarnings(warnings, prompt, metadata);
  addSelectionWarnings(warnings, prompt, metadata);
  addReferentWarning(warnings, prompt, metadata);
  addCompoundWarning(warnings, prompt);
  addReviewPathWarning(warnings, prompt, metadata);
  addPreferenceWarning(warnings, prompt, metadata);
  addVerbosityWarning(warnings, prompt, metadata);
  addReuseWarnings(warnings, cacheStructure);
  addMcpToolWarnings(warnings, prompt, metadata);
  return warnings;
}