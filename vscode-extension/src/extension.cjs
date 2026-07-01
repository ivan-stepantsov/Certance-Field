const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vscode = require('vscode');
const {
  renderContextReadinessReport,
  formatDelta,
  renderPromptResult,
  renderSelectionResult,
  buildSelectionClipboard,
  renderStats,
} = require('./renderers.cjs');
const { registerCommands } = require('./command-routing.cjs');
const { registerChatParticipant, registerConciseParticipant } = require('./chat-participant.cjs');
const { registerLanguageModelTool } = require('./language-model-tool.cjs');
const { applyRunToStats, emptyStats } = require('./stats.cjs');
const { buildWorkspaceReadiness, collectReadinessGaps } = require('./context-readiness.cjs');
const { summarizeAgentDefinitions, summarizeInstructionHygiene } = require('./agentic-hygiene.cjs');
const { workspacePathForDocument, getSelectedText } = require('./editor-context.cjs');

const STATS_KEY = 'ceTokenKit.stats';
const READINESS_RECOMPUTE_DEBOUNCE_MS = 300;

function summarizeReadinessForStats(report) {
  const overallVerdict = report.workspaces.every(workspace => workspace.verdict === 'Ready')
    ? 'Ready'
    : report.workspaces.some(workspace => workspace.verdict === 'Incomplete')
      ? 'Incomplete'
      : 'Needs attention';
  const totalScore = report.workspaces.reduce((sum, workspace) => sum + workspace.score, 0);
  const totalMaxScore = report.workspaces.reduce((sum, workspace) => sum + workspace.maxScore, 0);
  const averageScore = report.workspaces.length > 0 ? Math.round(totalScore / report.workspaces.length) : 0;
  const averageMaxScore = report.workspaces.length > 0 ? Math.round(totalMaxScore / report.workspaces.length) : 0;

  // The single highest-impact gap, kept tiny so it can live in the persisted
  // summary and drive the status-bar tooltip. `null` means everything passes.
  const gaps = collectReadinessGaps(report);
  const topGap = gaps.length > 0 ? { label: gaps[0].label, toClose: gaps[0].toClose } : null;

  return {
    verdict: overallVerdict,
    score: averageScore,
    maxScore: averageMaxScore,
    workspaceCount: report.workspaces.length,
    generatedAt: report.generatedAt,
    topGap,
  };
}

function buildCoachingSnapshot(stats) {
  const topRecurringSkeletons = Object.entries(stats.skeletonCounts ?? {})
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, count }));

  return {
    totalWarnings: stats.totalWarnings,
    volatileContextWarnings: stats.volatileContextWarnings,
    lowReuseWarnings: stats.lowReuseWarnings,
    instructionSelectionWarnings: stats.instructionSelectionWarnings,
    mcpToolBloatWarnings: stats.mcpToolBloatWarnings ?? 0,
    mcpDeferredLoadingWarnings: stats.mcpDeferredLoadingWarnings ?? 0,
    repeatedPromptSkeletons: stats.repeatedPromptSkeletons,
    uniquePromptSkeletons: stats.uniquePromptSkeletons,
    topRecurringSkeletons,
  };
}

function getStats(context) {
  return context.globalState.get(STATS_KEY, emptyStats());
}

async function updateStats(context, patch) {
  const current = getStats(context);
  const next = {
    ...current,
    commandRuns: {
      ...current.commandRuns,
      ...(patch.commandRuns ?? {}),
    },
    ...patch,
  };
  await context.globalState.update(STATS_KEY, next);
  return next;
}

async function openResultDocument(language, content) {
  const document = await vscode.workspace.openTextDocument({
    language,
    content,
  });
  await vscode.window.showTextDocument(document, { preview: false });
}

async function findWorkspaceFiles(folder, pattern, maxResults = 20) {
  const relativePattern = new vscode.RelativePattern(folder, pattern);
  return vscode.workspace.findFiles(relativePattern, null, maxResults);
}

async function readWorkspaceFileText(uri) {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return '';
  }
}

function stripJsonComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function stripTrailingCommas(text) {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

function parseMcpConfigSummary(text) {
  if (!text.trim()) {
    return {
      serverCount: 0,
      allowlistServerCount: 0,
      deferredServerCount: 0,
      serverGaps: [],
      serverNames: [],
    };
  }

  try {
    const normalized = stripTrailingCommas(stripJsonComments(text));
    const parsed = JSON.parse(normalized);
    const entries = parsed && typeof parsed === 'object' && parsed.servers && typeof parsed.servers === 'object'
      ? Object.entries(parsed.servers)
      : [];

    let allowlistServerCount = 0;
    let deferredServerCount = 0;
    const serverGaps = [];
    for (const [name, server] of entries) {
      const config = server && typeof server === 'object' ? server : {};
      const hasAllowlist = Array.isArray(config.allowed_tools) && config.allowed_tools.length > 0;
      const hasDeferred = config.defer_loading === true;
      if (hasAllowlist) {
        allowlistServerCount += 1;
      }
      if (hasDeferred) {
        deferredServerCount += 1;
      }
      // Capture which named servers are under-scoped so the readiness finding can
      // point at the exact offenders instead of a bare "0/3".
      if (!hasAllowlist || !hasDeferred) {
        serverGaps.push({ name, needsAllowlist: !hasAllowlist, needsDeferred: !hasDeferred });
      }
    }

    return {
      serverCount: entries.length,
      allowlistServerCount,
      deferredServerCount,
      serverGaps,
      serverNames: entries.map(([name]) => name),
    };
  } catch {
    // Malformed JSON: fall back to counts only; names can't be trusted.
    const allowlistServerCount = (text.match(/"allowed_tools"\s*:/g) || []).length;
    const deferredServerCount = (text.match(/"defer_loading"\s*:/g) || []).length;
    return {
      serverCount: Math.max(allowlistServerCount, deferredServerCount, text.includes('"servers"') ? 1 : 0),
      allowlistServerCount,
      deferredServerCount,
      serverGaps: [],
      serverNames: [],
    };
  }
}

function shouldRecomputeReadinessForDocument(document) {
  if (!document || !document.uri || document.uri.scheme !== 'file') {
    return false;
  }

  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) {
    return false;
  }

  const relativePath = path.relative(folder.uri.fsPath, document.uri.fsPath).replace(/\\/g, '/');
  return relativePath === '.github/copilot-instructions.md'
    || relativePath === 'AGENTS.md'
    || relativePath === '.vscode/mcp.json'
    || relativePath === '.vscode/mcp.jsonc'
    || (relativePath.startsWith('.github/agents/') && relativePath.endsWith('.agent.md'))
    || (relativePath.startsWith('.claude/agents/') && relativePath.endsWith('.md'));
}

function createDebouncedReadinessSaveHandler(options) {
  const {
    context,
    statusBar,
    computeReadiness,
    delayMs = READINESS_RECOMPUTE_DEBOUNCE_MS,
    scheduleTimeout = setTimeout,
    clearScheduledTimeout = clearTimeout,
  } = options;

  let pendingTimer = null;

  return {
    handleSave(document) {
      if (!shouldRecomputeReadinessForDocument(document)) {
        return;
      }

      if (pendingTimer) {
        clearScheduledTimeout(pendingTimer);
      }

      pendingTimer = scheduleTimeout(() => {
        pendingTimer = null;
        void computeReadiness(context, statusBar, { openDocument: false });
      }, delayMs);
    },
    dispose() {
      if (pendingTimer) {
        clearScheduledTimeout(pendingTimer);
        pendingTimer = null;
      }
    },
  };
}

async function latestStatMtimeMs(uris) {
  const stats = await Promise.all(
    uris.map(async uri => {
      try {
        return await vscode.workspace.fs.stat(uri);
      } catch {
        return null;
      }
    })
  );

  const mtimes = stats
    .filter(Boolean)
    .map(stat => stat.mtime)
    .filter(value => typeof value === 'number');

  return mtimes.length > 0 ? Math.max(...mtimes) : null;
}

