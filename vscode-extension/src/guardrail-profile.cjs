// CE: Apply Guardrail Profile — the deployable token-savings + safety controls.
//
// Non-destructive by design: each asset is written ONLY if absent, never
// overwriting a user's edits. Content exclusion is emitted as a reference plus a
// manual checklist (Copilot doesn't read repo files for it). MCP is REPORT-ONLY
// — connections are audited and advised on, never changed.

// The output-discipline instruction (applyTo: '**') — the main output-token lever.
const LEAN_OUTPUT = `---
applyTo: '**'
---

# Lean output

Output tokens cost roughly 5x input tokens, so verbose answers and over-built
code are where most credit is wasted. These rules keep responses tight and
implementations minimal — without dropping anything that matters.

## Answer shape

- Lead with the answer or result. No preamble, no restating the question, no
  "Sure!", "Certainly", or "Great question".
- No closing recap or summary unless asked.
- Code-first for code requests; add prose only where it carries information the
  code doesn't.
- One example is enough. Don't enumerate alternatives unless asked to compare.
- Don't narrate the work ("I'm checking...", "Let me trace...") — give the result.

## Implementation discipline — don't over-build

Before writing code, walk this ladder and stop at the first rung that applies:

1. **Does this need to exist at all?** Prefer not adding code (YAGNI).
2. **Already in the codebase?** Reuse it.
3. **In the standard library or a native platform feature?** Use that.
4. **In an already-installed dependency?** Use it — don't add a new one.
5. **A one-liner?** Write the one-liner.
6. **Otherwise:** write the minimum that satisfies the requirement.

## Never trade these away

Brevity and minimalism never justify dropping **input validation, error
handling, security checks, accessibility, or existing tests**.

## When to expand

Write normally — full prose, alternatives, caveats — for security or
destructive actions, architecture decisions, ambiguous requirements, or when
the user explicitly asks for depth or options.
`;

// A repo-agnostic direct-answer instruction (written only if the repo has none).
const COPILOT_INSTRUCTIONS = `# Copilot instructions

Answer directly: lead with the conclusion, skip filler ("Sure!", "Certainly"),
keep wording tight. Don't narrate the work ("I'm checking...", "Let me trace...").

Preserve the main idea, key reason, next action, and any safety/constraint
detail. Keep file paths, commands, errors, and code exact.

Expand to full prose for security warnings, destructive actions, multi-step
procedures, or when asked for depth.
`;

// Content exclusion is a GitHub *setting*, not a repo file — this is a reference.
const CONTENT_EXCLUSION = `# GitHub Copilot Content Exclusion — REFERENCE ONLY
#
# Copilot does NOT read this file. Apply these patterns in:
#   GitHub -> repo/org Settings -> Copilot -> Content exclusion  (or the REST API)
#
# IMPORTANT LIMITATION (state this in any audit):
#   Content exclusion does NOT cover agent mode, edit mode, or the Copilot CLI.
#   It applies to inline completions, Copilot Chat responses, and code review.
#   Business/Enterprise only; does not apply to symlinks or remote filesystems.

"*":
  - "**/.env"
  - "**/.env.*"
  - "**/*.pem"
  - "**/*.key"
  - "**/*.p12"
  - "**/id_rsa*"
  - "**/secrets.*"
  - "**/credentials*"
  - "**/*.tfstate"
  - "**/*.tfstate.backup"
`;

// Assets the deploy WRITES (additively, if absent). MCP is handled separately
// (report-only), and .copilotignore is intentionally NOT shipped — it is a
// community convention that GitHub Copilot does not honour.
const GUARDRAIL_ASSETS = [
  { key: 'lean-output', path: '.github/instructions/lean-output.instructions.md', content: LEAN_OUTPUT },
  { key: 'copilot-instructions', path: '.github/copilot-instructions.md', content: COPILOT_INSTRUCTIONS },
  { key: 'content-exclusion', path: '.github/copilot-content-exclusion.yml', content: CONTENT_EXCLUSION },
];

// Split the assets into write vs skip based on what already exists.
function buildGuardrailPlan(presentPaths) {
  const present = new Set(Array.isArray(presentPaths) ? presentPaths : []);
  const toWrite = [];
  const skipped = [];
  for (const asset of GUARDRAIL_ASSETS) {
    if (present.has(asset.path)) {
      skipped.push(asset.path);
    } else {
      toWrite.push({ path: asset.path, content: asset.content });
    }
  }
  return { toWrite, skipped };
}

// Advisory MCP report — visibility + recommendations, never a config change.
function buildMcpReport(mcp) {
  if (!mcp || !mcp.serverCount) {
    return 'No MCP config (`.vscode/mcp.json`) found — nothing to review.';
  }
  const lines = [
    `- Servers configured: **${mcp.serverCount}**`,
    `- With an allowlist (\`allowed_tools\`): ${mcp.allowlistServerCount}`,
    `- With deferred loading (\`defer_loading\`): ${mcp.deferredServerCount}`,
  ];
  const recs = [];
  if (mcp.allowlistServerCount < mcp.serverCount) {
    recs.push('Set `allowed_tools` on servers that lack one — every exposed tool\'s schema sits in context each turn (input-token cost).');
  }
  if (mcp.deferredServerCount < mcp.serverCount) {
    recs.push('Enable `defer_loading` for low-frequency servers so large tool catalogs load only when used.');
  }
  lines.push('', recs.length
    ? '**Recommended (your connections are never changed):**'
    : 'No tool-bloat issues detected.');
  for (const rec of recs) {
    lines.push(`- ${rec}`);
  }
  return lines.join('\n');
}

function renderGuardrailReport({ written, skipped, mcpReport }) {
  const lines = ['# CE: Guardrail Profile applied', ''];
  if (written.length) {
    lines.push('## Added (token-savings + direct-answer controls)', ...written.map(p => `- \`${p}\``), '');
  }
  if (skipped.length) {
    lines.push('## Already present — left untouched', ...skipped.map(p => `- \`${p}\``), '');
  }
  lines.push(
    '## Manual step — content exclusion',
    'The `copilot-content-exclusion.yml` is a **reference** — Copilot does not read it. Apply its patterns in **GitHub → Settings → Copilot → Content exclusion** (or the REST API).',
    '⚠️ Content exclusion does **not** cover agent mode, edit mode, or the Copilot CLI — pair it with secret scanning.',
    '',
    '## MCP report (advisory — connections unchanged)',
    mcpReport,
    '',
  );
  return lines.join('\n');
}

module.exports = {
  GUARDRAIL_ASSETS,
  buildGuardrailPlan,
  buildMcpReport,
  renderGuardrailReport,
};
