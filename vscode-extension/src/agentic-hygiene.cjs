// Deterministic, project-agnostic checks for an ambiguous agentic setup.
// Pure (no vscode, no model, no network): the readiness probe reads the files
// and hands their text here; these functions only inspect strings. Used to
// graduate the "Agent policy" and "Repository instructions" readiness signals
// from mere presence to quality, the same way MCP config is scored.

// A copilot-instructions.md / AGENTS.md above this many lines loads a large,
// example-and-rationale-heavy block into every request. Kept generous so only
// genuinely bloated files are flagged.
const INSTRUCTION_BLOAT_LINES = 200;

// Broad, unanchored directives that pull the whole repo into context instead of
// naming specific files. Generic across Copilot, Claude, Cursor, etc.
const BROAD_SCOPE_PATTERNS = [
  /@workspace/i,
  /\b(whole|entire)\s+(project|code\s?base|repo(?:sitory)?)\b/i,
  /\bread all (?:the )?files\b/i,
  /\bfix everything\b/i,
  /\bgenerate (?:all|everything)\b/i,
  /\blook through the (?:whole |entire )?(?:project|repo(?:sitory)?)\b/i,
  /\bscan the (?:whole |entire )?repo(?:sitory)?\b/i,
];

function extractFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? '');
  return match ? match[1] : '';
}

// agentFiles: [{ name, text }]. An agent with no `tools:` allowlist has an
// unbounded tool surface; one with no `description` gives the model no
// when-to-use trigger. Both are ambiguous-setup smells.
function summarizeAgentDefinitions(agentFiles) {
  const files = Array.isArray(agentFiles) ? agentFiles : [];
  let unscoped = 0;
  let undescribed = 0;
  for (const file of files) {
    const front = extractFrontmatter(file && file.text);
    if (!/^\s*tools\s*:/m.test(front)) {
      unscoped += 1;
    }
    if (!/^\s*description\s*:/m.test(front)) {
      undescribed += 1;
    }
  }
  return { total: files.length, unscoped, undescribed };
}

function summarizeInstructionHygiene(text) {
  const str = typeof text === 'string' ? text : '';
  const lineCount = str.length === 0 ? 0 : str.split(/\r?\n/).length;
  const examples = [];
  for (const pattern of BROAD_SCOPE_PATTERNS) {
    const hit = pattern.exec(str);
    if (hit) {
      examples.push(hit[0]);
    }
  }
  return {
    lineCount,
    bloated: lineCount > INSTRUCTION_BLOAT_LINES,
    broadScopeHits: examples.length,
    broadScopeExamples: examples.slice(0, 3),
  };
}

module.exports = {
  INSTRUCTION_BLOAT_LINES,
  BROAD_SCOPE_PATTERNS,
  summarizeAgentDefinitions,
  summarizeInstructionHygiene,
};
