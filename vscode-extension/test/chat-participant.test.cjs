const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PARTICIPANT_ID,
  CONCISE_PARTICIPANT_ID,
  CONCISE_INSTRUCTION,
  CONCISE_LEVELS,
  buildConciseInstruction,
  fenceBlock,
  handleChatRequest,
  handleConciseRequest,
  buildReferenceResolver,
  registerChatParticipant,
} = require('../src/chat-participant.cjs');

function createStream() {
  const chunks = [];
  return {
    chunks,
    markdown(value) {
      chunks.push(value);
    },
    text() {
      return chunks.join('');
    },
  };
}

function formatDelta(beforeTokens, afterTokens) {
  return `saved ~${beforeTokens - afterTokens} tokens`;
}

test('handleChatRequest optimizes the prompt, folds in editor context, and records a chat run', async () => {
  const stream = createStream();
  const optimizeCalls = [];
  const recordCalls = [];

  const shared = {
    optimizePrompt(prompt, metadata) {
      optimizeCalls.push({ prompt, metadata });
      return {
        optimizedPrompt: '[Playwright/TypeScript] Fix the failing login test. File: tests/login.spec.ts.',
        beforeTokens: 90,
        afterTokens: 54,
        warnings: [],
      };
    },
    protectSecrets(input) {
      return { output: input, redacted: false, totalRedactions: 0, findings: [], mode: 'redact' };
    },
    buildPromptSkeletonId(prompt, metadata) {
      return `${prompt}|${metadata.file}`;
    },
  };

  const result = await handleChatRequest({
    request: { prompt: 'fix the failing login test' },
    stream,
    editor: { document: { fileName: '/workspace/tests/login.spec.ts' } },
    shared,
    workspacePathForDocument: () => 'tests/login.spec.ts',
    getSelectedText: () => 'await expect(page).toHaveURL("/dashboard")',
    recordRun: async details => {
      recordCalls.push(details);
    },
    formatDelta,
  });

  assert.equal(optimizeCalls.length, 1);
  assert.deepEqual(optimizeCalls[0], {
    prompt: 'fix the failing login test',
    metadata: {
      file: 'tests/login.spec.ts',
      selectionText: 'await expect(page).toHaveURL("/dashboard")',
    },
  });

  const out = stream.text();
  assert.match(out, /Optimized prompt/);
  assert.match(out, /\[Playwright\/TypeScript\] Fix the failing login test\./);
  assert.match(out, /saved ~36 tokens/);
  assert.match(out, /file `tests\/login\.spec\.ts`/);
  assert.match(out, /42 chars of selection/);

  assert.equal(recordCalls.length, 1);
  assert.equal(recordCalls[0].commandKey, 'chatOptimize');
  assert.equal(recordCalls[0].group, 'prompt');
  assert.equal(recordCalls[0].promptSkeletonId, 'fix the failing login test|tests/login.spec.ts');
  assert.equal(recordCalls[0].result.beforeTokens, 90);

  assert.deepEqual(result, { metadata: { command: 'optimize' } });
});

