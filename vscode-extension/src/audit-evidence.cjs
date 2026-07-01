// CE: Export Audit Evidence — assembles a per-developer evidence artifact
// (markdown + JSON) from local stats. Turns "trust us" into numbers: token
// savings, estimated cost saved, secret redactions, readiness, MCP, exclusion.
//
// Honest by construction: token figures are heuristic estimates, redaction is
// best-effort, cost is derived from a user-supplied rate, and content exclusion
// carries its agent-mode caveat. Per-developer snapshot — team totals are an
// aggregation of these artifacts.

function num(value) {
  return Number(value || 0).toLocaleString();
}

function computeEvidence({ stats, mcp, exclusionPresent, leanOutputPresent, agentsPolicyPresent, meta, costPerMillionTokensUSD }) {
  const before = stats.totalBeforeTokens || 0;
  const after = stats.totalAfterTokens || 0;
  const saved = before - after;
  const savedPct = before > 0 ? Math.round((saved / before) * 100) : 0;

  const selBefore = stats.selectionBeforeTokens || 0;
  const compressionSaved = selBefore - (stats.selectionAfterTokens || 0);
  const compressionPct = selBefore > 0 ? Math.round((compressionSaved / selBefore) * 100) : 0;

  const rate = Number(costPerMillionTokensUSD) || 0;
  const estimatedCostSavedUSD = rate > 0 ? Number(((saved / 1000000) * rate).toFixed(2)) : null;

  const commandRuns = stats.commandRuns || {};
  const totalRuns = Object.values(commandRuns).reduce((sum, n) => sum + (n || 0), 0);

  return {
    generatedAt: meta.generatedAt,
    extensionVersion: meta.version,
    workspace: meta.workspace,
    tokenSavings: { before, after, saved, savedPct, compressionSaved, compressionPct },
    costRatePerMillionUSD: rate,
    estimatedCostSavedUSD,
    secretRedactions: stats.redactionsTotal ?? 0,
    readiness: stats.contextReadiness || null,
    contentExclusionReferencePresent: !!exclusionPresent,
    leanOutputInstructionPresent: !!leanOutputPresent,
    agentPolicyPresent: !!agentsPolicyPresent,
    modelAdviceRuns: stats.modelAdviceRuns ?? 0,
    localTransformOpportunities: stats.localTransformOpportunities ?? 0,
    mcp: mcp || null,
    totalRuns,
    commandRuns,
    attestation: 'Local-only: no prompt content, code, or secrets are stored — only token/command counts in VS Code globalState. Token figures are heuristic estimates (~chars/4); secret redaction is best-effort regex matching (no AI).',
  };
}