async function buildWorkspaceReadinessProbe(folder) {
  const [
    repoInstructions,
    pathInstructions,
    agentsFile,
    contentExclusion,
    copilotIgnore,
    mcpJson,
    mcpJsonc,
    devcontainer,
    copilotAgents,
    claudeAgents,
  ] = await Promise.all([
    findWorkspaceFiles(folder, '.github/copilot-instructions.md', 1),
    findWorkspaceFiles(folder, '.github/instructions/*.instructions.md', 50),
    findWorkspaceFiles(folder, 'AGENTS.md', 1),
    findWorkspaceFiles(folder, '.github/copilot-content-exclusion.yml', 1),
    findWorkspaceFiles(folder, '.copilotignore', 1),
    findWorkspaceFiles(folder, '.vscode/mcp.json', 1),
    findWorkspaceFiles(folder, '.vscode/mcp.jsonc', 1),
    findWorkspaceFiles(folder, '.devcontainer/devcontainer.json', 1),
    findWorkspaceFiles(folder, '.github/agents/*.agent.md', 50),
    findWorkspaceFiles(folder, '.claude/agents/*.md', 50),
  ]);

  const latestContextUpdateMs = await latestStatMtimeMs([
    ...repoInstructions,
    ...pathInstructions,
    ...agentsFile,
    ...contentExclusion,
    ...copilotIgnore,
    ...mcpJson,
    ...mcpJsonc,
    ...devcontainer,
  ]);

  const mcpFile = mcpJson[0] ?? mcpJsonc[0] ?? null;
  const mcpConfigText = mcpFile ? await readWorkspaceFileText(mcpFile) : '';
  const mcpSummary = parseMcpConfigSummary(mcpConfigText);

  // Agentic-hygiene surfaces: read the agent definitions and the always-loaded
  // repo instructions so the readiness signals can score their quality, not just
  // their presence. All local, deterministic, no model.
  const agentUris = [...copilotAgents, ...claudeAgents];
  const agentFiles = await Promise.all(
    agentUris.map(async uri => ({ name: uri.fsPath, text: await readWorkspaceFileText(uri) }))
  );
  const agentDefinitions = summarizeAgentDefinitions(agentFiles);
  const repoInstructionsText = repoInstructions[0] ? await readWorkspaceFileText(repoInstructions[0]) : '';
  const instructionHygiene = summarizeInstructionHygiene(repoInstructionsText);

  return {
    name: folder.name,
    path: folder.uri.fsPath,
    hasRepoInstructions: repoInstructions.length > 0,
    instructionHygiene,
    pathInstructionCount: pathInstructions.length,
    hasAgentsFile: agentsFile.length > 0,
    agentDefinitions,
    hasContentExclusion: contentExclusion.length > 0,
    hasCopilotIgnore: copilotIgnore.length > 0,
    hasMcpConfig: mcpJson.length > 0 || mcpJsonc.length > 0,
    mcpServerCount: mcpSummary.serverCount,
    mcpAllowlistServerCount: mcpSummary.allowlistServerCount,
    mcpDeferredServerCount: mcpSummary.deferredServerCount,
    mcpServerGaps: mcpSummary.serverGaps,
    mcpServerNames: mcpSummary.serverNames,
    hasDevcontainer: devcontainer.length > 0,
    latestContextUpdateMs,
  };
}

function createStatusBarItem(context) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = 'ceTokenKit.showStats';
  context.subscriptions.push(item);
  return item;
}

async function recordRun(context, statusBar, details) {
  const currentStats = getStats(context);
  const stats = await updateStats(context, applyRunToStats(currentStats, details));

  refreshStatusBar(statusBar, stats);
  return stats;
}

function refreshStatusBar(item, stats) {
  const netSaved = stats.totalBeforeTokens - stats.totalAfterTokens;
  const savingsText = netSaved >= 0
    ? `${netSaved.toLocaleString()}t saved`
    : `+${Math.abs(netSaved).toLocaleString()}t`;
  const readinessBadge = stats.contextReadiness
    ? ` $(shield) ${stats.contextReadiness.score}/${stats.contextReadiness.maxScore}`
    : '';
  item.text = `$(graph) CE: ${savingsText}${readinessBadge}`;
  item.tooltip = buildStatusBarTooltip(stats);
  item.show();
}

// Pure: builds the multi-line status-bar tooltip. Names the single highest-impact
// readiness gap so the guidance is visible passively, every session, with no
// pop-up. Clicking the item opens the full stats + readiness report
// (item.command = ceTokenKit.showStats).
function buildStatusBarTooltip(stats) {
  const netSaved = stats.totalBeforeTokens - stats.totalAfterTokens;
  const lines = [
    'Click to open Certance Token Kit stats and readiness',
    `Net token delta: ${netSaved >= 0 ? '' : '+'}${Math.abs(netSaved).toLocaleString()}`,
  ];

  const readiness = stats.contextReadiness;
  if (!readiness) {
    lines.push('Context readiness: not checked yet');
    return lines.join('\n');
  }

  lines.push(`Context readiness: ${readiness.verdict} (${readiness.score}/${readiness.maxScore})`);
  if (readiness.topGap) {
    lines.push(`Biggest gap: ${readiness.topGap.label} (+${readiness.topGap.toClose}). Click for the full report.`);
  } else if (readiness.topGap === null) {
    lines.push('All readiness signals pass.');
  }
  return lines.join('\n');
}

// Builds a readiness report for the CURRENT window's workspace folders without
// persisting anything. Readiness is intrinsically per-project, so surfaces that
// only display it (e.g. Show Local Stats) build it fresh from here instead of
// reading the global stats blob, whose single contextReadiness field is shared
// across every window and therefore reflects whichever window computed last.
async function buildContextReadinessReport(context) {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    return null;
  }

  const workspaces = await Promise.all(
    folders.map(async folder => buildWorkspaceReadiness(await buildWorkspaceReadinessProbe(folder)))
  );

  return {
    generatedAt: new Date().toISOString(),
    workspaces,
    coaching: buildCoachingSnapshot(getStats(context)),
  };
}

