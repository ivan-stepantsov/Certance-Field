/**
 * Certance Token Kit — Token estimation utility
 * Single source of truth for the estimateTokens function.
 * Imported by all compressors and the prompt optimizer.
 *
 * Approximation: ~4 characters per token (GPT/Claude average for mixed code/text).
 * Accurate to within 10–15% for English prose and source code.
 * Good enough for progress indicators and before/after comparisons.
 */

/**
 * Estimates token count for a given string.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
