const test = require('node:test');
const assert = require('node:assert/strict');

const { COMMAND_DEFINITIONS, registerCommands } = require('../src/command-routing.cjs');

test('registerCommands registers every declared command', () => {
  const registered = [];
  const context = { subscriptions: [] };
  const vscodeApi = {
    commands: {
      registerCommand(id, handler) {
        registered.push({ id, handler });
        return { dispose() {} };
      },
    },
  };

  const handlers = Object.fromEntries(
    COMMAND_DEFINITIONS.map(definition => [definition.handler, () => definition.id])
  );

  registerCommands(vscodeApi, context, handlers);

  assert.equal(registered.length, COMMAND_DEFINITIONS.length);
  assert.deepEqual(
    registered.map(entry => entry.id),
    COMMAND_DEFINITIONS.map(definition => definition.id)
  );
  assert.equal(context.subscriptions.length, COMMAND_DEFINITIONS.length);
});

test('registerCommands fails fast when a handler is missing', () => {
  const context = { subscriptions: [] };
  const vscodeApi = {
    commands: {
      registerCommand() {
        return { dispose() {} };
      },
    },
  };

  assert.throws(
    () => registerCommands(vscodeApi, context, {}),
    /Missing handler/
  );
});