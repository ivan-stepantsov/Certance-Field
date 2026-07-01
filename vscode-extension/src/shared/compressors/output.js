/**
 * Certance Token Kit — Test Output Compressor
 * Inspired by Headroom's log/output filtering approach.
 *
 * Problem: A Playwright test run failure produces 200–500 lines.
 * Pasting all of it into Copilot Chat costs ~3,000–6,000 tokens.
 * Copilot only needs the failure + error + 10 lines of stack context.
 *
 * This compressor extracts only what matters:
 *   - Failed test names and file paths
 *   - Error messages (Error:, expect(...), AssertionError)
 *   - Relevant code context lines (the lines with > markers in Playwright output)
 *   - Top 3 frames of each stack trace
 *   - Summary line (X passed, Y failed)
 *
 * Strips:
 *   - All passing test lines (✓ / ✔ / PASS)
 *   - Timing information
 *   - Browser launch/teardown messages
 *   - Verbose context that repeats the test name
 *   - Empty lines in sequences longer than 1
 *
 * Supports output from:
 *   - Playwright (default reporter)
 *   - Jest / Vitest
 *   - Generic error output (fallback)
 *
 * Zero runtime dependencies — pure Node.js.
 */

import { estimateTokens } from '../lib/tokens.js';

// Patterns that identify lines we want to KEEP
const KEEP_PATTERNS = [
  /^\s*\d+\)\s/,                         // Playwright failure header: "  1) file.spec.ts..."
  /Error:/i,                              // Error lines
  /AssertionError/i,                      // Jest/Vitest assertion errors
  /expect\(/,                             // expect() calls in output
  /Expected|Received/,                   // Playwright/Jest diff lines
  /^\s*>\s*\d+\s*\|/,                    // Playwright code context: "> 42 |  await expect..."
  /^\s*\d+\s*\|/,                        // Playwright code context (nearby lines)
  /at\s+\w+.*\.(ts|js|tsx|jsx):\d+/,    // Stack frames pointing to source files
  /FAILED|FAIL\b/,                        // Explicit failure markers
  /● /,                                  // Jest failure marker
  /✗|✘|×/,                              // Unicode failure markers
  /\d+ (failed|passed|skipped)/i,        // Summary line
  /Test Suites:|Tests:/,                 // Jest summary
  /Call log:/i,                          // Playwright timeout call log header
  /^\s+-\s+(waiting|locator|resolved|attempting|element|unexpected|expect|navigat|received|\d+ element)/i, // Playwright call log entries, including nested diagnostics (resolved to, not stable, N elements)
  /\[(error|err|warn|fatal)\]/i,         // Browser/console severity tags: [ERROR], [WARN]
  /Failed to load resource|status of \d{3}/i, // HTTP / resource errors
  /\b(violat\w*|blocked|refused|denied|rejected|unauthorized|forbidden|attestation)\b/i, // Browser error verbs
];

// Patterns that identify lines we ALWAYS strip
const STRIP_PATTERNS = [
  /^\s*✓|^\s*✔|^\s*PASS\b/,             // Passing tests
  /^\s*\[.*\]\s*(chromium|firefox|webkit)/i, // Browser tags
  /workers?/i,                           // "Running X tests using Y workers"
  /^Running\s+\d+/i,                    // "Running 5 tests"
  /Slowest\s+\d+\s+tests/i,             // Jest slow test list
  /\s+at\s+.*node:internal/,            // Node internals in stack traces (with or without a function name)
  /\s+at\s+.*node_modules[/\\]/,        // node_modules frames (with or without a function name)
  /\s+at\s+.*webpack/i,                 // Webpack internals
  /\s+at\s+.*jest-circus/i,             // Jest internals
];

/**
 * Determines if a line should be kept.
 * @param {string} line
 * @returns {boolean}
 */
function shouldKeep(line) {
  for (const pattern of STRIP_PATTERNS) {
    if (pattern.test(line)) return false;
  }
  for (const pattern of KEEP_PATTERNS) {
    if (pattern.test(line)) return true;
  }
  return false;
}

/**
 * Collapses repeated lines, ignoring volatile noise (timestamps, hashes, IDs)
 * so near-identical log lines — e.g. the same CSP violation logged three times
 * with different timestamps — keep only their first occurrence. Blank lines are
 * passed through untouched.
 * @param {string[]} lines
 * @returns {string[]}
 */
function dedupeByShape(lines) {
  const seen = new Set();
  const result = [];
  for (const line of lines) {
    if (line.trim() === '') {
      result.push(line);
      continue;
    }
    const shape = line
      .replace(/[0-9a-f]{8,}/gi, '#')  // long hex/base64 (hashes, ids)
      .replace(/\d+/g, '#')             // any remaining numbers (timestamps, ports)
      .replace(/\s+/g, ' ')
      .trim();
    if (seen.has(shape)) continue;
    seen.add(shape);
    result.push(line);
  }
  return result;
}

/**
 * Compresses test/log output to signal-only content.
 * @param {string} input - Raw test output string
 * @returns {{ output: string, beforeTokens: number, afterTokens: number, ratio: number }}
 */
export function compressOutput(input) {
  const lines = input.split('\n');
  const kept = [];
  let consecutiveBlanks = 0;
  let stackFrameCount = 0;        // Track stack frames per error block
  let inStackTrace = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Detect entering/leaving a stack trace block
    const isStackFrame = /^\s+at\s+/.test(trimmed);

    if (isStackFrame) {
      if (!inStackTrace) {
        inStackTrace = true;
        stackFrameCount = 0;
      }
      stackFrameCount++;

      // Keep only top 3 source-file stack frames; skip node internals
      if (stackFrameCount <= 3 && !STRIP_PATTERNS.some(p => p.test(trimmed))) {
        kept.push(trimmed);
      }
      continue;
    } else {
      inStackTrace = false;
      stackFrameCount = 0;
    }

    // Blank line handling
    if (trimmed === '') {
      consecutiveBlanks++;
      if (consecutiveBlanks === 1) kept.push('');
      continue;
    }
    consecutiveBlanks = 0;

    if (shouldKeep(trimmed)) {
      kept.push(trimmed);
    }
  }

  // Safety net: if nothing matched the keep heuristics (e.g. an unfamiliar log
  // format), fall back to the de-duplicated input rather than returning nothing.
  // Better to under-compress than to silently destroy the whole selection.
  let result = kept;
  if (kept.every(line => line.trim() === '')) {
    result = lines.map(line => line.trimEnd());
  }

  // Collapse near-identical repeated lines (same shape, different timestamp/hash).
  result = dedupeByShape(result);

  // Remove leading/trailing blank lines
  while (result.length > 0 && result[0] === '') result.shift();
  while (result.length > 0 && result[result.length - 1] === '') result.pop();

  const output = result.join('\n');
  const beforeTokens = estimateTokens(input);
  const afterTokens = estimateTokens(output);

  return {
    output,
    beforeTokens,
    afterTokens,
    ratio: beforeTokens > 0 ? Math.round((1 - afterTokens / beforeTokens) * 100) : 0,
  };
}

