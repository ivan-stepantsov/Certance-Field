const assert = require('node:assert');
const vscode = require('vscode');

// Activation smoke test — runs inside a real VS Code host (see ../../.vscode-test.mjs).
// The unit tests inject a fake `vscode`, so they can't catch a broken manifest,
// a command that fails to register, or an activate() that throws. This does.

const EXTENSION_ID = 'ivan-stepantsov.ce-token-kit';

const EXPECTED_COMMANDS = [
  'ceTokenKit.optimizePrompt',
  'ceTokenKit.reviewDiff',
  'ceTokenKit.debugStackTrace',
  'ceTokenKit.explainSelection',
  'ceTokenKit.checkContextReadiness',
  'ceTokenKit.showStats',
  'ceTokenKit.resetStats',
];

suite('Certance Token Kit — activation smoke test', () => {
  test('extension is present and activates without throwing', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} should be installed in the test host`);
    await ext.activate();
    assert.strictEqual(ext.isActive, true, 'extension should be active after activate()');
  });

  test('all contributed commands are registered', async () => {
    await vscode.extensions.getExtension(EXTENSION_ID)?.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of EXPECTED_COMMANDS) {
      assert.ok(commands.includes(id), `command ${id} should be registered`);
    }
  });

  test('showStats executes against the live host without throwing', async () => {
    await vscode.extensions.getExtension(EXTENSION_ID)?.activate();
    // Exercises the real renderers + globalState stats read path end to end.
    await vscode.commands.executeCommand('ceTokenKit.showStats');
  });
});