async function computeContextReadinessReport(context, statusBar, options = {}) {
  const report = await buildContextReadinessReport(context);
  if (!report) {
    return null;
  }

  const readinessSummary = summarizeReadinessForStats(report);
  const nextStats = await updateStats(context, { contextReadiness: readinessSummary });
  refreshStatusBar(statusBar, nextStats);

  if (options.openDocument) {
    await openResultDocument('markdown', renderContextReadinessReport(report));
  }

  return report;
}

async function loadSharedLibrary() {
  // Resolves to vscode-extension/src/shared/lib/index.js — bundled inside the extension.
  // This path is stable whether the extension is run from source or installed via .vsix.
  const libraryPath = path.resolve(__dirname, 'shared', 'lib', 'index.js');
  return import(pathToFileURL(libraryPath).href);
}

async function optimizePromptCommand(context, statusBar) {
  const shared = await loadSharedLibrary();
  const editor = vscode.window.activeTextEditor;
  const prompt = await vscode.window.showInputBox({
    prompt: 'Enter the raw prompt you want to optimize before sending to Copilot',
    placeHolder: 'fix the failing test',
    ignoreFocusOut: true,
  });

  if (!prompt) {
    return;
  }

  const file = editor ? workspacePathForDocument(editor.document) : null;
  const selectionText = editor ? getSelectedText(editor) : '';
  const result = shared.optimizePrompt(prompt, {
    file,
    selectionText,
  });
  const promptSkeletonId = typeof shared.buildPromptSkeletonId === 'function'
    ? shared.buildPromptSkeletonId(prompt, { file })
    : null;

  await vscode.env.clipboard.writeText(result.optimizedPrompt);
  await openResultDocument('markdown', renderPromptResult(result));

  await recordRun(context, statusBar, {
    commandKey: 'optimizePrompt',
    commandLabel: 'Optimize Prompt',
    group: 'prompt',
    promptSkeletonId,
    result,
  });

  if (result.warnings.length > 0) {
    void vscode.window.showWarningMessage(`Prompt optimized and copied to clipboard. ${result.warnings[0]}`);
  } else {
    void vscode.window.showInformationMessage(`Prompt optimized and copied to clipboard: ${formatDelta(result.beforeTokens, result.afterTokens)}.`);
  }
}

async function runSelectionCommand(context, statusBar, options) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage('Open an editor and select some text first.');
    return;
  }

  const selectionText = getSelectedText(editor);
  if (!selectionText) {
    void vscode.window.showWarningMessage('Select some text to optimize.');
    return;
  }

  const shared = await loadSharedLibrary();
  const file = workspacePathForDocument(editor.document);
  const result = options.sizeAwareExplain
    ? shared.explainSelection(selectionText, { filename: file })
    : shared.optimizeSelectionText(selectionText, { filename: file });

  if (options.expectedKind && result.kind !== options.expectedKind) {
    void vscode.window.showWarningMessage(options.mismatchMessage);
    return;
  }

  // Bundle the follow-up prompt + compressed content so one paste into Copilot
  // Chat is ready to send (the prompt's "this diff/trace" refers to the block
  // pasted right below it, not the uncompressed source file).
  await vscode.env.clipboard.writeText(buildSelectionClipboard(options.commandKey, result));
  await openResultDocument('markdown', renderSelectionResult(options, result, file));

  await recordRun(context, statusBar, {
    commandKey: options.commandKey,
    commandLabel: options.commandLabel,
    group: 'selection',
    result,
  });

  if (result.warnings.length > 0) {
    void vscode.window.showWarningMessage(`Selection optimized — ready-to-send prompt copied to clipboard. ${result.warnings[0]}`);
    return;
  }

  void vscode.window.showInformationMessage(`Selection optimized — ready-to-send prompt copied to clipboard: ${formatDelta(result.beforeTokens, result.afterTokens)}.`);
}

async function reviewDiffCommand(context, statusBar) {
  await runSelectionCommand(context, statusBar, {
    commandKey: 'reviewDiff',
    commandLabel: 'Review Diff',
    expectedKind: 'diff',
    mismatchMessage: 'The current selection does not look like a diff. Select a patch or git diff before using Review Diff.',
  });
}

async function debugStackTraceCommand(context, statusBar) {
  await runSelectionCommand(context, statusBar, {
    commandKey: 'debugStackTrace',
    commandLabel: 'Debug Stack Trace',
    expectedKind: 'stack-trace',
    mismatchMessage: 'The current selection does not look like a stack trace. Select an error or trace before using Debug Stack Trace.',
  });
}

async function explainSelectionCommand(context, statusBar) {
  await runSelectionCommand(context, statusBar, {
    commandKey: 'explainSelection',
    commandLabel: 'Explain Selection',
    sizeAwareExplain: true,
  });
}

