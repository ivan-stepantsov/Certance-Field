/**
 * Certance Token Kit — JSON SmartCrusher
 * Inspired by Headroom's SmartCrusher algorithm.
 *
 * What it does:
 *   - Removes null / undefined values
 *   - Removes empty arrays and empty objects
 *   - Collapses deeply nested single-key objects
 *   - For large homogeneous arrays: keeps first 3 items + summary line
 *   - Strips all whitespace (minifies)
 *
 * What it does NOT do:
 *   - Rename keys (would break meaning)
 *   - Remove non-null values
 *   - Lose any data that isn't provably empty or null
 *
 * Zero runtime dependencies — pure Node.js.
 */

import { estimateTokens } from '../lib/tokens.js';

const ARRAY_SUMMARY_THRESHOLD = 5; // arrays longer than this get summarised

function stripArray(arr) {
  const cleaned = arr.map(stripEmpty).filter(v => v !== undefined);
  return cleaned.length === 0 ? undefined : cleaned;
}

function stripObject(obj) {
  const cleaned = {};
  for (const [k, v] of Object.entries(obj)) {
    const stripped = stripEmpty(v);
    if (stripped !== undefined) cleaned[k] = stripped;
  }
  return Object.keys(cleaned).length === 0 ? undefined : cleaned;
}

/**
 * Removes null, undefined, empty arrays, and empty objects recursively.
 * @param {unknown} value
 * @returns {unknown}
 */
function stripEmpty(value) {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return stripArray(value);
  if (typeof value === 'object') return stripObject(value);
  return value;
}

function isHomogeneousObjectArray(arr) {
  const allObjects = arr.every(
    item => item !== null && typeof item === 'object' && !Array.isArray(item)
  );
  if (!allObjects) return false;
  const keySet = new Set(arr.flatMap(item => Object.keys(item)));
  const firstKeys = new Set(Object.keys(arr[0]));
  return [...keySet].every(k => firstKeys.has(k));
}

function summariseArray(arr) {
  const processed = arr.map(summariseLargeArrays);
  if (processed.length > ARRAY_SUMMARY_THRESHOLD && isHomogeneousObjectArray(processed)) {
    const kept = processed.slice(0, 3);
    kept.push({ _headroom_summary: `... ${processed.length - 3} more items (same schema)` });
    return kept;
  }
  return processed;
}

/**
 * For large homogeneous arrays (e.g. test results, log entries),
 * keep first N items and append a summary entry.
 * Homogeneous = all items share the same top-level keys.
 * @param {unknown} value
 * @returns {unknown}
 */
function summariseLargeArrays(value) {
  if (Array.isArray(value)) return summariseArray(value);
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(value)) result[k] = summariseLargeArrays(v);
    return result;
  }
  return value;
}

/**
 * Main compression function.
 * @param {string} input - Raw JSON string
 * @returns {{ output: string, beforeTokens: number, afterTokens: number, ratio: number }}
 */
export function compressJson(input) {
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }

  const stripped = stripEmpty(parsed);
  const summarised = summariseLargeArrays(stripped);
  const output = JSON.stringify(summarised); // minified — no whitespace

  const beforeTokens = estimateTokens(input);
  const afterTokens = estimateTokens(output);

  return {
    output,
    beforeTokens,
    afterTokens,
    ratio: beforeTokens > 0 ? Math.round((1 - afterTokens / beforeTokens) * 100) : 0,
  };
}

