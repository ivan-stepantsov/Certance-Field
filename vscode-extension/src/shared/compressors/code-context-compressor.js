/**
 * Certance Token Kit — Code Context Compressor
 * Inspired by Headroom's CodeCompressor algorithm.
 *
 * Strips noise from source code before it enters Copilot context.
 * Preserves all logic, types, and signatures. Only removes comments and blank lines.
 *
 * Supported languages (auto-detected from extension):
 *   TypeScript / JavaScript  .ts .tsx .js .jsx .mjs .cjs
 *   Java                     .java
 *   Python                   .py
 *   Go                       .go
 *   C / C++                  .c .cpp .h .hpp
 *   Shell                    .sh .bash
 *
 * What it removes:
 *   - Single-line comments  (// in TS/JS/Java/Go/C   # in Python/Shell)
 *   - Block comments        (/* ... *\/)
 *   - JSDoc blocks          (/** ... *\/)
 *   - Trailing whitespace on each line
 *   - Consecutive blank lines (collapsed to one)
 *
 * What it keeps:
 *   - ALL code, types, signatures, imports, exports
 *   - Strings (even if they contain comment-like sequences)
 *   - Regex literals
 *   - URLs inside strings
 *
 * Safety: uses a line-by-line approach rather than naive regex on the full text.
 * This avoids the most common false-positive: // or # inside string literals.
 * The trade-off: inline comments on code lines are kept if they follow code.
 * Only comment-ONLY lines are stripped. This is the conservative safe choice.
 *
 * Zero runtime dependencies — pure Node.js.
 */

import { estimateTokens } from '../lib/tokens.js';

const LANG_COMMENT_STYLES = {
  // [singleLinePrefix, supportsBlockComments]
  ts:   { single: '//', block: true  },
  tsx:  { single: '//', block: true  },
  js:   { single: '//', block: true  },
  jsx:  { single: '//', block: true  },
  mjs:  { single: '//', block: true  },
  cjs:  { single: '//', block: true  },
  java: { single: '//', block: true  },
  go:   { single: '//', block: true  },
  c:    { single: '//', block: true  },
  cpp:  { single: '//', block: true  },
  h:    { single: '//', block: true  },
  hpp:  { single: '//', block: true  },
  py:   { single: '#',  block: false },
  sh:   { single: '#',  block: false },
  bash: { single: '#',  block: false },
};

/**
 * Detects language from file extension.
 * @param {string} filename
 * @returns {string} extension key or 'unknown'
 */
export function detectLanguage(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return LANG_COMMENT_STYLES[ext] ? ext : 'unknown';
}

function classifyBlockComment(stripped, inBlockComment, style) {
  if (!style?.block) return { skip: false, newInBlock: inBlockComment };
  if (inBlockComment) {
    return { skip: true, newInBlock: !stripped.includes('*/') };
  }
  if (stripped.startsWith('/*') && !stripped.includes('*/')) {
    return { skip: true, newInBlock: true };
  }
  if (stripped.startsWith('/*') && stripped.endsWith('*/')) {
    return { skip: true, newInBlock: false };
  }
  return { skip: false, newInBlock: false };
}

function isCommentOnlyLine(stripped, style, lang, lineIndex) {
  if (!style?.single || !stripped.startsWith(style.single)) return false;
  const isShebang = lineIndex === 0 && stripped.startsWith('#!');
  if (isShebang && (lang === 'py' || lang === 'sh' || lang === 'bash')) {
    return false;
  }
  return true;
}

/**
 * Handles blank line collapse and keeps at most one consecutive blank line.
 * @param {number} consecutiveBlanks
 * @param {string[]} result
 * @returns {number}
 */
function handleBlankLine(consecutiveBlanks, result) {
  const next = consecutiveBlanks + 1;
  if (next <= 1) result.push('');
  return next;
}

function trimBlankEdges(lines) {
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
}

/**
 * Compresses source code by removing comments and blank line runs.
 * @param {string} source - Raw source code
 * @param {string} filename - Used to detect language (e.g. 'LoginPage.ts')
 * @param {{ keepComments?: boolean }} [options]
 * @returns {{ output: string, language: string, beforeTokens: number, afterTokens: number, ratio: number }}
 */
export function compressCode(source, filename = '', options = {}) {
  // keepComments preserves comment lines/blocks (still collapses blank-line runs).
  // Used by the Explain path: for "explain this code", the comments carry the
  // intent — stripping them would delete the very "why" the explanation needs.
  const keepComments = options.keepComments === true;
  const lang = detectLanguage(filename);
  const style = LANG_COMMENT_STYLES[lang];

  const lines = source.split('\n');
  const result = [];
  let inBlockComment = false;
  let consecutiveBlanks = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimEnd();
    const stripped = trimmed.trimStart();

    if (!keepComments) {
      const block = classifyBlockComment(stripped, inBlockComment, style);
      inBlockComment = block.newInBlock;
      if (block.skip) continue;
      if (isCommentOnlyLine(stripped, style, lang, i)) continue;
    }

    if (stripped === '') {
      consecutiveBlanks = handleBlankLine(consecutiveBlanks, result);
      continue;
    }
    consecutiveBlanks = 0;
    result.push(trimmed);
  }

  trimBlankEdges(result);

  const output = result.join('\n');
  const beforeTokens = estimateTokens(source);
  const afterTokens = estimateTokens(output);

  return {
    output,
    language: lang,
    beforeTokens,
    afterTokens,
    ratio: beforeTokens > 0 ? Math.round((1 - afterTokens / beforeTokens) * 100) : 0,
  };
}

