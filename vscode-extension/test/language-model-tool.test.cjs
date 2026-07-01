const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TOOL_NAME,
  invokeCompressTool,
  registerLanguageModelTool,
} = require('../src/language-model-tool.cjs');

// Fake result factory mirroring vscode.LanguageModelToolResult — captures the
// text the tool hands back to the model.
function makeResult(text, meta) {
  return { text, meta };
}

test('invokeCompressTool compresses content, redacts secrets, records a run, and returns a visible note', async () => {
  const records = [];

  const result = await invokeCompressTool({
    input: { content: 'function a() { /* doc */ return 1; }', filename: 'a.ts' },
    shared: {
      optimizeSelectionText(content, metadata) {
        assert.equal(metadata.filename, 'a.ts');
        return { kind: 'code', output: 'function a() { return 1; }', beforeTokens: 80, afterTokens: 40, warnings: [] };
      },
      protectSecrets(input) {
        return { output: input, redacted: false, totalRedactions: 0 };
      },
    },
    recordRun: async details => records.push(details),
    makeResult,
  });

  assert.match(result.text, /Compressed code: 80 -> 40 tokens\./);
  assert.match(result.text, /function a\(\) \{ return 1; \}/);
  assert.equal(records.length, 1);
  assert.equal(records[0].commandKey, 'agentCompress');
  assert.equal(records[0].group, 'selection');
  assert.equal(records[0].result.afterTokens, 40);
});

test('invokeCompressTool returns a clear message and records nothing for empty content', async () => {
  let recorded = false;

  const result = await invokeCompressTool({
    input: { content: '   ' },
    shared: {
      optimizeSelectionText() {
        throw new Error('should not compress empty content');
      },
      protectSecrets: input => ({ output: input }),
    },
    recordRun: async () => {
      recorded = true;
    },
    makeResult,
  });

  assert.match(result.text, /No content was provided to compress/);
  assert.equal(recorded, false);
});

test('invokeCompressTool redacts secrets in the compressed output it returns to the model', async () => {
  const result = await invokeCompressTool({
    input: { content: 'const token = "ghp_live"' },
    shared: {
      optimizeSelectionText() {
        return { kind: 'code', output: 'const token = "ghp_live"', beforeTokens: 12, afterTokens: 12, warnings: [] };
      },
      protectSecrets() {
        return { output: 'const token = "[REDACTED_GITHUB_TOKEN]"', redacted: true, totalRedactions: 1 };
      },
    },
    recordRun: async () => {},
    makeResult,
  });

  assert.match(result.text, /\[REDACTED_GITHUB_TOKEN\]/);
  assert.doesNotMatch(result.text, /ghp_live/);
});

test('registerLanguageModelTool returns null when the host lacks the Language Model API', () => {
  const result = registerLanguageModelTool({}, { subscriptions: [] }, {});
  assert.equal(result, null);
});

test('registerLanguageModelTool registers ce_compress and disposes via subscriptions when the API exists', () => {
  const registered = [];
  const subscriptions = [];
  const fakeRegistration = { dispose() {} };

  const vscodeApi = {
    lm: {
      registerTool(name, tool) {
        registered.push({ name, tool });
        return fakeRegistration;
      },
    },
    LanguageModelToolResult: class {
      constructor(parts) {
        this.parts = parts;
      }
    },
    LanguageModelTextPart: class {
      constructor(value) {
        this.value = value;
      }
    },
  };

  const registration = registerLanguageModelTool(vscodeApi, { subscriptions }, {
    loadSharedLibrary: async () => ({}),
    recordRun: async () => {},
    statusBar: {},
  });

  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, TOOL_NAME);
  assert.equal(typeof registered[0].tool.invoke, 'function');
  assert.equal(registration, fakeRegistration);
  assert.deepEqual(subscriptions, [fakeRegistration]);
});
