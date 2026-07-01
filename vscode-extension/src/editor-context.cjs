const path = require('node:path');
const vscode = require('vscode');

// Shared editor-context helpers used by both the palette commands (extension.cjs)
// and the @cetoken chat participant (chat-participant.cjs). Kept in one place so
// the two entry points resolve file paths and selections identically.

function workspacePathForDocument(document) {
  // Untitled scratch buffers and non-file editors (output panels, git diffs,
  // etc.) have no real path. Never inject a meaningless "File: Untitled-1" — or
  // a local absolute path — into a prompt: return null so no File: line is added.
  if (!document || document.isUntitled || !document.uri || document.uri.scheme !== 'file') {
    return null;
  }
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) {
    // A real file opened outside any workspace folder: use just the basename so
    // an absolute local path never leaks into the prompt sent to the model.
    return path.basename(document.fileName);
  }
  return path.relative(folder.uri.fsPath, document.fileName);
}

function getSelectedText(editor) {
  if (!editor || editor.selection.isEmpty) {
    return '';
  }
  return editor.document.getText(editor.selection).trim();
}

module.exports = {
  workspacePathForDocument,
  getSelectedText,
};
