const DAY_MS = 24 * 60 * 60 * 1000;
const FRESH_DAYS = 90;
const STALE_DAYS = 180;

// Lists the MCP servers that were found, so the finding shows exactly which ones
// are configured (not just a count). Capped so a large config stays readable.
function formatServerNames(serverNames) {
  const names = Array.isArray(serverNames) ? serverNames : [];
  if (names.length === 0) {
    return '';
  }
  const MAX_NAMED = 8;
  const shown = names.slice(0, MAX_NAMED).join(', ');
  const more = names.length > MAX_NAMED ? `, +${names.length - MAX_NAMED} more` : '';
  return ` (${shown}${more})`;
}

// Just the names of the under-scoped servers (no "needs …"), for the Fix line in
// Recommended Actions. Empty when the config was unparseable.
function gapServerNames(serverGaps) {
  const gaps = Array.isArray(serverGaps) ? serverGaps : [];
  if (gaps.length === 0) {
    return '';
  }
  const MAX_NAMED = 8;
  const shown = gaps.slice(0, MAX_NAMED).map(gap => gap.name).join(', ');
  const more = gaps.length > MAX_NAMED ? `, +${gaps.length - MAX_NAMED} more` : '';
  return `${shown}${more}`;
}

// Names the specific MCP servers that are under-scoped and what each one needs,
// so the finding points at the offenders instead of a bare "0/3". Empty when the
// config was unparseable (names can't be trusted).
function formatServerGaps(serverGaps) {
  const gaps = Array.isArray(serverGaps) ? serverGaps : [];
  if (gaps.length === 0) {
    return '';
  }
  const MAX_NAMED = 6;
  const named = gaps.slice(0, MAX_NAMED).map(gap => {
    const needs = [];
    if (gap.needsAllowlist) {
      needs.push('allowed_tools');
    }
    if (gap.needsDeferred) {
      needs.push('defer_loading');
    }
    return `${gap.name} (needs ${needs.join(' + ')})`;
  });
  const more = gaps.length > MAX_NAMED ? ` and ${gaps.length - MAX_NAMED} more` : '';
  return ` To fix: ${named.join(', ')}${more}.`;
}

function summarizeMcpQuality(probes) {
  if (!probes.hasMcpConfig) {
    return {
      status: 'warn',
      detail: 'No .vscode/mcp.json or .vscode/mcp.jsonc was found.',
      action: 'Add a minimal MCP config when the repo uses MCP-enabled workflows so tool exposure can stay explicit and small.',
    };
  }

  const serverCount = probes.mcpServerCount ?? 0;
  const allowlistCount = probes.mcpAllowlistServerCount ?? 0;
  const deferredCount = probes.mcpDeferredServerCount ?? 0;

  if (serverCount === 0) {
    return {
      status: 'warn',
      detail: 'Workspace MCP config exists, but no server definitions were detected.',
      action: 'Keep MCP config explicit and repo-specific so only required servers are defined.',
    };
  }

  const found = formatServerNames(probes.mcpServerNames);

  if (allowlistCount === serverCount && deferredCount === serverCount) {
    return {
      status: 'pass',
      detail: `Found ${serverCount} MCP server(s)${found}; all declare allowed_tools and defer_loading.`,
      action: 'None.',
    };
  }

  const detail = `Found ${serverCount} MCP server(s)${found}; allowlists on ${allowlistCount}/${serverCount}, deferred loading on ${deferredCount}/${serverCount}.${formatServerGaps(probes.mcpServerGaps)}`;

  const gapNames = gapServerNames(probes.mcpServerGaps);
  const action = gapNames
    ? `Add the missing allowed_tools and defer_loading to: ${gapNames}.`
    : 'Add allowed_tools and defer_loading for each active MCP server to keep tool exposure and schema overhead small.';

  return { status: 'warn', detail, action };
}

