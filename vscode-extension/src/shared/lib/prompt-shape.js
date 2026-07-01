const BROAD_SCOPE_PATTERNS = [
  /@workspace\b/i,
  /\b(entire|whole)\s+(repo|repository|project|codebase)\b/i,
  /\bsearch\s+the\s+(repo|repository|project|codebase)\b/i,
  /\blook\s+through\s+the\s+(repo|repository|project|codebase)\b/i,
];

function isNarrowFilePrompt(prompt, metadata) {
  return !!metadata.file && prompt.length < 100 && !BROAD_SCOPE_PATTERNS.some(p => p.test(prompt));
}

// Positive signal that a prompt is a plain, safe explanatory question — used to
// gate the soft ≤3-sentence hint. Anything that does NOT look like one falls
// through to `null` (no brevity hint), which is the fail-safe default: we only
// nudge for brevity when we are confident the ask is a benign question.
const PLAIN_QUESTION_STARTERS = [
  /^\s*(what|why|how|when|where|which|who)\b/i,
  /^\s*(explain|describe|summari[sz]e|tell me about|walk me through)\b/i,
];

function isPlainExplanatoryQuestion(prompt) {
  const text = String(prompt ?? '').trim();
  if (!text) return false;
  return text.endsWith('?') || PLAIN_QUESTION_STARTERS.some(p => p.test(text));
}

// Phare guard (arXiv 2505.11365). A generic "be concise" instruction dropped
// hallucination-resistance by up to ~20% on false-premise / factual-correction
// tasks: with no room to push back, the model capitulates to a wrong assumption.
// So when a prompt looks like a fact-check, a challenge to a premise, a
// verification, or a destructive/irreversible action, we suppress every brevity
// hint and instead tell the model to answer completely and flag a false premise.
//
// The list is intentionally high-precision, NOT a blanket recall filter: neutral
// recall ("how many planets…") is not the Phare risk and stays brevity-eligible.
// Where uncertain, inferResponseShape's default (no hint) already fails safe, so
// this only needs to catch the explicit challenge/verify/destructive forms.
// Domain words the kit itself uses a lot ("token", bare "secret") are excluded
// so concise mode is not defeated on its own primary questions.
const BREVITY_SENSITIVE_PATTERNS = [
  // False-premise / leading correction: "isn't it true that…", "…, right?"
  /\bis(n'?t)?\s+it\s+true\b/i,
  /\bisn'?t\s+it\b/i,
  /\b(right|correct|true)\s*\?\s*$/i,
  /\bis\s+(this|it|that)\s+(safe|correct|accurate|right|true|valid|secure)\b/i,
  // Verification / doubt
  /\bverify\b/i,
  /\bfact[-\s]?check\b/i,
  /\bdouble[-\s]?check\b/i,
  /\bare\s+you\s+(sure|certain|positive)\b/i,
  /\bconfirm\s+(that|whether|if)\b/i,
  // Safety / irreversible: unconditionally dangerous shell/VCS actions, plus
  // destructive verbs qualified by an infra/data object so a benign "how do I
  // delete a dict key" is not swept in.
  /\brm\s+-rf\b/i,
  /\bforce[-\s]?push\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\b(drop|truncate)\s+(table|database|schema)\b/i,
  /\b(delete|wipe|destroy|revoke|rotate|overwrite)\b[\s\S]*\b(prod|production|database|volume|bucket|credential|api[-\s]?key|private[-\s]?key|account|user data)\b/i,
  /\bproduction\b[\s\S]*\b(deploy|migrat|rollback|delete|drop)/i,
];

// True when a prompt should NOT be nudged toward brevity (Phare guard). Pure,
// deterministic predicate; exported so it can be unit-tested and reused.
export function isBrevitySensitive(prompt) {
  const text = String(prompt ?? '');
  return BREVITY_SENSITIVE_PATTERNS.some(p => p.test(text));
}

// Anti-brevity directive returned for brevity-sensitive prompts. Note it is the
// opposite of a length cap — it explicitly asks for completeness.
const COMPLETENESS_HINT = 'Answer completely; if the question assumes something false or unsafe, say so first.';

export function inferResponseShape(prompt, metadata = {}) {
  // Phare guard first: never push brevity on a fact-check / false-premise /
  // destructive prompt — ask for a complete answer instead.
  if (isBrevitySensitive(prompt)) return COMPLETENESS_HINT;

  if (metadata.selectionKind === 'diff') {
    return /\breview\b/i.test(prompt)
      ? 'List the highest-risk regressions in the diff first.'
      : 'Focus on the changed behavior in the selected diff first.';
  }
  if (metadata.selectionKind === 'stack-trace') return 'Explain the likely root cause first, then the smallest plausible fix.';
  if (/\breview\b/i.test(prompt)) return 'List the highest-risk findings first.';
  // Length hints below are SOFT ("aim for") — the Copilot path exposes no
  // enforced output cap, so these are model-dependent nudges, never guarantees.
  if (/\bexplain\b/i.test(prompt)) return 'Lead with the answer; keep it to a short paragraph (aim for ≤5 sentences); no preamble.';
  if (/\b(fix|implement|update|change|refactor)\b/i.test(prompt)) return 'Return the minimal change needed. Keep the explanation to a sentence or two. Code first; add prose only where the code does not carry it.';
  if (isNarrowFilePrompt(prompt, metadata)) return 'Aim for ≤150 tokens.';
  if (isPlainExplanatoryQuestion(prompt)) return 'Lead with the answer; aim for ≤3 sentences unless the question needs more.';
  return null;
}
