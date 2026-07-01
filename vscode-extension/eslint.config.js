// ESLint flat config — vscode-extension (src/**/*.cjs, CommonJS)
// Requires: npm install -D eslint @eslint/js globals  (in vscode-extension/)
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    files: ['src/**/*.cjs', 'test/**/*.cjs'],
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        // VS Code extension host globals
        ...globals.commonjs,
      },
    },
    rules: {
      ...js.configs.recommended.rules,

      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],

      // Extension activation path must be async-safe
      'no-async-promise-executor': 'error',

      // VS Code extension patterns use console for output channel fallback — allow
      'no-console': 'off',
    },
  },
  {
    // Integration tests run under Mocha (TDD ui) inside the VS Code test host.
    files: ['test/integration/**/*.cjs'],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
  },
];