function renderEvidenceMarkdown(e) {
  const lines = [
    '# Certance Token Kit — Audit Evidence',
    '',
    `_Generated ${e.generatedAt} · extension v${e.extensionVersion} · workspace \`${e.workspace}\`_`,
    '',
    `> **Per-developer snapshot.** ${e.attestation}`,
    '',
    '## Token savings (input side)',
    `- Estimated tokens before → after: **${num(e.tokenSavings.before)} → ${num(e.tokenSavings.after)}**`,
    `- Estimated tokens saved: **${num(e.tokenSavings.saved)} (${e.tokenSavings.savedPct}%)**`,
    `- Of which real compression (selection runs): ${num(e.tokenSavings.compressionSaved)} (${e.tokenSavings.compressionPct}%)`,
  ];
  if (e.estimatedCostSavedUSD !== null) {
    lines.push(`- **Estimated cost saved: $${e.estimatedCostSavedUSD.toFixed(2)}** (at $${e.costRatePerMillionUSD}/M tokens — edit \`ceTokenKit.costPerMillionTokensUSD\`)`);
  } else {
    lines.push('- Estimated cost: set `ceTokenKit.costPerMillionTokensUSD` to your plan\'s blended rate to convert tokens → $ saved.');
  }

  if (e.modelAdviceRuns > 0) {
    lines.push(
      '',
      '## Model cost posture',
      `- Model recommendations run this period: **${num(e.modelAdviceRuns)}**`,
      `- Of which flagged as answerable **locally** (avoided model calls): **${num(e.localTransformOpportunities)}**`,
      '- Advisory only — a spend-risk/routing lens (`CE: Recommend a Model for This Task`); the kit never switches your model.',
    );
  }

  lines.push(
    '',
    '## Secret redaction',
    `- High-confidence secret values redacted before display/send: **${num(e.secretRedactions)}**`,
    '- Best-effort regex patterns (incl. org-custom via `ceTokenKit.secretPatterns`); local, no AI.',
    '',
    '## Governance & enforcement boundaries',
    'For a security reviewer: what a **platform control enforces** vs. what relies on repository policy or agent behaviour. Nothing here stores secret values or excluded file content.',
    '',
    '| Control | Type | Coverage / caveat |',
    '|---|---|---|',
    '| GitHub content exclusion | **Platform-enforced** | Chat, completions, code review — **not** Edit mode, Agent mode, or Copilot CLI (documented gap). |',
    '| `AGENTS.md` agent policy | **Behavioural / advisory** | Closes the agent-mode gap by instruction; depends on the agent honouring it. |',
    '| Secret redaction (this kit) | **Locally enforced** | Masks high-confidence patterns before display/send; best-effort regex, no AI. |',
    '| Pre-commit secret scan | **Locally enforced when installed** | Blocks a commit carrying a staged secret; bypassable with `--no-verify`. |',
    '| Model routing advice | **Advisory** | Recommends a tier; the kit cannot switch your Copilot model. |',
    '| MCP tool posture | **Advisory / reported** | Summarised below; connections are never modified. |',
    '',
    '### Posture checklist',
    `- Content-exclusion config present: ${e.contentExclusionReferencePresent ? '✅ yes' : '❌ no'} (\`copilot-content-exclusion.yml\`)`,
    `- Agent-mode policy present: ${e.agentPolicyPresent ? '✅ yes' : '❌ no'} (\`AGENTS.md\` — the behavioural control for Edit/Agent/CLI)`,
    `- MCP posture checked: ${e.mcp && e.mcp.serverCount ? `✅ ${e.mcp.serverCount} server(s)` : '— none found'}`,
    `- Secret redaction this period: ${e.secretRedactions > 0 ? `✅ ${num(e.secretRedactions)} value(s) masked` : '— none yet'}`,
    '',
    '## Governance / context readiness',
    e.readiness
      ? `- Readiness: **${e.readiness.verdict}** (score ${e.readiness.score}/${e.readiness.maxScore})`
      : '- Readiness not yet computed — run **CE: Check Context Readiness**.',
    `- Output-discipline instruction present: ${e.leanOutputInstructionPresent ? '✅ yes' : '❌ no'} (\`lean-output.instructions.md\`)`,
    '',
    '## Content exclusion',
    `- Reference present: ${e.contentExclusionReferencePresent ? '✅ yes' : '❌ no'} (\`copilot-content-exclusion.yml\`)`,
    '- ⚠️ Apply patterns in **GitHub → Settings → Copilot → Content exclusion**. It does **not** cover agent mode, edit mode, or the CLI — pair with secret scanning.',
    '',
    '## MCP',
    e.mcp && e.mcp.serverCount
      ? `- Servers: ${e.mcp.serverCount} · with \`allowed_tools\`: ${e.mcp.allowlistServerCount} · with \`defer_loading\`: ${e.mcp.deferredServerCount}`
      : '- No MCP config (`.vscode/mcp.json`) found.',
    '',
    '## Activity (this developer)',
    `- Total kit runs: ${num(e.totalRuns)}`,
    '',
  );
  return lines.join('\n');
}

function buildAuditEvidence(input) {
  const json = computeEvidence(input);
  return { json, markdown: renderEvidenceMarkdown(json) };
}

module.exports = { buildAuditEvidence };
