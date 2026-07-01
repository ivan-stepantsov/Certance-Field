/**
 * Outline compressor — keep the structure of a file, drop the bodies.
 *
 * For giving Copilot context about a *large* file you don't need verbatim: keeps
 * imports, exports, type/interface declarations, class headers, and function /
 * method signatures, but replaces function bodies with a placeholder. A 600-line
 * file collapses to its ~API skeleton (often 70–90% smaller) while the model
 * still sees every name, signature, and type it needs to reason about the file.
 *
 * Heuristic and zero-dependency (no parser): brace-counting for C-family /
 * TypeScript / JS / Go / Java / etc., indentation for Python, and a fallback to
 * the comment/blank code compressor for anything else. It is structure-only —
 * not guaranteed to round-trip to compilable code.
 */

import { estimateTokens } from '../lib/tokens.js';
import { compressCode } from './code-context-compressor.js';

const BRACE_LANGS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'java', 'go', 'c', 'cpp', 'cc',
  'h', 'hpp', 'cs', 'rs', 'swift', 'kt', 'kts', 'scala', 'php',
]);
const PY_LANGS = new Set(['py', 'pyi']);

const BODY_PLACEHOLDER = '{ /* … */ }';

// Block openers that are NOT function bodies and must be kept intact.
const CONTROL_RE = /^(export\s+|public\s+|private\s+|protected\s+|static\s+|async\s+)*\b(if|else|for|while|switch|catch|try|do|finally|with)\b/;
const CONTAINER_RE = /\b(class|interface|enum|namespace|module|struct|trait|impl|object)\b/;

function langOf(filename) {
  const i = (filename || '').lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i + 1).toLowerCase();
}

function countChar(line, ch) {
  let n = 0;
  for (const c of line) {
    if (c === ch) n += 1;
  }
  return n;
}

// Net change in brace depth for a line, ignoring braces inside line comments,
// string/template literals, and regex or index character classes — where `{` and
// `}` commonly appear (e.g. a regex like /[}\]]/) and would otherwise corrupt the
// structural brace count and make a function body look like it closed early.
function braceDelta(line) {
  const sanitized = line
    .replace(/\/\/.*$/, '')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/\[(?:\\.|[^\]\\])*\]/g, '[]');
  return countChar(sanitized, '{') - countChar(sanitized, '}');
}

/** Does this line open a function/method body (ends with `{`, not control flow / not a container)? */
function isFunctionOpener(trimmed) {
  if (!/\{\s*$/.test(trimmed)) return false;
  if (CONTROL_RE.test(trimmed)) return false;
  if (CONTAINER_RE.test(trimmed)) return false;
  return /=>\s*\{\s*$/.test(trimmed)        // arrow function
    || /\bfunction\b/.test(trimmed)          // function keyword
    || /\)\s*(:\s*[^={]+)?\{\s*$/.test(trimmed); // method/function signature: ...) {  or  ...): Type {
}

function outlineBraces(lines) {
  const out = [];
  let depth = 0;
  let skipToDepth = null;

  for (const raw of lines) {
    if (skipToDepth !== null) {
      depth += braceDelta(raw);
      if (depth <= skipToDepth) {
        skipToDepth = null;
      }
      continue;
    }

    if (isFunctionOpener(raw.trim())) {
      out.push(raw.replace(/\{\s*$/, BODY_PLACEHOLDER));
      skipToDepth = depth;
      depth += braceDelta(raw);
      continue;
    }

    out.push(raw);
    depth += braceDelta(raw);
  }
  return out;
}

function outlinePython(lines) {
  const out = [];
  let skipIndent = null;   // dropping the body of a collapsed def
  let defIndent = null;    // collecting a multi-line def signature

  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = raw.length - raw.trimStart().length;

    if (skipIndent !== null) {
      if (trimmed === '' || indent > skipIndent) continue;
      skipIndent = null;
    }

    if (defIndent !== null) {
      out.push(/:\s*$/.test(raw) ? raw.replace(/:\s*$/, ': ...') : raw);
      if (/:\s*$/.test(raw)) {
        skipIndent = defIndent;
        defIndent = null;
      }
      continue;
    }

    if (/^(async\s+)?def\s+/.test(trimmed)) {
      if (/:\s*$/.test(raw)) {
        out.push(raw.replace(/:\s*$/, ': ...'));
        skipIndent = indent;
      } else {
        out.push(raw);
        defIndent = indent;
      }
      continue;
    }

    out.push(raw);
  }
  return out;
}

/**
 * Outlines source code: keeps signatures and declarations, drops function bodies.
 * @param {string} input
 * @param {string} [filename]
 * @returns {{ output: string, beforeTokens: number, afterTokens: number, ratio: number, language: string }}
 */
export function compressOutline(input, filename = '') {
  const lang = langOf(filename);
  const beforeTokens = estimateTokens(input);

  if (!BRACE_LANGS.has(lang) && !PY_LANGS.has(lang)) {
    // Unknown / non-brace language: fall back to the comment + blank-line compressor
    // so the call always produces something reasonable.
    const fallback = compressCode(input, filename);
    return {
      output: fallback.output,
      beforeTokens,
      afterTokens: fallback.afterTokens,
      ratio: fallback.ratio,
      language: fallback.language ?? lang,
    };
  }

  const lines = input.split('\n');
  const outlined = PY_LANGS.has(lang) ? outlinePython(lines) : outlineBraces(lines);
  const output = outlined.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const afterTokens = estimateTokens(output);
  const ratio = beforeTokens > 0 ? Math.round((1 - afterTokens / beforeTokens) * 100) : 0;

  return { output, beforeTokens, afterTokens, ratio, language: lang };
}