async function checkContextReadinessCommand(context, statusBar) {
  const report = await computeContextReadinessReport(context, statusBar, { openDocument: true });
  if (!report) {
    void vscode.window.showWarningMessage('Open a workspace folder before running Context Readiness.');
    return;
  }

  const incompleteCount = report.workspaces.filter(workspace => workspace.verdict === 'Incomplete').length;
  if (incompleteCount > 0) {
    void vscode.window.showWarningMessage(`Context readiness completed. ${incompleteCount} workspace(s) are incomplete.`);
    return;
  }

  const needsAttentionCount = report.workspaces.filter(workspace => workspace.verdict === 'Needs attention').length;
  if (needsAttentionCount > 0) {
    void vscode.window.showInformationMessage(`Context readiness completed. ${needsAttentionCount} workspace(s) need attention.`);
    return;
  }

  void vscode.window.showInformationMessage('Context readiness completed. All workspaces look ready.');
}

async function showStatsCommand(context, buildReport = buildContextReadinessReport) {
  const stats = getStats(context);
  // Token/warning counts are global and cumulative (personal usage across every
  // repo), so they come straight from the stored stats. Readiness is per-project,
  // so recompute it live for THIS window's workspace instead of showing the shared
  // global value — and do not persist it, which would leak into other windows.
  const report = await buildReport(context);
  const contextReadiness = report
    ? { ...summarizeReadinessForStats(report), gaps: collectReadinessGaps(report) }
    : null;
  await openResultDocument('markdown', renderStats({ ...stats, contextReadiness }));
}

// Pure core of "CE: Redact Clipboard" — testable without the clipboard API.
// Returns what message to show and (when redacted) the scrubbed text to write back.
function redactClipboardResult(text, protectSecrets) {
  const input = String(text ?? '');
  if (!input.trim()) {
    return { status: 'empty', message: 'CE: Clipboard is empty — nothing to redact.' };
  }
  const protection = protectSecrets(input);
  if (!protection.redacted) {
    return { status: 'clean', message: 'CE: No high-confidence secrets found in the clipboard.' };
  }
  const kinds = protection.findings.map(finding => finding.id).join(', ');
  return {
    status: 'redacted',
    output: protection.output,
    message: `CE: Redacted ${protection.totalRedactions} secret value(s) in the clipboard — safe to paste. (${kinds})`,
  };
}

async function redactClipboardCommand() {
  const shared = await loadSharedLibrary();
  const text = await vscode.env.clipboard.readText();
  const result = redactClipboardResult(text, shared.protectSecrets);
  if (result.status === 'redacted') {
    await vscode.env.clipboard.writeText(result.output);
    void vscode.window.showWarningMessage(result.message);
  } else {
    void vscode.window.showInformationMessage(result.message);
  }
}

async function applyGuardrailProfileCommand() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    void vscode.window.showWarningMessage('CE: Open a folder before applying the guardrail profile.');
    return;
  }
  const { GUARDRAIL_ASSETS, buildGuardrailPlan, buildMcpReport, renderGuardrailReport } = require('./guardrail-profile.cjs');
  const root = folders[0].uri;

  const fileExists = async uri => {
    try { await vscode.workspace.fs.stat(uri); return true; } catch { return false; }
  };

  // Which guardrail assets already exist? (We only ADD what's missing.)
  const present = [];
  for (const asset of GUARDRAIL_ASSETS) {
    if (await fileExists(vscode.Uri.joinPath(root, asset.path))) {present.push(asset.path);}
  }
  const plan = buildGuardrailPlan(present);

  // Write missing assets additively — never overwrite an existing file.
  const written = [];
  for (const item of plan.toWrite) {
    const uri = vscode.Uri.joinPath(root, item.path);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(item.content, 'utf8'));
    written.push(item.path);
  }

  // MCP: read and report only — connections are never modified.
  let mcpSummary = null;
  const mcpUri = vscode.Uri.joinPath(root, '.vscode', 'mcp.json');
  if (await fileExists(mcpUri)) {
    const text = Buffer.from(await vscode.workspace.fs.readFile(mcpUri)).toString('utf8');
    mcpSummary = parseMcpConfigSummary(text);
  }

  const report = renderGuardrailReport({ written, skipped: plan.skipped, mcpReport: buildMcpReport(mcpSummary) });
  const doc = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
  await vscode.window.showTextDocument(doc, { preview: false });

  void vscode.window.showInformationMessage(
    written.length
      ? `CE: Guardrail profile — added ${written.length} file(s); ${plan.skipped.length} already present. See the report for content-exclusion + MCP advice.`
      : `CE: Guardrail profile — all files already present. See the report for content-exclusion + MCP advice.`
  );
}