function summarizeAgentPolicy(probes) {
  if (!probes.hasAgentsFile) {
    return {
      status: 'missing',
      detail: 'Missing AGENTS.md.',
      action: 'Add AGENTS.md so agentic workflows inherit repo-specific safety and scope rules.',
    };
  }

  const defs = probes.agentDefinitions ?? { total: 0, unscoped: 0, undescribed: 0 };
  const problems = [];
  if (defs.unscoped > 0) {
    problems.push(`${defs.unscoped} of ${defs.total} agent definition(s) declare no tool scope`);
  }
  if (defs.undescribed > 0) {
    problems.push(`${defs.undescribed} of ${defs.total} agent definition(s) have no description`);
  }

  if (problems.length > 0) {
    return {
      status: 'warn',
      detail: `Found AGENTS.md, but ${problems.join(' and ')}.`,
      action: 'Give every agent a description (when to use it) and an explicit tools: allowlist so its purpose and tool surface are unambiguous.',
    };
  }

  return {
    status: 'pass',
    detail: defs.total > 0
      ? `Found AGENTS.md and ${defs.total} scoped agent definition(s).`
      : 'Found AGENTS.md for Agent Mode and cloud-agent guardrails.',
    action: 'None.',
  };
}

function summarizeRepoInstructions(probes) {
  if (!probes.hasRepoInstructions) {
    return {
      status: 'missing',
      detail: 'Missing .github/copilot-instructions.md.',
      action: 'Add a short repository instruction file with build/test commands and stable conventions.',
    };
  }

  const hygiene = probes.instructionHygiene ?? {};
  const problems = [];
  if (hygiene.bloated) {
    problems.push(`it is ${hygiene.lineCount} lines and loads on every request`);
  }
  if ((hygiene.broadScopeHits ?? 0) > 0) {
    problems.push(`it uses broad-scope directives (${(hygiene.broadScopeExamples ?? []).join(', ')})`);
  }

  if (problems.length > 0) {
    return {
      status: 'warn',
      detail: `Found .github/copilot-instructions.md, but ${problems.join('; ')}.`,
      action: 'Move examples and rationale into path-specific instructions or referenced skills, and anchor directives to specific files instead of the whole repo.',
    };
  }

  return {
    status: 'pass',
    detail: 'Found .github/copilot-instructions.md.',
    action: 'None.',
  };
}

function scoreForStatus(weight, status) {
  if (status === 'pass') {return weight;}
  if (status === 'warn') {return Math.round(weight / 2);}
  return 0;
}

function freshnessSignal(latestContextUpdateMs, nowMs) {
  if (!latestContextUpdateMs) {
    return {
      id: 'contextFreshness',
      label: 'Context freshness',
      status: 'missing',
      detail: 'No context files were found to assess freshness.',
      action: 'Add or update repository context files so readiness checks can detect current guidance.',
      weight: 10,
    };
  }

  const ageDays = Math.floor((nowMs - latestContextUpdateMs) / DAY_MS);
  if (ageDays <= FRESH_DAYS) {
    return {
      id: 'contextFreshness',
      label: 'Context freshness',
      status: 'pass',
      detail: `Context files were updated ${ageDays} day(s) ago.`,
      action: 'None.',
      weight: 10,
    };
  }

  if (ageDays <= STALE_DAYS) {
    return {
      id: 'contextFreshness',
      label: 'Context freshness',
      status: 'warn',
      detail: `Context files were last updated ${ageDays} day(s) ago.`,
      action: 'Review instructions, exclusions, and MCP config for drift before rollout expands.',
      weight: 10,
    };
  }

  return {
    id: 'contextFreshness',
    label: 'Context freshness',
    status: 'missing',
    detail: `Context files appear stale (${ageDays} day(s) since the last update).`,
    action: 'Refresh repository instructions and related context files before relying on agent defaults.',
    weight: 10,
  };
}

function buildSignal(id, label, weight, probe) {
  if (probe.status) {
    return { id, label, weight, ...probe };
  }

  return probe.present
    ? { id, label, weight, status: 'pass', detail: probe.passDetail, action: 'None.' }
    : { id, label, weight, status: probe.missingStatus ?? 'missing', detail: probe.missingDetail, action: probe.action };
}

// Plain-English "what it is / why it matters" per signal, so a finding is
// understandable without prior Copilot knowledge. Keyed by signal id.
const SIGNAL_WHY = {
  repoInstructions: 'Repo-wide guidance Copilot auto-loads into every chat and agent request, so shared build/test commands and conventions are not re-typed each time.',
  pathInstructions: 'Directory-scoped rules that apply only to matching files, keeping the always-loaded repo-wide file small and each request cheaper.',
  agentsPolicy: 'The policy file Agent Mode and cloud agents read for repo-specific safety and scope; also where per-agent tool-scoping and descriptions are checked.',
  contentExclusion: 'GitHub Copilot\'s enforced privacy layer (Business/Enterprise): it stops Copilot reading the listed paths (secrets, data) for completions and chat. The committed file documents the policy; the GitHub setting is what enforces it.',
  copilotIgnore: 'A visible, version-controlled list of paths you do not want sent to Copilot. GitHub does not read it (convention only) — real enforcement is Content exclusion.',
  mcpConfig: 'Declares which MCP servers and tools agents may use. Scoping tools (allowed_tools) and deferring load keeps large tool catalogs from inflating every request.',
  devcontainer: 'A reproducible dev/sandbox environment definition so local and cloud agents run against the same setup.',
  contextFreshness: 'How recently your context files changed; stale guidance drifts from the code and quietly misleads agents.',
};

