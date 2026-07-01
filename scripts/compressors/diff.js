/**
 * Diff compressor — keep the change, drop the noise.
 *
 * For sending a diff to Copilot for review. Unlike the stats summarizer, this
 * preserves the *actual* changed lines so the model can review them — it keeps
 * file and hunk headers and every added/removed line, drops unchanged context
 * lines (the hunk header carries the line numbers), and collapses lock/generated/
 * binary file diffs to a one-line note. The model sees what changed, at a
 * fraction of the tokens.
 */

import { estimateTokens } from '../lib/tokens.js';

// Files whose diffs are noise for review — collapsed to a one-line summary.
const NOISE_FILE_RE = /(package-lock\.json|yarn\.lock|pnpm-lock\.ya?ml|composer\.lock|Cargo\.lock|go\.sum|poetry\.lock|Gemfile\.lock|\.min\.(js|css)|\.map|\.snap)$|(^|\/)(__snapshots__|dist|build)\//i;

// File-level metadata lines to keep verbatim.
const FILE_META_RE = /^(index |--- |\+\+\+ |new file |deleted file |old mode |new mode |rename |copy |similarity |dissimilarity |Binary files )/;

function parseDiffPath(line) {
  const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
  return match ? match[2] : '';
}

/**
 * Compresses a unified diff to its reviewable signal.
 * @param {string} input
 * @returns {{ output: string, beforeTokens: number, afterTokens: number, ratio: number }}
 */
export function compressDiff(input) {
  const lines = input.split('\n');
  const out = [];
  let skipping = false;        // inside a noise file's body
  let noisePath = null;
  let omitted = 0;

  const flushNoise = () => {
    if (noisePath !== null) {
      out.push(`  (${noisePath}: ${omitted} changed line(s) omitted — lock/generated/binary file)`);
      noisePath = null;
      omitted = 0;
    }
  };

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      flushNoise();
      const path = parseDiffPath(line);
      out.push(line);
      if (NOISE_FILE_RE.test(path)) {
        skipping = true;
        noisePath = path;
      } else {
        skipping = false;
      }
      continue;
    }

    if (skipping) {
      if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
        omitted += 1;
      }
      continue;
    }

    if (line.startsWith('@@')) {
      out.push(line);
      continue;
    }
    if (FILE_META_RE.test(line)) {
      out.push(line);
      continue;
    }
    if (line.startsWith('+') || line.startsWith('-')) {
      out.push(line);
      continue;
    }
    // Unchanged context line (' ' prefix), blank line, or "\ No newline…" → drop.
  }
  flushNoise();

  const output = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const beforeTokens = estimateTokens(input);
  const afterTokens = estimateTokens(output);
  const ratio = beforeTokens > 0 ? Math.round((1 - afterTokens / beforeTokens) * 100) : 0;

  return { output, beforeTokens, afterTokens, ratio };
}