async function exportAuditEvidenceCommand(context) {
  const { buildAuditEvidence } = require('./audit-evidence.cjs');
  const folders = vscode.workspace.workspaceFolders;
  const root = folders && folders[0] ? folders[0].uri : null;
  const fileExists = async uri => {
    try { await vscode.workspace.fs.stat(uri); return true; } catch { return false; }
  };

  let mcp = null;
  let exclusionPresent = false;
  let leanOutputPresent = false;
  let agentsPolicyPresent = false;
  if (root) {
    const mcpUri = vscode.Uri.joinPath(root, '.vscode', 'mcp.json');
    if (await fileExists(mcpUri)) {
      mcp = parseMcpConfigSummary(Buffer.from(await vscode.workspace.fs.readFile(mcpUri)).toString('utf8'));
    }
    exclusionPresent = await fileExists(vscode.Uri.joinPath(root, '.github', 'copilot-content-exclusion.yml'));
    leanOutputPresent = await fileExists(vscode.Uri.joinPath(root, '.github', 'instructions', 'lean-output.instructions.md'));
    agentsPolicyPresent = await fileExists(vscode.Uri.joinPath(root, 'AGENTS.md'));
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    version: (context.extension && context.extension.packageJSON && context.extension.packageJSON.version) || 'unknown',
    workspace: folders && folders[0] ? folders[0].name : '(no folder)',
  };
  const costPerMillionTokensUSD = vscode.workspace.getConfiguration('ceTokenKit').get('costPerMillionTokensUSD', 0);

  const { markdown, json } = buildAuditEvidence({
    stats: getStats(context),
    mcp,
    exclusionPresent,
    leanOutputPresent,
    agentsPolicyPresent,
    meta,
    costPerMillionTokensUSD,
  });

  if (root) {
    const jsonUri = vscode.Uri.joinPath(root, 'ce-audit-evidence.json');
    await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(JSON.stringify(json, null, 2) + '\n', 'utf8'));
  }
  const doc = await vscode.workspace.openTextDocument({ content: markdown, language: 'markdown' });
  await vscode.window.showTextDocument(doc, { preview: false });
  void vscode.window.showInformationMessage(
    root
      ? 'CE: Audit evidence written to ce-audit-evidence.json and opened as a report.'
      : 'CE: Audit evidence report opened (open a folder to also write the JSON).'
  );
}

async function scanWorkspaceSecretsCommand() {
  const { execFile } = require('node:child_process');
  const { promisify } = require('node:util');
  const execFileAsync = promisify(execFile);
  const { scanFiles, buildSecretScanReport, readableText } = require('./secret-scan.cjs');

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    void vscode.window.showWarningMessage('CE: Open a folder before scanning for secrets.');
    return;
  }
  const root = folders[0].uri;
  const cwd = root.fsPath;

  // Git's committable set: tracked (--cached) + untracked-but-not-ignored
  // (--others --exclude-standard). Gitignored files are excluded here, so a
  // local .env is never scanned — that's the correct place for secrets.
  let committable;
  let trackedSet;
  try {
    const [all, tracked] = await Promise.all([
      execFileAsync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd, maxBuffer: 64 * 1024 * 1024 }),
      execFileAsync('git', ['ls-files', '-z'], { cwd, maxBuffer: 64 * 1024 * 1024 }),
    ]);
    committable = all.stdout.split('\0').filter(Boolean);
    trackedSet = new Set(tracked.stdout.split('\0').filter(Boolean));
  } catch {
    void vscode.window.showWarningMessage('CE: Secret scan needs a Git repository — the risk model is based on what Git can commit. Run "git init" or open a repo.');
    return;
  }

  const shared = await loadSharedLibrary();

  // Pre-read each file's bytes (async) into a text cache, applying the binary /
  // oversize skip, so the pure scanFiles() stays synchronous and testable.
  const textCache = new Map();
  await Promise.all(committable.map(async file => {
    try {
      const bytes = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, file)));
      const text = readableText(bytes);
      if (text !== null) {textCache.set(file, text);}
    } catch {
      // unreadable — left out of the cache so scanFiles counts it as skipped
    }
  }));

  const result = scanFiles({
    files: committable,
    readText: file => (textCache.has(file) ? textCache.get(file) : null),
    scan: shared.scanSecrets,
    isTracked: file => trackedSet.has(file),
  });

  const report = buildSecretScanReport({
    findings: result.findings,
    scannedCount: result.scannedCount,
    skippedCount: result.skippedCount,
    meta: { generatedAt: new Date().toISOString(), workspace: folders[0].name },
  });
  const doc = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
  await vscode.window.showTextDocument(doc, { preview: false });

  if (result.findings.length) {
    void vscode.window.showWarningMessage(`CE: Secret scan — ${result.findings.length} potential secret(s) in committable files. See the report.`);
  } else {
    void vscode.window.showInformationMessage(`CE: Secret scan — no secrets found in ${result.scannedCount} committable file(s).`);
  }
}

