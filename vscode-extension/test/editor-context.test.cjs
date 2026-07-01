const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function loadEditorContextWithStubbedVscode(getWorkspaceFolder) {
  const originalLoad = Module._load;
  const fakeVscode = { workspace: { getWorkspaceFolder } };
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return fakeVscode;
    }
    return originalLoad(request, parent, isMain);
  };
  const modPath = path.resolve(__dirname, '..', 'src', 'editor-context.cjs');
  delete require.cache[modPath];
  try {
    return require(modPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('workspacePathForDocument returns null for an untitled scratch buffer', () => {
  const { workspacePathForDocument } = loadEditorContextWithStubbedVscode(() => undefined);
  const doc = { isUntitled: true, fileName: 'Untitled-1', uri: { scheme: 'untitled' } };
  // Without this, "File: Untitled-1." was injected into optimized prompts.
  assert.equal(workspacePathForDocument(doc), null);
});

test('workspacePathForDocument returns null for non-file editors (git diff, output panel)', () => {
  const { workspacePathForDocument } = loadEditorContextWithStubbedVscode(() => undefined);
  const doc = { isUntitled: false, fileName: 'x', uri: { scheme: 'git' } };
  assert.equal(workspacePathForDocument(doc), null);
});

test('workspacePathForDocument returns a workspace-relative path for a tracked file', () => {
  const { workspacePathForDocument } = loadEditorContextWithStubbedVscode(
    () => ({ uri: { fsPath: '/repo' } })
  );
  const doc = { isUntitled: false, fileName: '/repo/src/auth.js', uri: { scheme: 'file' } };
  assert.equal(workspacePathForDocument(doc), 'src/auth.js');
});

test('workspacePathForDocument uses only the basename for a file outside the workspace (no absolute-path leak)', () => {
  const { workspacePathForDocument } = loadEditorContextWithStubbedVscode(() => undefined);
  const doc = { isUntitled: false, fileName: '/Users/someone/secret/notes.js', uri: { scheme: 'file' } };
  const result = workspacePathForDocument(doc);
  assert.equal(result, 'notes.js');
  assert.ok(!result.includes('/'), 'no path separators -> no local path leaked into the prompt');
});