function buildWorkspaceReadiness(probes, now = Date.now()) {
  const latestContextUpdateMs = probes.latestContextUpdateMs ?? null;
  const mcpQuality = summarizeMcpQuality(probes);
  const signals = [
    buildSignal('repoInstructions', 'Repository instructions', 20, summarizeRepoInstructions(probes)),
    buildSignal('pathInstructions', 'Path-specific instructions', 10, probes.pathInstructionCount > 0
      ? {
        status: 'pass',
        detail: `Found ${probes.pathInstructionCount} path-specific instruction file(s).`,
        action: 'None.',
      }
      : {
        status: 'warn',
        detail: 'No .github/instructions/*.instructions.md files were found.',
        action: 'Move narrow, directory-specific rules out of the repo-wide file when the repo grows enough to need them.',
      }),
    buildSignal('agentsPolicy', 'Agent policy', 15, summarizeAgentPolicy(probes)),
    buildSignal('contentExclusion', 'Content exclusion', 15, {
      present: probes.hasContentExclusion,
      passDetail: 'Found .github/copilot-content-exclusion.yml.',
      missingDetail: 'Missing .github/copilot-content-exclusion.yml.',
      action: 'Add a repository content-exclusion file and mirror it in GitHub Copilot settings.',
    }),
    buildSignal('copilotIgnore', 'Copilot ignore (convention only)', 5, {
      present: probes.hasCopilotIgnore,
      passDetail: 'Found .copilotignore.',
      missingDetail: 'Missing .copilotignore.',
      missingStatus: 'warn',
      action: 'Add .copilotignore to keep the exclusion policy visible in-repo even though GitHub does not enforce it directly.',
    }),
    buildSignal('mcpConfig', 'MCP configuration', 15, mcpQuality),
    buildSignal('devcontainer', 'Dev container', 10, {
      present: probes.hasDevcontainer,
      passDetail: 'Found .devcontainer/devcontainer.json.',
      missingDetail: 'No dev container definition was found.',
      missingStatus: 'warn',
      action: 'Add a dev container when the team needs reproducible local or sandboxed agent execution.',
    }),
    freshnessSignal(latestContextUpdateMs, now),
  ].map(signal => ({
    ...signal,
    earned: scoreForStatus(signal.weight, signal.status),
    why: SIGNAL_WHY[signal.id],
  }));

  const maxScore = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const score = signals.reduce((sum, signal) => sum + signal.earned, 0);
  const verdict = score >= 80 ? 'Ready' : score >= 50 ? 'Needs attention' : 'Incomplete';
  const recommendations = signals
    .filter(signal => signal.status !== 'pass')
    .map(signal => `${signal.label}: ${signal.action}`);

  return {
    name: probes.name,
    path: probes.path,
    score,
    maxScore,
    verdict,
    signals,
    recommendations,
  };
}

// From a readiness report, list every signal that is not yet passing, with how
// many points closing it would add and the concrete action to take, ranked by
// impact. This is what turns a bare "86/100" into "here is what is wrong and
// where to improve" for the stats panel and the readiness report.
function collectReadinessGaps(report) {
  const gaps = [];
  for (const workspace of report.workspaces) {
    for (const signal of workspace.signals) {
      if (signal.status === 'pass') {
        continue;
      }
      const earned = signal.earned ?? scoreForStatus(signal.weight, signal.status);
      gaps.push({
        id: signal.id,
        label: signal.label,
        status: signal.status,
        earned,
        weight: signal.weight,
        toClose: signal.weight - earned,
        detail: signal.detail,
        action: signal.action,
        why: signal.why,
        workspace: workspace.name,
      });
    }
  }
  gaps.sort((left, right) => right.toClose - left.toClose);
  return gaps;
}

module.exports = {
  buildWorkspaceReadiness,
  collectReadinessGaps,
  scoreForStatus,
};