async function installPrecommitHookCommand() {
  const { execFile } = require('node:child_process');
  const { promisify } = require('node:util');
  const fs = require('node:fs');
  const execFileAsync = promisify(execFile);
  const {
    SCANNER_REL_PATH, generateHookScanner, buildHookShell, planHookInstall, renderInstallReport,
  } = require('./precommit-hook.cjs');

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    void vscode.window.showWarningMessage('CE: Open a folder before installing the pre-commit hook.');
    return;
  }
  const root = folders[0].uri;
  const cwd = root.fsPath;

  // Resolve the real hook path (worktree-safe) and any custom hooks dir.
  let hookAbs;
  let hooksPathConfig = '';
  try {
    const hp = await execFileAsync('git', ['rev-parse', '--git-path', 'hooks/pre-commit'], { cwd });
    hookAbs = path.resolve(cwd, hp.stdout.trim());
    try {
      const cfg = await execFileAsync('git', ['config', '--get', 'core.hooksPath'], { cwd });
      hooksPathConfig = cfg.stdout.trim();
    } catch {
      hooksPathConfig = ''; // unset — fine
    }
  } catch {
    void vscode.window.showWarningMessage('CE: Pre-commit hook needs a Git repository. Run "git init" or open a repo.');
    return;
  }

  let existingHookContent = null;
  try {
    existingHookContent = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(hookAbs))).toString('utf8');
  } catch {
    existingHookContent = null; // no hook yet
  }

  const plan = planHookInstall({ hooksPathConfig, existingHookContent });

  // Scanner is always (re)generated from the canonical + custom patterns, so it
  // stays in lockstep with the redactor. It's our own namespaced file to write.
  const shared = await loadSharedLibrary();
  const summaries = typeof shared.getSecretPatternSummaries === 'function' ? shared.getSecretPatternSummaries() : [];
  const suppressionSource = typeof shared.getScannerSuppressionSource === 'function' ? shared.getScannerSuppressionSource() : '';
  const scannerUri = vscode.Uri.joinPath(root, ...SCANNER_REL_PATH.split('/'));
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(scannerUri, '..'));
  await vscode.workspace.fs.writeFile(scannerUri, Buffer.from(generateHookScanner(summaries, suppressionSource), 'utf8'));

  if (plan.writeHook) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(hookAbs)));
    await vscode.workspace.fs.writeFile(vscode.Uri.file(hookAbs), Buffer.from(buildHookShell(), 'utf8'));
    try { fs.chmodSync(hookAbs, 0o755); } catch { /* Windows / restricted FS — git still runs it via sh */ }
  }

  const report = renderInstallReport({
    plan,
    hookPath: path.relative(cwd, hookAbs).replace(/\\/g, '/'),
    patternCount: summaries.length,
  });
  const doc = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
  await vscode.window.showTextDocument(doc, { preview: false });

  if (plan.action === 'fresh' || plan.action === 'already') {
    void vscode.window.showInformationMessage(`CE: Pre-commit secret scan ${plan.action === 'fresh' ? 'installed' : 'refreshed'} — commits now scan staged content. Commit ${SCANNER_REL_PATH} to share it.`);
  } else {
    void vscode.window.showWarningMessage('CE: Scanner written, but your existing hook setup was left untouched — see the report to wire it in.');
  }
}

async function recommendModelCommand(context) {
  const { classifyTask, renderModelAdvice } = require('./model-advisor.cjs');

  // Selection (if any) is a free signal; a one-line description sharpens it.
  const editor = vscode.window.activeTextEditor;
  const selectionText = editor && !editor.selection.isEmpty
    ? editor.document.getText(editor.selection)
    : '';

  const taskText = await vscode.window.showInputBox({
    title: 'CE: Recommend a Model for This Task',
    prompt: selectionText
      ? 'Describe the task (or leave blank to judge from your selection).'
      : 'Describe the task — e.g. "rename a variable" or "refactor auth across 3 files".',
    placeHolder: 'rename a variable · fix a typo · debug a race condition · refactor a module…',
    ignoreFocusOut: true,
  });
  // Esc (undefined) cancels; an empty string is a valid "use the selection" answer.
  if (taskText === undefined && !selectionText) {
    return;
  }

  const result = classifyTask({ text: taskText || '', selectionLength: selectionText.length });
  const report = renderModelAdvice(result, { taskText: (taskText || '').trim(), selectionLength: selectionText.length });
  const doc = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
  await vscode.window.showTextDocument(doc, { preview: false });

  // Aggregate cost-posture evidence for the audit pack (counts only — no content).
  const stats = getStats(context);
  await updateStats(context, {
    modelAdviceRuns: (stats.modelAdviceRuns ?? 0) + 1,
    localTransformOpportunities: (stats.localTransformOpportunities ?? 0) + (result.routing === 'local-transform' ? 1 : 0),
  });
}