test('handleChatRequest shows a usage hint and does nothing for an empty prompt', async () => {
  const stream = createStream();
  let optimizeCalled = false;
  let recordCalled = false;

  const result = await handleChatRequest({
    request: { prompt: '   ' },
    stream,
    editor: null,
    shared: {
      optimizePrompt() {
        optimizeCalled = true;
        return {};
      },
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    recordRun: async () => {
      recordCalled = true;
    },
    formatDelta,
  });

  assert.equal(optimizeCalled, false);
  assert.equal(recordCalled, false);
  assert.match(stream.text(), /Select a long test failure, diff, or big file and run `@cetoken \/compress`/);
  assert.deepEqual(result, { metadata: { command: 'optimize', empty: true } });
});

test('handleChatRequest reports redacted secrets and surfaces optimizer warnings', async () => {
  const stream = createStream();

  await handleChatRequest({
    request: { prompt: 'debug this' },
    stream,
    editor: null,
    shared: {
      optimizePrompt() {
        return {
          optimizedPrompt: 'Debug this. Token: [REDACTED_GITHUB_TOKEN].',
          beforeTokens: 40,
          afterTokens: 30,
          warnings: ['Vague referent detected: add a file path or selection.'],
        };
      },
      protectSecrets(input) {
        return { output: input, redacted: true, totalRedactions: 1, findings: [], mode: 'redact' };
      },
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    recordRun: async () => {},
    formatDelta,
  });

  const out = stream.text();
  assert.match(out, /Redacted 1 high-confidence secret value/);
  assert.match(out, /Warnings/);
  assert.match(out, /Vague referent detected/);
});

test('registerChatParticipant returns null when the host lacks the Chat API', () => {
  const result = registerChatParticipant({}, { subscriptions: [] }, {});
  assert.equal(result, null);
});

test('registerChatParticipant registers a participant and disposes via subscriptions when the Chat API exists', () => {
  const created = [];
  const subscriptions = [];
  const fakeParticipant = { id: PARTICIPANT_ID, dispose() {} };

  const vscodeApi = {
    chat: {
      createChatParticipant(id, handler) {
        created.push({ id, handler });
        return fakeParticipant;
      },
    },
  };

  const participant = registerChatParticipant(vscodeApi, { subscriptions }, {
    loadSharedLibrary: async () => ({}),
    getActiveEditor: () => null,
    recordRun: async () => {},
    statusBar: {},
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    formatDelta,
  });

  assert.equal(created.length, 1);
  assert.equal(created[0].id, PARTICIPANT_ID);
  assert.equal(typeof created[0].handler, 'function');
  assert.equal(participant, fakeParticipant);
  assert.deepEqual(subscriptions, [fakeParticipant]);
});

test('handleChatRequest in answer mode sends the optimized prompt to the model instead of printing it', async () => {
  const stream = createStream();
  const answered = [];

  await handleChatRequest({
    request: { prompt: 'please fix the test' },
    stream,
    editor: null,
    shared: {
      optimizePrompt: () => ({ optimizedPrompt: 'Fix the test.', beforeTokens: 50, afterTokens: 30, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
      buildPromptSkeletonId: () => 'skeleton',
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    recordRun: async () => {},
    formatDelta,
    answerMode: true,
    answer: async ({ prompt }) => {
      answered.push(prompt);
      stream.markdown('MODEL ANSWER');
    },
  });

  assert.deepEqual(answered, ['Fix the test.']);
  const out = stream.text();
  assert.match(out, /Asking the model/);
  assert.match(out, /MODEL ANSWER/);
  assert.doesNotMatch(out, /copy this into Copilot Chat/);
});

test('the /compress command compresses the active selection and records a selection run', async () => {
  const stream = createStream();
  const records = [];

  const result = await handleChatRequest({
    request: { command: 'compress' },
    stream,
    editor: { document: { fileName: '/workspace/src/a.ts' } },
    shared: {
      optimizeSelectionText: () => ({ kind: 'code', output: 'function a() { return 1; }', beforeTokens: 80, afterTokens: 40, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'src/a.ts',
    getSelectedText: () => 'function a() { /* doc */ return 1; }',
    recordRun: async details => records.push(details),
    formatDelta,
  });

  const out = stream.text();
  assert.match(out, /Compressed code/);
  assert.match(out, /function a\(\) \{ return 1; \}/);
  assert.match(out, /saved ~40 tokens/);
  assert.equal(records.length, 1);
  assert.equal(records[0].commandKey, 'chatCompress');
  assert.equal(records[0].group, 'selection');
  assert.deepEqual(result, { metadata: { command: 'compress' } });
});

test('the /focus command builds a focused context pack and records a selection run', async () => {
  const stream = createStream();
  const records = [];

  const result = await handleChatRequest({
    request: { command: 'focus' },
    stream,
    editor: { document: { fileName: '/workspace/src/login.test.ts' } },
    shared: {
      buildContextPack: () => ({ kind: 'test', pack: '# Focused context — test failure\n\n## Assertion\nexpected 200 but got 401', beforeTokens: 120, afterTokens: 30 }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'src/login.test.ts',
    getSelectedText: () => 'FAIL ... AssertionError: expected 200 but got 401 ...',
    recordRun: async details => records.push(details),
    formatDelta,
  });

  const out = stream.text();
  assert.match(out, /Focused context pack\*\* \(test\)/);
  assert.match(out, /expected 200 but got 401/);
  assert.match(out, /saved ~90 tokens/);
  assert.equal(records.length, 1);
  assert.equal(records[0].commandKey, 'chatFocus');
  assert.equal(records[0].group, 'selection');
  assert.deepEqual(result, { metadata: { command: 'focus' } });
});

test('slash commands ask for a selection when none is active and do not record a run', async () => {
  const stream = createStream();
  let recorded = false;

  const result = await handleChatRequest({
    request: { command: 'compress' },
    stream,
    editor: { document: { fileName: '/workspace/src/a.ts' } },
    shared: {
      optimizeSelectionText: () => {
        throw new Error('should not compress without a selection');
      },
      protectSecrets: input => ({ output: input }),
    },
    workspacePathForDocument: () => 'src/a.ts',
    getSelectedText: () => '',
    recordRun: async () => {
      recorded = true;
    },
    formatDelta,
  });

  assert.match(stream.text(), /Select the code, diff, or stack trace/);
  assert.equal(recorded, false);
  assert.deepEqual(result, { metadata: { command: 'compress', empty: true } });
});

test('the /review command frames the diff and asks the model in answer mode', async () => {
  const stream = createStream();
  const answered = [];

  await handleChatRequest({
    request: { command: 'review' },
    stream,
    editor: { document: { fileName: '/workspace/a.ts' } },
    shared: {
      optimizeSelectionText: () => ({ kind: 'diff', output: '+ added a guard clause', beforeTokens: 60, afterTokens: 50, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'a.ts',
    getSelectedText: () => 'diff --git a/a.ts b/a.ts',
    recordRun: async () => {},
    formatDelta,
    answerMode: true,
    answer: async ({ prompt }) => {
      answered.push(prompt);
    },
  });

  assert.equal(answered.length, 1);
  assert.match(answered[0], /Review this diff\. List the highest-risk findings first\./);
  assert.match(answered[0], /\+ added a guard clause/);
});

test('the /review command warns on a non-diff selection and streams the framed prompt in transform mode', async () => {
  const stream = createStream();

  await handleChatRequest({
    request: { command: 'review' },
    stream,
    editor: { document: { fileName: '/workspace/a.ts' } },
    shared: {
      optimizeSelectionText: () => ({ kind: 'code', output: 'const x = 1;', beforeTokens: 10, afterTokens: 8, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'a.ts',
    getSelectedText: () => 'const x = 1;',
    recordRun: async () => {},
    formatDelta,
    answerMode: false,
  });

  const out = stream.text();
  assert.match(out, /does not look like a diff/);
  assert.match(out, /Review this diff/);
  assert.match(out, /copy this into Copilot Chat/);
});

test('handleChatRequest nudges to promote a prompt shape once it has recurred', async () => {
  const stream = createStream();

  await handleChatRequest({
    request: { prompt: 'fix the failing auth test' },
    stream,
    editor: null,
    shared: {
      optimizePrompt: () => ({ optimizedPrompt: 'Fix the failing auth test.', beforeTokens: 30, afterTokens: 20, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
      buildPromptSkeletonId: () => 'psk_abc123',
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    recordRun: async () => ({ skeletonCounts: { psk_abc123: 3 } }),
    formatDelta,
  });

  const out = stream.text();
  assert.match(out, /sent this kind of prompt 3×/);
  assert.match(out, /copilot-instructions\.md/);
});

test('handleChatRequest does not nudge before the recurrence threshold', async () => {
  const stream = createStream();

  await handleChatRequest({
    request: { prompt: 'fix the failing auth test' },
    stream,
    editor: null,
    shared: {
      optimizePrompt: () => ({ optimizedPrompt: 'Fix.', beforeTokens: 10, afterTokens: 8, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
      buildPromptSkeletonId: () => 'psk_abc123',
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    recordRun: async () => ({ skeletonCounts: { psk_abc123: 2 } }),
    formatDelta,
  });

  assert.doesNotMatch(stream.text(), /sent this kind of prompt/);
});

test('the /outline command outlines the selection via the outline compressor', async () => {
  const stream = createStream();
  const records = [];
  let usedMode;

  const result = await handleChatRequest({
    request: { command: 'outline' },
    stream,
    editor: { document: { fileName: '/workspace/Service.ts' } },
    shared: {
      compressContent: (text, opts) => {
        usedMode = opts.mode;
        return { mode: 'outline', output: 'export class Service {\n  charge(): void { /* … */ }\n}', beforeTokens: 240, afterTokens: 40, ratio: 83, language: 'ts' };
      },
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'Service.ts',
    getSelectedText: () => 'export class Service { charge(): void { /* ...40 lines... */ } }',
    recordRun: async details => records.push(details),
    formatDelta,
  });

  assert.equal(usedMode, 'outline', 'must request the outline compression mode');
  const out = stream.text();
  assert.match(out, /Outline/);
  assert.match(out, /charge\(\): void \{ \/\* … \*\/ \}/);
  assert.equal(records[0].commandKey, 'chatOutline');
  assert.equal(records[0].group, 'selection');
  assert.deepEqual(result, { metadata: { command: 'outline' } });
});

test('the /explain command compresses a small selection and asks for a concise explanation', async () => {
  const stream = createStream();

  await handleChatRequest({
    request: { command: 'explain' },
    stream,
    editor: { document: { fileName: '/workspace/snippet.ts' } },
    shared: {
      explainSelection: () => ({ kind: 'code', outlined: false, output: 'const x = 1;', beforeTokens: 60, afterTokens: 58, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'snippet.ts',
    getSelectedText: () => 'const x = 1;',
    recordRun: async () => {},
    formatDelta,
  });

  assert.match(stream.text(), /Explain this concisely/);
  assert.doesNotMatch(stream.text(), /explained from its outline/);
});

test('the /explain command outlines a large selection and asks for a structural explanation', async () => {
  const stream = createStream();

  await handleChatRequest({
    request: { command: 'explain' },
    stream,
    editor: { document: { fileName: '/workspace/Service.ts' } },
    shared: {
      explainSelection: () => ({ kind: 'code', outlined: true, output: 'export class Service {\n  charge(): void { /* … */ }\n}', beforeTokens: 1200, afterTokens: 200, ratio: 83, language: 'ts', warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'Service.ts',
    getSelectedText: () => 'export class Service { /* ...500 lines... */ }',
    recordRun: async () => {},
    formatDelta,
  });

  const out = stream.text();
  assert.match(out, /responsibilities, the main pieces/);
  assert.match(out, /explained from its outline/);
});

test('the /compress command surfaces the redaction warning when a secret is masked', async () => {
  const stream = createStream();

  await handleChatRequest({
    request: { command: 'compress' },
    stream,
    editor: { document: { fileName: '/workspace/auth.log' } },
    shared: {
      optimizeSelectionText: () => ({ kind: 'output', output: 'token=ghp_live', beforeTokens: 20, afterTokens: 12, warnings: [] }),
      protectSecrets: () => ({ output: 'token=[REDACTED_GITHUB_TOKEN]', redacted: true, totalRedactions: 1 }),
    },
    workspacePathForDocument: () => 'auth.log',
    getSelectedText: () => 'token=ghp_live',
    recordRun: async () => {},
    formatDelta,
  });

  const out = stream.text();
  assert.match(out, /Redacted 1 high-confidence secret value/, 'slash command must report redaction, not redact silently');
  assert.match(out, /\[REDACTED_GITHUB_TOKEN\]/);
  assert.doesNotMatch(out, /ghp_live/, 'the secret value must not appear in the output');
});

test('a slash command falls back to attached chat references when nothing is highlighted', async () => {
  const stream = createStream();
  const records = [];
  let resolvedRefs;

  await handleChatRequest({
    request: { command: 'compress', references: [{ value: { path: '/workspace/big.log' } }] },
    stream,
    editor: { document: { fileName: '/workspace/current.ts' } },
    shared: {
      optimizeSelectionText: (text) => {
        assert.match(text, /big log content/);
        return { kind: 'output', output: '[ERROR] one line', beforeTokens: 800, afterTokens: 60, warnings: [] };
      },
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'current.ts',
    getSelectedText: () => '',
    resolveReferences: async refs => {
      resolvedRefs = refs;
      return { text: 'big log content here', file: 'big.log' };
    },
    recordRun: async details => records.push(details),
    formatDelta,
  });

  const out = stream.text();
  assert.match(out, /Compressed output/);
  assert.doesNotMatch(out, /Select the code/, 'should not show the no-selection hint when a reference resolved');
  assert.equal(records.length, 1);
  assert.equal(records[0].commandKey, 'chatCompress');
  assert.equal(resolvedRefs.length, 1);
});

test('buildReferenceResolver reads a #file Uri, a #selection Location, and a string', async () => {
  const vscodeApi = {
    workspace: {
      async openTextDocument() {
        return {
          uri: { fsPath: '/workspace/file.ts' },
          getText(range) {
            return range ? 'selected slice' : 'whole file contents';
          },
        };
      },
    },
  };
  const resolve = buildReferenceResolver(vscodeApi, () => 'file.ts');

  const fileRef = await resolve([{ value: { path: '/workspace/file.ts', fsPath: '/workspace/file.ts' } }]);
  assert.deepEqual(fileRef, { text: 'whole file contents', file: 'file.ts' });

  const selRef = await resolve([{ value: { uri: { path: '/workspace/file.ts' }, range: { start: 0, end: 1 } } }]);
  assert.equal(selRef.text, 'selected slice');

  const strRef = await resolve([{ value: 'inline reference text' }]);
  assert.deepEqual(strRef, { text: 'inline reference text', file: null });

  assert.equal(await resolve([]), null);
});

test('buildReferenceResolver returns null when the host cannot open documents', () => {
  assert.equal(buildReferenceResolver({}, () => null), null);
});

test('CONCISE_PARTICIPANT_ID is derived from the base participant id', () => {
  assert.equal(CONCISE_PARTICIPANT_ID, `${PARTICIPANT_ID}-concise`);
});

test('@cetoken-concise prepends the caveman instruction, folds in context, and answers', async () => {
  const stream = createStream();
  const answered = [];
  const recorded = [];

  await handleConciseRequest({
    request: { command: undefined, prompt: 'why is this login test flaky?' },
    stream,
    editor: { document: { fileName: '/workspace/tests/login.spec.ts' } },
    shared: {
      optimizePrompt: () => ({ optimizedPrompt: 'why is this login test flaky?', beforeTokens: 40, afterTokens: 30, warnings: [] }),
      optimizeSelectionText: (text) => ({ kind: 'code', output: text, beforeTokens: 40, afterTokens: 30, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'tests/login.spec.ts',
    getSelectedText: () => 'await page.click("#login");',
    recordRun: async details => { recorded.push(details); },
    formatDelta,
    answer: async ({ prompt }) => { answered.push(prompt); },
  });

  assert.equal(answered.length, 1, 'concise mode must call the model');
  assert.ok(answered[0].startsWith(CONCISE_INSTRUCTION), 'the caveman instruction must lead the prompt');
  assert.match(answered[0], /why is this login test flaky\?/);
  assert.match(answered[0], /await page\.click\("#login"\);/, 'the selected code must be embedded for the model to see');
  assert.match(stream.text(), /Concise mode/);
  assert.match(stream.text(), /Folded in your selection \(27 chars\)/);
  assert.match(stream.text(), /deselect/);
  assert.equal(recorded[0].commandKey, 'chatConcise');
});

test('@cetoken-concise does NOT fold in the open file when nothing is selected', async () => {
  const stream = createStream();
  let embedded = false;

  await handleConciseRequest({
    request: { prompt: 'why is playwright better than selenium?' },
    stream,
    editor: { document: { fileName: '/workspace/src/OrderService.ts' } },
    shared: {
      optimizePrompt: prompt => ({ optimizedPrompt: prompt, beforeTokens: 12, afterTokens: 11, warnings: [] }),
      optimizeSelectionText: () => { embedded = true; return { output: 'x', beforeTokens: 1, afterTokens: 1, warnings: [] }; },
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'src/OrderService.ts',
    getSelectedText: () => '', // an open file but NOTHING selected
    recordRun: async () => {},
    formatDelta,
    answer: async () => {},
  });

  // With nothing selected/attached, no content is compressed+embedded and nothing folds in.
  assert.equal(embedded, false, 'the merely-open file must not be embedded');
  assert.doesNotMatch(stream.text(), /Folded in/);
});

// The mock honors a reference only if at least one survives concise's
// intentional-context filter, so these tests actually exercise the filtering.
const conciseRefShared = () => ({
  optimizePrompt: prompt => ({ optimizedPrompt: prompt, beforeTokens: 30, afterTokens: 25, warnings: [] }),
  optimizeSelectionText: (text) => ({ kind: 'code', output: text, beforeTokens: 30, afterTokens: 25, warnings: [] }),
  protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
});
const conciseRefResolver = async references =>
  (Array.isArray(references) && references.length ? { text: 'export const TAX = 0.2;', file: 'config.ts' } : null);

test('@cetoken-concise folds in an explicitly typed #file reference (has a prompt range)', async () => {
  const stream = createStream();
  const answered = [];

  await handleConciseRequest({
    request: { prompt: 'what does this do? #file:config.ts', references: [{ id: 'vscode.file', range: [18, 33] }] },
    stream,
    editor: null,
    shared: conciseRefShared(),
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    resolveReferences: conciseRefResolver,
    dropAutoContext: true,
    recordRun: async () => {},
    formatDelta,
    answer: async ({ prompt }) => { answered.push(prompt); },
  });

  assert.match(answered[0], /export const TAX = 0\.2;/, 'a typed #file reference must be included');
  assert.match(stream.text(), /Folded in your attached `config\.ts`/);
  assert.match(stream.text(), /remove the chip/);
});

test('@cetoken-concise folds in a deliberately attached file chip (raw-URI id, no range)', async () => {
  const stream = createStream();
  const answered = [];

  await handleConciseRequest({
    request: { prompt: 'what does this do?', references: [{ id: 'file:///w/config.ts', value: { path: '/w/config.ts' } }] },
    stream,
    editor: null,
    shared: conciseRefShared(),
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    resolveReferences: conciseRefResolver,
    dropAutoContext: true,
    recordRun: async () => {},
    formatDelta,
    answer: async ({ prompt }) => { answered.push(prompt); },
  });

  assert.match(answered[0], /export const TAX = 0\.2;/, 'a chip the user attached must be included');
  assert.match(stream.text(), /Folded in your attached/);
});

test('@cetoken-concise drops auto-added workspace context (instructions, customizations, implicit)', async () => {
  const stream = createStream();
  const answered = [];

  await handleConciseRequest({
    request: { prompt: 'why is playwright better than selenium?', references: [
      { id: 'vscode.instructions.file.root__file:///w/.github/copilot-instructions.md', value: { path: '/w/.github/copilot-instructions.md' } },
      { id: 'vscode.customizations.index', value: 'x'.repeat(12099) },
      { id: 'vscode.implicit.selection', value: { uri: { path: '/w/a.ts' }, range: {} } },
    ] },
    stream,
    editor: null,
    shared: conciseRefShared(),
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    resolveReferences: conciseRefResolver,
    dropAutoContext: true,
    recordRun: async () => {},
    formatDelta,
    answer: async ({ prompt }) => { answered.push(prompt); },
  });

  assert.doesNotMatch(answered[0], /export const TAX/, 'auto-added workspace context must NOT leak in');
  assert.doesNotMatch(stream.text(), /Folded in/);
});

test('@cetoken-concise hands back a copyable prompt when no model is available', async () => {
  const stream = createStream();

  await handleConciseRequest({
    request: { prompt: 'explain this' },
    stream,
    editor: null,
    shared: {
      optimizePrompt: () => ({ optimizedPrompt: 'explain this', beforeTokens: 10, afterTokens: 9, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    recordRun: async () => {},
    formatDelta,
    answer: null,
  });

  const out = stream.text();
  assert.match(out, /Concise prompt/);
  assert.match(out, /no model access granted yet/);
  assert.match(out, /a few short sentences or tight bullets/);
});

test('@cetoken-concise shows guidance when the prompt is empty', async () => {
  const stream = createStream();
  let answeredOrRecorded = false;

  const result = await handleConciseRequest({
    request: { prompt: '   ' },
    stream,
    editor: null,
    shared: { optimizePrompt: () => { answeredOrRecorded = true; return {}; }, protectSecrets: i => ({ output: i }) },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    recordRun: async () => { answeredOrRecorded = true; },
    formatDelta,
    answer: async () => { answeredOrRecorded = true; },
  });

  assert.equal(answeredOrRecorded, false, 'an empty prompt must not call the model or optimizer');
  assert.match(stream.text(), /Type your question after/);
  assert.deepEqual(result, { metadata: { command: 'concise', empty: true } });
});

test('every concise level keeps the reason-fully + verbatim + safety rails', () => {
  for (const level of Object.keys(CONCISE_LEVELS)) {
    const instruction = buildConciseInstruction(level);
    // Research-backed rail: compress wording, not reasoning.
    assert.match(instruction, /brevity must not drop necessary content/, `${level} must keep the reason-fully rail`);
    assert.match(instruction, /exactly as written/, `${level} must keep the verbatim-preservation rail`);
    assert.match(instruction, /fenced ``` code block/, `${level} must keep the fenced-code rail`);
    assert.match(instruction, /security warnings/, `${level} must keep the safety carve-out`);
    assert.match(instruction, /never omit a caveat that affects correctness or safety/, `${level} must keep the safety floor`);
    // Anti-boilerplate rail: strip the fixed per-turn overhead (re-explaining given
    // code, closing recap, disclaimers, the trailing "want me to…?" offer)…
    assert.match(instruction, /offer of further help/, `${level} must keep the no-trailing-offer rail`);
    // …but never at the cost of a false-premise correction.
    assert.match(instruction, /never cut a one-line correction when the question assumes something false/, `${level} must keep the false-premise carve-out`);
  }
});

test('ultra level is retired and aliased to full (identical instruction)', () => {
  assert.equal(
    buildConciseInstruction('ultra'),
    buildConciseInstruction('full'),
    'ultra must produce exactly the full instruction (retired: it measured longer than full)'
  );
});

test('buildConciseInstruction falls back to full for an unknown level', () => {
  assert.equal(buildConciseInstruction('bogus'), CONCISE_INSTRUCTION);
});

test('@cetoken-concise maps ultra to full and shows the alias honestly in the footer', async () => {
  const stream = createStream();
  const answered = [];

  await handleConciseRequest({
    request: { prompt: 'explain connection pooling' },
    stream,
    editor: null,
    shared: {
      optimizePrompt: () => ({ optimizedPrompt: 'explain connection pooling', beforeTokens: 20, afterTokens: 18, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    getLevel: () => 'ultra',
    recordRun: async () => {},
    formatDelta,
    answer: async ({ prompt }) => { answered.push(prompt); },
  });

  assert.ok(answered[0].startsWith(buildConciseInstruction('full')), 'ultra must deliver the full instruction (aliased)');
  assert.match(stream.text(), /Concise mode \(ultra → full\)/);
});

// Loads the REAL shared inferResponseShape (the shipped mirror) so these glue
// tests exercise the actual Phare guard + soft-hint logic end-to-end, not a stub.
async function loadRealInferResponseShape() {
  const path = require('node:path');
  const { pathToFileURL } = require('node:url');
  const file = path.resolve(__dirname, '..', 'src', 'shared', 'lib', 'prompt-shape.js');
  const mod = await import(pathToFileURL(file).href);
  return mod.inferResponseShape;
}

test('@cetoken-concise wires the soft response-shape hint into a plain question (no context)', async () => {
  const inferResponseShape = await loadRealInferResponseShape();
  const stream = createStream();
  const answered = [];

  await handleConciseRequest({
    request: { prompt: 'What is database connection pooling?' },
    stream,
    editor: null,
    shared: {
      inferResponseShape,
      // Mirror how the real optimizePrompt folds the format slot in: echo the
      // output metadata the glue hands it, so the hint appears exactly once.
      optimizePrompt: (prompt, meta) => ({
        optimizedPrompt: meta && meta.output ? `${prompt}\n\n${meta.output}` : prompt,
        beforeTokens: 12,
        afterTokens: 11,
        warnings: [],
      }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    recordRun: async () => {},
    formatDelta,
    answer: async ({ prompt }) => { answered.push(prompt); },
  });

  assert.match(answered[0], /Lead with the answer/);
  assert.match(answered[0], /≤3 sentences/);
});

test('@cetoken-concise injects the Phare completeness line (not a brevity hint) for a false-premise question', async () => {
  const inferResponseShape = await loadRealInferResponseShape();
  const stream = createStream();
  const answered = [];

  await handleConciseRequest({
    request: { prompt: "Isn't it true that JavaScript passes objects by value?" },
    stream,
    editor: null,
    shared: {
      inferResponseShape,
      optimizePrompt: (prompt, meta) => ({
        optimizedPrompt: meta && meta.output ? `${prompt}\n\n${meta.output}` : prompt,
        beforeTokens: 12,
        afterTokens: 11,
        warnings: [],
      }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    recordRun: async () => {},
    formatDelta,
    answer: async ({ prompt }) => { answered.push(prompt); },
  });

  assert.match(answered[0], /Answer completely/, 'false-premise prompt must get the completeness line');
  // "aim for" is the signature of a soft length hint; it must be absent here.
  // (Not asserting on "Lead with the answer" — that phrase lives in CONCISE_CORE.)
  assert.doesNotMatch(answered[0], /aim for/i, 'brevity length hint must stay OFF for a false-premise prompt');
});

test('@cetoken-concise appends the shape hint after an embedded selection (with context)', async () => {
  const inferResponseShape = await loadRealInferResponseShape();
  const stream = createStream();
  const answered = [];

  await handleConciseRequest({
    request: { prompt: 'What does this function do?' },
    stream,
    editor: { document: { fileName: '/workspace/src/util.ts' } },
    shared: {
      inferResponseShape,
      optimizeSelectionText: text => ({ kind: 'code', output: text, beforeTokens: 20, afterTokens: 18, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'src/util.ts',
    getSelectedText: () => 'export const f = x => x + 1;',
    recordRun: async () => {},
    formatDelta,
    answer: async ({ prompt }) => { answered.push(prompt); },
  });

  assert.match(answered[0], /export const f = x => x \+ 1;/, 'the selection must be embedded');
  assert.match(answered[0], /Aim for ≤150 tokens|aim for ≤3 sentences|Lead with the answer/, 'a soft shape hint must be appended after the selection');
});

test('@cetoken-concise prints reference diagnostics when concise.debugReferences is on', async () => {
  const stream = createStream();

  await handleConciseRequest({
    request: { prompt: 'hi', references: [
      { id: 'vscode.implicit.file', value: { path: '/w/open.ts' } },
      { id: 'vscode.file', range: [3, 12], value: { path: '/w/config.ts' } },
    ] },
    stream,
    editor: null,
    shared: {
      optimizePrompt: () => ({ optimizedPrompt: 'hi', beforeTokens: 1, afterTokens: 1, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    resolveReferences: async () => null,
    explicitReferencesOnly: true,
    getDebugReferences: () => true,
    recordRun: async () => {},
    formatDelta,
    answer: async () => {},
  });

  const out = stream.text();
  assert.match(out, /ref-debug: 2 reference/);
  assert.match(out, /id=`vscode\.implicit\.file` · typed=no/);
  assert.match(out, /id=`vscode\.file` · typed=yes \[3,12\]/);
  assert.match(out, /current filter: dropped/);
  assert.match(out, /current filter: \*\*KEPT\*\*/);
});

const TICK3 = '`'.repeat(3);
const TICK4 = '`'.repeat(4);
const TICK5 = '`'.repeat(5);

test('fenceBlock wraps plain content in a standard triple-backtick fence', () => {
  assert.equal(fenceBlock('hello world', 'text'), `${TICK3}text\nhello world\n${TICK3}`);
  assert.equal(fenceBlock('plain'), `${TICK3}\nplain\n${TICK3}`);
});

test('fenceBlock escalates the fence one longer than the longest backtick run inside', () => {
  const innerTriple = `see ${TICK3}js\ncode\n${TICK3} here`;   // longest run = 3
  const wrappedTriple = fenceBlock(innerTriple);
  assert.ok(wrappedTriple.startsWith(`${TICK4}\n`), 'opens with 4 backticks');
  assert.ok(wrappedTriple.endsWith(`\n${TICK4}`), 'closes with 4 backticks');
  assert.ok(wrappedTriple.includes(innerTriple), 'inner backticks survive un-escaped');

  const innerQuad = `a ${TICK4} b`;                            // longest run = 4
  const wrappedQuad = fenceBlock(innerQuad, 'text');
  assert.ok(wrappedQuad.startsWith(`${TICK5}text\n`), 'opens with 5 backticks');
  assert.ok(wrappedQuad.endsWith(`\n${TICK5}`), 'closes with 5 backticks');
});

test('@cetoken /compress fences content that itself contains a code fence so it cannot break out', async () => {
  const stream = createStream();
  const compressed = `intro\n${TICK3}js\nconst x = 1;\n${TICK3}\noutro`;

  const result = await handleChatRequest({
    request: { command: 'compress' },
    stream,
    editor: { document: { fileName: '/workspace/notes.md' } },
    shared: {
      optimizeSelectionText: () => ({ kind: 'output', output: compressed, beforeTokens: 50, afterTokens: 30, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'notes.md',
    getSelectedText: () => 'whatever',
    recordRun: async () => {},
    formatDelta,
  });

  // The display wrapper must escalate to a 4-backtick fence so the inner ``` block
  // renders inside it instead of closing the "copy this" block early.
  assert.ok(stream.text().includes(`${TICK4}text\n${compressed}\n${TICK4}`), 'content wrapped in an escalated fence');
  assert.deepEqual(result, { metadata: { command: 'compress' } });
});

test('@cetoken /explain does not double-wrap a same-length fence (outer must exceed inner)', async () => {
  const stream = createStream();
  const code = 'const x = 1;';

  await handleChatRequest({
    request: { command: 'explain' },
    stream,
    editor: { document: { fileName: '/workspace/a.ts' } },
    shared: {
      explainSelection: () => ({ kind: 'code', outlined: false, language: 'ts', output: code, beforeTokens: 20, afterTokens: 18, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
    },
    workspacePathForDocument: () => 'a.ts',
    getSelectedText: () => code,
    recordRun: async () => {},
    formatDelta,
    answerMode: false,
  });

  const out = stream.text();
  // Inner block fences the code at 3 backticks; the transform-mode wrapper that
  // shows the whole prompt must therefore open at 4+ backticks, never 3.
  assert.ok(out.includes(`${TICK3}ts\n${code}\n${TICK3}`), 'inner code fenced at 3 backticks');
  assert.ok(out.includes(`${TICK4}text\n`), 'outer wrapper escalates past the inner fence');
});

test('handleChatRequest shows the redaction receipt BEFORE the model call (answer mode)', async () => {
  const stream = createStream();

  await handleChatRequest({
    request: { prompt: 'use ghp_token' },
    stream,
    editor: null,
    shared: {
      optimizePrompt: () => ({
        optimizedPrompt: 'Use [REDACTED_GITHUB_TOKEN].',
        beforeTokens: 20,
        afterTokens: 18,
        warnings: ['High-confidence secret patterns were redacted locally (1 match(es): github-token).'],
      }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
      buildPromptSkeletonId: () => 'sk',
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    recordRun: async () => {},
    formatDelta,
    answerMode: true,
    answer: async () => { stream.markdown('MODEL ANSWER'); },
  });

  const out = stream.text();
  const redactIdx = out.indexOf('redacted locally');
  const askIdx = out.indexOf('Asking the model');
  assert.ok(redactIdx >= 0, 'the redaction receipt must be shown');
  assert.ok(askIdx >= 0, 'the model-call notice must be shown');
  assert.ok(redactIdx < askIdx, 'redaction receipt must precede the model call');
});

test('handleChatRequest reframes a token increase as "structured for clarity", not "added"', async () => {
  const stream = createStream();

  await handleChatRequest({
    request: { prompt: 'hi' },
    stream,
    editor: null,
    shared: {
      optimizePrompt: () => ({ optimizedPrompt: '[lang] hi, with added structure', beforeTokens: 10, afterTokens: 34, warnings: [] }),
      protectSecrets: input => ({ output: input, redacted: false, totalRedactions: 0 }),
      buildPromptSkeletonId: () => 'sk',
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    recordRun: async () => {},
    formatDelta,
  });

  const out = stream.text();
  assert.match(out, /structured for clarity \(\+24 tokens\)/);
  assert.doesNotMatch(out, /added ~/);
});

test('handleChatRequest never nudges or stores the raw prompt when secrets were redacted', async () => {
  const stream = createStream();
  let skeletonInput = null;

  await handleChatRequest({
    request: { prompt: 'use ghp_realtoken123456 please' },
    stream,
    editor: null,
    shared: {
      optimizePrompt: () => ({
        optimizedPrompt: 'Use [REDACTED_GITHUB_TOKEN] please.',
        beforeTokens: 30,
        afterTokens: 28,
        warnings: ['High-confidence secret patterns were redacted locally (1 match(es): github-token).'],
      }),
      protectSecrets: input => {
        const hit = input.includes('ghp_');
        return {
          output: hit ? input.replace(/ghp_\w+/, '[REDACTED_GITHUB_TOKEN]') : input,
          redacted: hit,
          totalRedactions: hit ? 1 : 0,
          findings: [],
        };
      },
      buildPromptSkeletonId: text => { skeletonInput = text; return 'skel'; },
    },
    workspacePathForDocument: () => null,
    getSelectedText: () => '',
    recordRun: async () => ({ skeletonCounts: { skel: 5 } }), // would normally trigger the nudge
    formatDelta,
  });

  const out = stream.text();
  assert.doesNotMatch(out, /Promote/, 'must NOT nudge to promote a secret-bearing prompt');
  assert.doesNotMatch(out, /ghp_realtoken/, 'the raw token must never be echoed');
  assert.ok(skeletonInput && !skeletonInput.includes('ghp_realtoken'), 'skeleton must be built from the redacted prompt');
  assert.match(skeletonInput, /\[REDACTED_GITHUB_TOKEN\]/, 'skeleton uses the redacted form');
});
