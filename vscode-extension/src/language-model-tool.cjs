const TOOL_NAME = 'ce_compress';

// #ceCompress Language Model tool (Phase 3).
//
// Exposes the kit's compression engine to Copilot agent mode so the agent can
// shrink large code / diffs / JSON / test output before it enters the model
// context — without anyone typing @cetoken. It is the only path into the
// *default* agent flow.
//
// Off by default: the manifest gates the tool on `config.ceTokenKit.agentTool.enabled`,
// and a user can always untick it in the agent "Configure Tools" picker. When it
// fires it returns a visible "compressed N -> M tokens" note so it is never silent.
//
// invokeCompressTool is a pure dependency-injected function (shared library, stats
// sink, and the vscode result factory are all injected) so it is testable without
// the VS Code Language Model API.
async function invokeCompressTool(deps) {
  const { input, shared, recordRun, makeResult } = deps;

  const content = String(input?.content ?? '');
  if (!content.trim()) {
    return makeResult('No content was provided to compress.');
  }

  const filename = input?.filename ? String(input.filename) : '';
  const result = shared.optimizeSelectionText(content, { filename });
  const safeOutput = shared.protectSecrets(result.output).output;

  if (typeof recordRun === 'function') {
    await recordRun({
      commandKey: 'agentCompress',
      commandLabel: 'Agent: Compress Context',
      group: 'selection',
      result,
    });
  }

  const note = `Compressed ${result.kind}: ${result.beforeTokens} -> ${result.afterTokens} tokens.`;
  return makeResult(`${note}\n\n${safeOutput}`, result);
}

// Thin glue that wires the tool to the real VS Code Language Model API. Returns
// null (registering nothing) when the host lacks the API, so the extension still
// activates cleanly on older VS Code builds and under the test harness's fake
// vscode. Availability to the agent is controlled by the manifest `when` clause
// (the ceTokenKit.agentTool.enabled setting) and the Configure Tools picker.
function registerLanguageModelTool(vscodeApi, context, wiring) {
  if (!vscodeApi.lm || typeof vscodeApi.lm.registerTool !== 'function') {
    return null;
  }

  const { loadSharedLibrary, recordRun, statusBar } = wiring;

  const makeResult = text => new vscodeApi.LanguageModelToolResult([
    new vscodeApi.LanguageModelTextPart(text),
  ]);

  const tool = {
    async invoke(options) {
      const shared = await loadSharedLibrary();
      return invokeCompressTool({
        input: options.input,
        shared,
        recordRun: details => recordRun(context, statusBar, details),
        makeResult,
      });
    },
    async prepareInvocation() {
      return { invocationMessage: 'Compressing context with Certance Token Kit' };
    },
  };

  const registration = vscodeApi.lm.registerTool(TOOL_NAME, tool);
  context.subscriptions.push(registration);
  return registration;
}

module.exports = {
  TOOL_NAME,
  invokeCompressTool,
  registerLanguageModelTool,
};
