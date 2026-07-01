import { defineConfig } from '@vscode/test-cli';

// Integration tests run inside a real (headless) VS Code host downloaded by
// @vscode/test-electron — the one layer the fakes-only unit tests can't cover:
// activation, manifest contributions, and command registration against the
// actual Extension API. Run with `npm run test:integration` (CI wraps it in
// xvfb-run on Linux).
export default defineConfig({
  files: 'test/integration/**/*.test.cjs',
  version: 'stable',
  mocha: {
    ui: 'tdd',
    timeout: 60000,
  },
});
