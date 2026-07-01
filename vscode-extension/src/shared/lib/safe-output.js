/**
 * Single funnel for "never emit raw compressor output".
 *
 * Compression and optimization are pure transforms — they do NOT redact. Every
 * surface that displays or sends their output must scrub high-confidence secrets
 * first, in that order (compress → redact, so whatever is about to leave is what
 * gets scrubbed). Re-implementing that pairing at each call site is the kind of
 * invariant that rots: one new surface forgets the `protectSecrets` line and
 * leaks. This helper is the one place the pairing lives, so call sites pass a
 * compression result through it and read a guaranteed-safe `output` plus the
 * `protection` report (for the "⚠ Redacted N…" notice and stats).
 */

import { protectSecrets } from './secret-protection.js';

/**
 * Redacts secrets from a compression/optimization result's output.
 * @param {{ output: string } & Record<string, unknown>} result - any result with an `output` string
 * @param {{ filename?: string }} [options] - forwarded to protectSecrets
 * @returns {object} the result with redacted `output` and a `protection` report
 */
export function protectResultOutput(result, options = {}) {
  const protection = protectSecrets(result.output, options);
  return { ...result, output: protection.output, protection };
}