async function resetStatsCommand(context, statusBar) {
  const currentStats = getStats(context);
  const resetState = {
    ...emptyStats(),
    contextReadiness: currentStats.contextReadiness,
  };
  await context.globalState.update(STATS_KEY, resetState);
  refreshStatusBar(statusBar, resetState);
  void vscode.window.showInformationMessage('Certance Token Kit local stats reset.');
}

function activate(context, dependencies = {}) {
  const statusBar = createStatusBarItem(context);
  refreshStatusBar(statusBar, getStats(context));

  const computeReadiness = dependencies.computeReadiness ?? computeContextReadinessReport;
  const readinessSaveHandler = createDebouncedReadinessSaveHandler({
    context,
    statusBar,
    computeReadiness,
    delayMs: dependencies.readinessDebounceMs,
    scheduleTimeout: dependencies.scheduleTimeout,
    clearScheduledTimeout: dependencies.clearScheduledTimeout,
  });

  void computeReadiness(context, statusBar, { openDocument: false });

  context.subscriptions.push({
    dispose() {
      readinessSaveHandler.dispose();
    },
  });

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      readinessSaveHandler.handleSave(document);
    })
  );

  registerCommands(vscode, context, {
    optimizePrompt: async () => {
      await optimizePromptCommand(context, statusBar);
    },
    reviewDiff: async () => {
      await reviewDiffCommand(context, statusBar);
    },
    debugStackTrace: async () => {
      await debugStackTraceCommand(context, statusBar);
    },
    explainSelection: async () => {
      await explainSelectionCommand(context, statusBar);
    },
    checkContextReadiness: async () => {
      await checkContextReadinessCommand(context, statusBar);
    },
    redactClipboard: async () => {
      await redactClipboardCommand();
    },
    applyGuardrailProfile: async () => {
      await applyGuardrailProfileCommand();
    },
    exportAuditEvidence: async () => {
      await exportAuditEvidenceCommand(context);
    },
    scanWorkspaceSecrets: async () => {
      await scanWorkspaceSecretsCommand();
    },
    installPrecommitHook: async () => {
      await installPrecommitHookCommand();
    },
    recommendModel: async () => {
      await recommendModelCommand(context);
    },
    showStats: async () => {
      await showStatsCommand(context);
    },
    resetStats: async () => {
      await resetStatsCommand(context, statusBar);
    },
  });

  registerChatParticipant(vscode, context, {
    loadSharedLibrary,
    getActiveEditor: () => vscode.window.activeTextEditor,
    getAnswerMode: () => vscode.workspace.getConfiguration('ceTokenKit').get('chat.answerMode', false),
    recordRun,
    statusBar,
    workspacePathForDocument,
    getSelectedText,
    formatDelta,
  });

  // @cetoken-concise is on by default (opt-in by @-mention) but can be pinned
  // off by policy to remove this model-calling surface for a Transform-only lockdown.
  const conciseEnabled = typeof vscode.workspace.getConfiguration === 'function'
    ? vscode.workspace.getConfiguration('ceTokenKit').get('concise.enabled', true)
    : true;
  if (conciseEnabled) {
    registerConciseParticipant(vscode, context, {
      loadSharedLibrary,
      getActiveEditor: () => vscode.window.activeTextEditor,
      getLevel: () => vscode.workspace.getConfiguration('ceTokenKit').get('concise.level', 'full'),
      getDebugReferences: () => vscode.workspace.getConfiguration('ceTokenKit').get('concise.debugReferences', false),
      recordRun,
      statusBar,
      workspacePathForDocument,
      getSelectedText,
      formatDelta,
    });
  }

  registerLanguageModelTool(vscode, context, {
    loadSharedLibrary,
    recordRun,
    statusBar,
  });

  // Apply org-configured custom secret patterns to the shared redactor, and
  // re-apply whenever the setting changes (no reload needed).
  const applyCustomSecretPatterns = async () => {
    try {
      const shared = await loadSharedLibrary();
      if (typeof shared.setCustomSecretPatterns === 'function') {
        shared.setCustomSecretPatterns(
          vscode.workspace.getConfiguration('ceTokenKit').get('secretPatterns', [])
        );
      }
    } catch {
      // A bad pattern config must never break activation.
    }
  };
  void applyCustomSecretPatterns();
  if (typeof vscode.workspace.onDidChangeConfiguration === 'function') {
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('ceTokenKit.secretPatterns')) {
          void applyCustomSecretPatterns();
        }
      })
    );
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  createDebouncedReadinessSaveHandler,
  parseMcpConfigSummary,
  shouldRecomputeReadinessForDocument,
  redactClipboardResult,
  showStatsCommand,
  buildStatusBarTooltip,
};