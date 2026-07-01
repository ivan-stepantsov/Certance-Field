const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function createFakeVscode(overrides = {}) {
  const saveListeners = [];
  const fakeVscode = {
    StatusBarAlignment: { Left: 1 },
    workspace: {
      workspaceFolders: [],
      getWorkspaceFolder(uri) {
        if (!uri || !uri.fsPath) {return null;}
        if (uri.fsPath.includes('/workspace/')) {
          return { uri: { fsPath: '/workspace/repo' } };
        }
        return null;
      },
      onDidSaveTextDocument(listener) {
        saveListeners.push(listener);
        return {
          dispose() {},
        };
      },
      ...overrides.workspace,
    },
    window: {
      createStatusBarItem() {
        return {
          command: null,
          text: '',
          tooltip: '',
          show() {},
          dispose() {},
        };
      },
      ...overrides.window,
    },
    commands: {
      registerCommand() {
        return {
          dispose() {},
        };
      },
      ...overrides.commands,
    },
    ...overrides,
  };

  return { fakeVscode, saveListeners };
}

function loadExtensionWithStubbedVscode(options = {}) {
  const originalLoad = Module._load;
  const { fakeVscode, saveListeners } = createFakeVscode(options.vscodeOverrides);

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return fakeVscode;
    }
    return originalLoad(request, parent, isMain);
  };

  const extensionPath = path.resolve(__dirname, '..', 'src', 'extension.cjs');
  delete require.cache[extensionPath];

  try {
    return {
      extension: require(extensionPath),
      fakeVscode,
      saveListeners,
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('parseMcpConfigSummary handles JSONC comments and trailing commas', () => {
  const { extension } = loadExtensionWithStubbedVscode();
  const { parseMcpConfigSummary } = extension;
  const summary = parseMcpConfigSummary(`{
    // comment before servers
    "servers": {
      "github": {
        "allowed_tools": ["list_pull_requests"],
        "defer_loading": true,
      },
      "playwright": {
        /* block comment */
        "allowed_tools": ["navigate"],
      },
    },
  }`);

  assert.deepEqual(summary, {
    serverCount: 2,
    allowlistServerCount: 2,
    deferredServerCount: 1,
    serverGaps: [{ name: 'playwright', needsAllowlist: false, needsDeferred: true }],
    serverNames: ['github', 'playwright'],
  });
});

test('shouldRecomputeReadinessForDocument targets key context files only', () => {
  const { extension } = loadExtensionWithStubbedVscode();
  const { shouldRecomputeReadinessForDocument } = extension;

  assert.equal(
    shouldRecomputeReadinessForDocument({ uri: { scheme: 'file', fsPath: '/workspace/repo/.github/copilot-instructions.md' } }),
    true
  );
  assert.equal(
    shouldRecomputeReadinessForDocument({ uri: { scheme: 'file', fsPath: '/workspace/repo/AGENTS.md' } }),
    true
  );
  assert.equal(
    shouldRecomputeReadinessForDocument({ uri: { scheme: 'file', fsPath: '/workspace/repo/.vscode/mcp.jsonc' } }),
    true
  );
  assert.equal(
    shouldRecomputeReadinessForDocument({ uri: { scheme: 'file', fsPath: '/workspace/repo/src/app.ts' } }),
    false
  );
});

test('activate wires a debounced readiness refresh on relevant saves', async () => {
  const { extension, saveListeners } = loadExtensionWithStubbedVscode();
  const { activate } = extension;
  const calls = [];
  const scheduled = [];
  const cleared = [];
  const context = {
    subscriptions: [],
    globalState: {
      get(_key, fallback) {
        return fallback;
      },
      async update() {},
    },
  };

  activate(context, {
    computeReadiness: async (_context, _statusBar, options) => {
      calls.push(options);
      return null;
    },
    readinessDebounceMs: 25,
    scheduleTimeout(callback, delayMs) {
      const handle = { callback, delayMs, cleared: false };
      scheduled.push(handle);
      return handle;
    },
    clearScheduledTimeout(handle) {
      handle.cleared = true;
      cleared.push(handle);
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(saveListeners.length, 1);

  const onSave = saveListeners[0];
  onSave({ uri: { scheme: 'file', fsPath: '/workspace/repo/.github/copilot-instructions.md' } });
  onSave({ uri: { scheme: 'file', fsPath: '/workspace/repo/.github/copilot-instructions.md' } });
  onSave({ uri: { scheme: 'file', fsPath: '/workspace/repo/src/app.ts' } });

  assert.equal(scheduled.length, 2);
  assert.equal(cleared.length, 1);
  assert.equal(calls.length, 1);

  for (const handle of scheduled) {
    if (!handle.cleared) {
      await handle.callback();
    }
  }

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { openDocument: false });
});
function statsContextWithStaleReadiness() {
  return {
    globalState: {
      get(_key, fallback) {
        // Global stats blob carries a STALE readiness from another window (99/100)
        // plus real cumulative token counts (1000 -> 200).
        return {
          ...fallback,
          totalBeforeTokens: 1000,
          totalAfterTokens: 200,
          contextReadiness: {
            verdict: 'Ready',
            score: 99,
            maxScore: 100,
            workspaceCount: 1,
            generatedAt: 'stale-other-window',
          },
        };
      },
      async update() {},
    },
  };
}

function captureOpenedDocuments() {
  const opened = [];
  return {
    opened,
    overrides: {
      workspace: {
        openTextDocument(options) {
          opened.push(options);
          return Promise.resolve({ ...options });
        },
      },
      window: {
        showTextDocument() {
          return Promise.resolve();
        },
      },
    },
  };
}

test('showStatsCommand renders live per-window readiness, not the stale global value', async () => {
  const { opened, overrides } = captureOpenedDocuments();
  const { extension } = loadExtensionWithStubbedVscode({ vscodeOverrides: overrides });
  const context = statsContextWithStaleReadiness();

  // Live report for THIS window's workspace scores 40/100 with one open gap.
  const liveReport = {
    generatedAt: 'live-this-window',
    workspaces: [{
      verdict: 'Needs attention',
      score: 40,
      maxScore: 100,
      signals: [
        { id: 'agentsPolicy', label: 'Agent policy', status: 'missing', weight: 15, earned: 0, detail: 'Missing AGENTS.md.', action: 'Add AGENTS.md.' },
      ],
    }],
  };
  await extension.showStatsCommand(context, async () => liveReport);

  const content = opened[0].content;
  assert.match(content, /Last score: 40\/100/, 'shows the live per-window score');
  assert.match(content, /Last verdict: Needs attention/);
  assert.doesNotMatch(content, /99\/100/, 'never shows the stale cross-window score');
  // Gaps are spelled out with points to close.
  assert.match(content, /Agent policy — MISSING 0\/15 \(\+15\): Add AGENTS\.md\./);
  // Token counts stay global and cumulative.
  assert.match(content, /Estimated tokens saved: 800/);
});

test('showStatsCommand omits readiness when no workspace is open', async () => {
  const { opened, overrides } = captureOpenedDocuments();
  const { extension } = loadExtensionWithStubbedVscode({ vscodeOverrides: overrides });
  const context = statsContextWithStaleReadiness();

  // No workspace folder -> builder returns null -> no readiness to attribute.
  await extension.showStatsCommand(context, async () => null);

  const content = opened[0].content;
  assert.doesNotMatch(content, /## Context Readiness/, 'no readiness section without a workspace');
  assert.doesNotMatch(content, /99\/100/, 'stale global readiness is not surfaced');
  assert.match(content, /Estimated tokens saved: 800/, 'global token counts still shown');
});

test('buildStatusBarTooltip names the single highest-impact readiness gap', () => {
  const { extension } = loadExtensionWithStubbedVscode();
  const tooltip = extension.buildStatusBarTooltip({
    totalBeforeTokens: 1000,
    totalAfterTokens: 200,
    contextReadiness: {
      verdict: 'Ready',
      score: 86,
      maxScore: 100,
      topGap: { label: 'MCP configuration', toClose: 7 },
    },
  });
  assert.match(tooltip, /Context readiness: Ready \(86\/100\)/);
  assert.match(tooltip, /Biggest gap: MCP configuration \(\+7\)\. Click for the full report\./);
  assert.match(tooltip, /Net token delta: 800/);
});

test('buildStatusBarTooltip reports a clean bill when there is no gap', () => {
  const { extension } = loadExtensionWithStubbedVscode();
  const tooltip = extension.buildStatusBarTooltip({
    totalBeforeTokens: 0,
    totalAfterTokens: 0,
    contextReadiness: { verdict: 'Ready', score: 100, maxScore: 100, topGap: null },
  });
  assert.match(tooltip, /All readiness signals pass\./);
  assert.doesNotMatch(tooltip, /Biggest gap/);
});

test('buildStatusBarTooltip shows "not checked yet" before any readiness run', () => {
  const { extension } = loadExtensionWithStubbedVscode();
  const tooltip = extension.buildStatusBarTooltip({
    totalBeforeTokens: 0,
    totalAfterTokens: 0,
    contextReadiness: null,
  });
  assert.match(tooltip, /Context readiness: not checked yet/);
});

test('buildStatusBarTooltip tolerates a legacy summary without a topGap field', () => {
  const { extension } = loadExtensionWithStubbedVscode();
  const tooltip = extension.buildStatusBarTooltip({
    totalBeforeTokens: 0,
    totalAfterTokens: 0,
    contextReadiness: { verdict: 'Needs attention', score: 40, maxScore: 100 },
  });
  assert.match(tooltip, /Context readiness: Needs attention \(40\/100\)/);
  assert.doesNotMatch(tooltip, /Biggest gap/);
  assert.doesNotMatch(tooltip, /All readiness signals pass/);
});

test('redactClipboardResult: empty clipboard reports nothing to do', () => {
  const { extension } = loadExtensionWithStubbedVscode();
  const r = extension.redactClipboardResult('   ', () => { throw new Error('should not run'); });
  assert.equal(r.status, 'empty');
  assert.match(r.message, /Clipboard is empty/);
});

test('redactClipboardResult: clean text is reported and left unchanged', () => {
  const { extension } = loadExtensionWithStubbedVscode();
  const fakeProtect = input => ({ output: input, redacted: false, totalRedactions: 0, findings: [] });
  const r = extension.redactClipboardResult('fix the failing test', fakeProtect);
  assert.equal(r.status, 'clean');
  assert.equal(r.output, undefined, 'nothing is written back when clean');
  assert.match(r.message, /No high-confidence secrets/);
});

test('redactClipboardResult: secrets are masked, counted, and named for write-back', () => {
  const { extension } = loadExtensionWithStubbedVscode();
  const fakeProtect = input => ({
    output: input.replace('ghp_REALTOKEN', '[REDACTED_GITHUB_TOKEN]'),
    redacted: true,
    totalRedactions: 1,
    findings: [{ id: 'github-token', count: 1 }],
  });
  const r = extension.redactClipboardResult('token=ghp_REALTOKEN', fakeProtect);
  assert.equal(r.status, 'redacted');
  assert.equal(r.output, 'token=[REDACTED_GITHUB_TOKEN]');
  assert.ok(!r.output.includes('ghp_REALTOKEN'));
  assert.match(r.message, /Redacted 1 secret value\(s\).*github-token/);
});
