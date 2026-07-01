// ESLint flat config — root package (scripts/**, ESM)
// Requires: npm install -D eslint @eslint/js globals
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    // Only lint the scripts source — not generated output, deps, or the extension sub-package
    files: ['scripts/**/*.js'],
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'vscode-extension/**',  // has its own eslint.config.js
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,

      // Enforce explicit error handling — critical for a token-efficiency tool
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',

      // Async hygiene — unhandled promises silently swallow token-estimation errors
      'no-async-promise-executor': 'error',
      'no-await-in-loop': 'warn',

      // Code clarity
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'multi-line'],

      // Keep compression functions pure and side-effect-free
      'no-param-reassign': 'warn',

      // Console is fine in CLI scripts — but not in library code
      'no-console': 'off',
    },
  },
];
