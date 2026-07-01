import { compressJson } from '../compressors/json.js';
import { compressCode } from '../compressors/code-context-compressor.js';
import { compressOutput } from '../compressors/output.js';
import { compressInstructions } from '../compressors/instructions.js';
import { compressOutline } from '../compressors/outline.js';
import { compressDiff } from '../compressors/diff.js';
export { estimateTokens } from './tokens.js';

export const COMPRESSION_MODES = ['json', 'code', 'output', 'instructions', 'outline', 'diff'];

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'java', 'py', 'go', 'c', 'cpp', 'h', 'hpp', 'sh', 'bash'
]);

const EXT_TO_MODE = {
  json: 'json',
  md: 'instructions', markdown: 'instructions',
  log: 'output', txt: 'output',
};

/**
 * Detects compression mode from file extension.
 * @param {string} filename
 * @returns {'json' | 'code' | 'output' | 'instructions' | 'unknown'}
 */
export function detectMode(filename) {
  const dotIndex = filename.lastIndexOf('.');
  const ext = dotIndex === -1 ? '' : filename.slice(dotIndex + 1).toLowerCase();
  if (EXT_TO_MODE[ext]) return EXT_TO_MODE[ext];
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  return 'unknown';
}

/**
 * Checks whether a string is a supported compression mode.
 * @param {string | null | undefined} mode
 * @returns {mode is 'json' | 'code' | 'output' | 'instructions' | 'outline' | 'diff'}
 */
export function isCompressionMode(mode) {
  return typeof mode === 'string' && COMPRESSION_MODES.includes(mode);
}

const COMPRESSORS = {
  json:         (input) => compressJson(input),
  code:         (input, filename, options) => compressCode(input, filename, options),
  output:       (input) => compressOutput(input),
  instructions: (input) => compressInstructions(input),
  outline:      (input, filename) => compressOutline(input, filename),
  diff:         (input) => compressDiff(input),
};

/**
 * Compresses content using the requested mode or a mode derived from filename.
 * @param {string} input
 * @param {{ mode?: 'json' | 'code' | 'output' | 'instructions' | 'outline' | 'diff' | null, filename?: string, keepComments?: boolean }} [options]
 * @returns {{ mode: 'json' | 'code' | 'output' | 'instructions' | 'outline' | 'diff', output: string, beforeTokens: number, afterTokens: number, ratio: number, language?: string }}
 */
export function compressContent(input, options = {}) {
  const filename = options.filename ?? '';
  const mode = options.mode ?? detectMode(filename);

  if (!isCompressionMode(mode)) {
    throw new Error(
      filename
        ? `Cannot auto-detect compression mode for "${filename}". Use one of: ${COMPRESSION_MODES.join(', ')}`
        : `Compression mode is required. Use one of: ${COMPRESSION_MODES.join(', ')}`
    );
  }

  return { mode, ...COMPRESSORS[mode](input, filename, options) };
}

/**
 * Formats a human-readable stats block for CLI output.
 * @param {string} label
 * @param {{ beforeTokens: number, afterTokens: number, ratio: number }} stats
 * @returns {string}
 */
export function formatCompressionStats(label, stats) {
  const saved = stats.beforeTokens - stats.afterTokens;
  return (
    `\n[certance-compress] ${label}\n` +
    `  Before : ~${stats.beforeTokens.toLocaleString()} tokens\n` +
    `  After  : ~${stats.afterTokens.toLocaleString()} tokens\n` +
    `  Saved  : ~${saved.toLocaleString()} tokens (${stats.ratio}% reduction)\n\n`
  );
}