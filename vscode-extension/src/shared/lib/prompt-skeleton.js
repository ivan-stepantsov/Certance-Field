import { extractConstraints, extractInlinePath, normalizePrompt } from './prompt-normalize.js';

function fnv1aHash(input) {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildPromptSkeletonId(prompt, metadata = {}) {
  const text = String(prompt ?? '');
  const { cleaned, constraints } = extractConstraints(text);
  const goal = normalizePrompt(cleaned).toLowerCase();

  const resolvedFile = (metadata.file || extractInlinePath(text) || '').toLowerCase();
  const normalizedConstraints = constraints
    .map(c => c.replace(/^Constraint:\s*/i, '').trim().toLowerCase())
    .join('|');
  const outputShape = metadata.output ? String(metadata.output).trim().toLowerCase() : '';

  const fingerprintSource = [goal, resolvedFile, normalizedConstraints, outputShape].join('||');
  return `psk_${fnv1aHash(fingerprintSource)}`;
}
