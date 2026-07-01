const COMMAND_DEFINITIONS = [
  { id: 'ceTokenKit.optimizePrompt', handler: 'optimizePrompt' },
  { id: 'ceTokenKit.reviewDiff', handler: 'reviewDiff' },
  { id: 'ceTokenKit.debugStackTrace', handler: 'debugStackTrace' },
  { id: 'ceTokenKit.explainSelection', handler: 'explainSelection' },
  { id: 'ceTokenKit.checkContextReadiness', handler: 'checkContextReadiness' },
  { id: 'ceTokenKit.redactClipboard', handler: 'redactClipboard' },
  { id: 'ceTokenKit.applyGuardrailProfile', handler: 'applyGuardrailProfile' },
  { id: 'ceTokenKit.exportAuditEvidence', handler: 'exportAuditEvidence' },
  { id: 'ceTokenKit.scanWorkspaceSecrets', handler: 'scanWorkspaceSecrets' },
  { id: 'ceTokenKit.installPrecommitHook', handler: 'installPrecommitHook' },
  { id: 'ceTokenKit.recommendModel', handler: 'recommendModel' },
  { id: 'ceTokenKit.showStats', handler: 'showStats' },
  { id: 'ceTokenKit.resetStats', handler: 'resetStats' },
];

function registerCommands(vscodeApi, context, handlers) {
  for (const definition of COMMAND_DEFINITIONS) {
    const handler = handlers[definition.handler];
    if (typeof handler !== 'function') {
      throw new Error(`Missing handler for ${definition.handler}`);
    }

    context.subscriptions.push(
      vscodeApi.commands.registerCommand(definition.id, handler)
    );
  }
}

module.exports = {
  COMMAND_DEFINITIONS,
  registerCommands,
};