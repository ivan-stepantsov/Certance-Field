const POLITE_PREFIX = /^(please\s+|can you\s+|could you\s+|would you\s+|i need you to\s+|help me\s+)/i;

const GERUND_MAP = {
  fixing: 'Fix', updating: 'Update', adding: 'Add', removing: 'Remove',
  refactoring: 'Refactor', checking: 'Check', testing: 'Test',
  writing: 'Write', creating: 'Create', debugging: 'Debug',
  improving: 'Improve', changing: 'Change', reviewing: 'Review',
  investigating: 'Investigate', implementing: 'Implement',
};
const I_NEED_RE = /^(i\s+need\s+to|i\s+want\s+to|i'?m\s+trying\s+to|we\s+need\s+to|we\s+want\s+to)\s+/i;

const HEDGE_PATTERNS = [
  /,?\s*if\s+(at\s+all\s+)?possible\b/gi,
  /\bmaybe\s+/gi,
  /\bideally\s+/gi,
  /\btry\s+to\s+/gi,
  /\bsort\s+of\s+/gi,
  /\bkind\s+of\s+/gi,
  /\bas\s+much\s+as\s+(you\s+can|possible)\b/gi,
  /\bhopefully\s+/gi,
  /\bif\s+you\s+(can|could)\s+/gi,
  /\bjust\s+(?=\w)/gi,
];

// Conversational padding that never carries technical meaning: greetings,
// gratitude, deference, hedged requests, narrative filler, intensifier doubling.
// Removed deterministically so a verbose prompt collapses to its actual ask.
// Deliberately conservative — each pattern requires a politeness marker so it
// cannot swallow a technical clause (e.g. "you could" is only stripped when
// followed by "possibly/kindly/…", never "you could call foo()"). Code,
// identifiers, paths, error strings, and constraint clauses are handled before
// this runs, so they are never touched here.
const FILLER_PATTERNS = [
  // greetings / openers (tolerate trailing ! . , and chain e.g. "Hi there! Ok so")
  [/^\s*(?:hey|hi|hello|yo)\s+there\b[!.,\s]*/i, ''],
  [/^\s*(?:hey|hi|hello|yo|ok|okay)\b[!.,\s]+/i, ''],
  [/^\s*so[,\s]+(?=\w)/i, ''],
  [/\b(?:basically|honestly|frankly|seriously)\b[,\s]*/gi, ' '],
  [/\bto be honest\b[,\s]*/gi, ' '],
  [/\bthe thing is(?:\s+that)?\b[,\s]*/gi, ' '],
  [/\bwhat\s+(?:seems\s+to\s+be\s+happening|(?:'?s|\s+is|\s+has\s+been)\s+(?:going\s+on|driving\s+me\s+(?:crazy|nuts|mad)))\s+is(?:\s+that)?\b[,\s]*/gi, ' '],
  // hoping / wishing / polite requests (each needs a politeness marker)
  [/\bi\s+(?:really\s+)?hate\s+to\s+bother\s+you(?:\s+with\s+(?:this|that|it))?\b[,\s]*/gi, ' '],
  [/\bi\s+(?:was|am|'?m)\s+(?:really\s+|just\s+)*(?:hoping|wondering)\s+(?:that\s+|if\s+)?/gi, ' '],
  [/\b(?:if\s+)?you\s+(?:could|might|can)\s+(?:possibly|maybe|kindly|perhaps|please)\s+(?:be\s+able\s+to\s+)?/gi, ' '],
  [/\bwould\s+you\s+mind\b[,\s]*/gi, ' '],
  [/\bhelp\s+me\s+out\b(?:\s+with\s+(?:this|that|it|something))?/gi, ' '],
  [/\bcan\s+you\s+please\s+/gi, ' '],
  [/\bkindly\s+/gi, ' '],
  [/,?\s*(?:just\s+)?so\s+you\s+know\b[,\s]*/gi, ' '],
  // deference / no-rush
  [/,?\s*(?:there\s+(?:is|'?s)\s+)?(?:absolutely\s+)?no\s+(?:rush|pressure|hurry)(?:\s+at\s+all)?\b/gi, ' '],
  [/,?\s*(?:and\s+)?please\s+take\s+your\s+time\b/gi, ' '],
  [/,?\s*whenever\s+you\s+(?:get|have)\s+(?:a\s+)?(?:spare\s+|free\s+)?(?:moment|chance|minute|time|sec(?:ond)?)\b/gi, ' '],
  [/,?\s*when(?:ever)?\s+you\s+(?:get\s+(?:a\s+)?chance|have\s+(?:the\s+)?time)\b/gi, ' '],
  [/,?\s*i\s+(?:totally\s+|completely\s+|fully\s+)?understand\s+if\s+you(?:'?re|\s+are)\s+busy\b/gi, ' '],
  [/,?\s*in\s+case\s+(?:that|it)\s+(?:matters|is\s+relevant|helps)(?:\s+at\s+all)?\b/gi, ' '],
  [/,?\s*if\s+that\s+(?:helps|makes\s+sense)\b/gi, ' '],
  [/,?\s*for\s+what\s+it(?:'?s|\s+is)\s+worth\b/gi, ' '],
  // narrative filler
  [/\bi(?:'?ve|\s+have)\s+been\s+(?:staring\s+at|struggling\s+with|banging\s+my\s+head\s+(?:against|on)|working\s+on|stuck\s+on)\s+(?:it|this|that)\s+for\s+(?:hours|ages|a\s+while|days|so\s+long)\b[,\s]*/gi, ' '],
  [/\bi(?:'?ve|\s+have)\s+spent\s+(?:the\s+)?(?:whole\s+|entire\s+|better\s+part\s+of\s+the\s+)?(?:afternoon|morning|day|evening)\s+(?:trying\s+to\s+figure\s+out\s+why|on\s+(?:this|it))?\b[,\s]*/gi, ' '],
  [/\bi\s+(?:just\s+)?can(?:'?t|not)\s+(?:seem\s+to\s+)?figure\s+(?:it|this|that)?\s*out\b[,\s]*/gi, ' '],
  // gratitude / closings (leading ,? only — must NOT eat a preceding sentence's period)
  [/,?\s*(?:thanks|thank\s+you)(?:\s+(?:so+\s+)*much|\s+a\s+(?:lot|million|ton|bunch))?(?:\s+in\s+advance)?\s*[.!]*\s*$/gi, ''],
  [/,?\s*(?:thanks|thank\s+you)(?:\s+(?:so+\s+)*much|\s+a\s+(?:lot|million|ton|bunch))?(?:\s+in\s+advance)?\b[,\s]*/gi, ' '],
  [/\bi(?:'?d|\s+would)\s+(?:really\s+|greatly\s+)*(?:appreciate|love)\s+(?:it|that|this)?\b[,\s]*/gi, ' '],
  [/,?\s*(?:much\s+)?appreciated\b[.!]*/gi, ' '],
  [/,?\s*you(?:'?re|\s+are)\s+(?:such\s+)?(?:an?\s+)?(?:absolute\s+|total\s+|real\s+)?(?:the\s+best|the\s+greatest|life\s?saver|amazing|awesome|brilliant|a\s+star)\b[.!]*/gi, ' '],
  [/,?\s*cheers\b[.!]*/gi, ' '],
  // connective filler left behind
  [/\boh\s+and\b[,\s]*/gi, ' '],
  [/,?\s*(?:oh\s+)?by\s+the\s+way\b[,\s]*/gi, ' '],
  [/\banyway\b[,\s]*/gi, ' '],
  // intensifier doubling
  [/\breally\s+really\b/gi, 'really'],
  [/\bso\s+so\s+(?=much|many)/gi, ''],
];

function stripFiller(text) {
  let result = text;
  for (const [pattern, replacement] of FILLER_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  // Tidy connectors/punctuation orphaned by the removals.
  result = result
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])\s*(?=[,;:.])/g, '')
    .replace(/,\s*\./g, '.')
    // collapse a connective repeated after a removal ("and and", "and , and")
    .replace(/\b(and|but|or|so|then|also)\b(?:\s*,?\s*\1\b)+/gi, '$1')
    // drop a connective left dangling against a sentence boundary by a removal
    // ("flaky lately and." -> "flaky lately.", leading "But. What" -> "What")
    .replace(/[,\s]+(?:and|but|or|so|then|also|plus)\s*(?=[.!?])/gi, '')
    .replace(/(^|[.!?])\s*(?:and|but|or|so|then|also|plus)\s*(?=[.!?])/gi, '$1');
  // Drop leading conjunctions/commas left at the very start.
  let previous;
  do {
    previous = result;
    result = result.replace(/^[\s,;:.]+/, '').replace(/^(?:and|but|so|then|also|plus|well)\b[,\s]+/i, '');
  } while (result !== previous);
  return result.trim();
}

// Removing mid-prompt clauses can leave a sentence starting lower-case; restore
// the capital at the string start and after each sentence terminator.
function capitalizeSentences(text) {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_, boundary, ch) => boundary + ch.toUpperCase());
}

const SENT_STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'and', 'or',
  'in', 'on', 'at', 'for', 'with', 'this', 'that', 'it', 'be', 'do',
  'can', 'will', 'you', 'your',
]);

const CONSTRAINT_SENT_RE = /\.\s+((?:Don'?t|Do\s+not|Avoid|Never|Must\s+not|Should\s+not|Without)\s+[A-Za-z][^.!?]{2,120})(?=[.!?]|$)/g;
const CONSTRAINT_CLAUSE_RE = /([,;]|\s+but)\s+((don'?t|do\s+not|avoid|never|must\s+not|should\s+not|without)\s+[a-z][^,.;!?]{2,120})/gi;
const INLINE_PATH_RE = /(?:^|\s)((?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|java|json|feature|md))\b/;

/** @type {Array<[RegExp, string]>} */
const LANG_TAG_RULES = [
  [/\.spec\.ts$/i, '[Playwright/TypeScript]'],
  [/\.spec\.js$/i, '[Playwright/JavaScript]'],
  [/\.feature$/i, '[Gherkin/Cucumber]'],
  [/\.tsx$/i, '[React/TypeScript]'],
  [/\.ts$/i, '[TypeScript]'],
  [/\.jsx$/i, '[React/JavaScript]'],
  [/\.js$/i, '[JavaScript]'],
  [/\.py$/i, '[Python]'],
  [/\.go$/i, '[Go]'],
  [/\.java$/i, '[Java]'],
];

function normalizeVerb(text) {
  const noINeed = text.replace(I_NEED_RE, '');
  const gerundMatch = noINeed.match(/^([a-z]+ing)\s+/i);
  if (!gerundMatch) return noINeed;
  const imperative = GERUND_MAP[gerundMatch[1].toLowerCase()];
  if (!imperative) return noINeed;
  return imperative + ' ' + noINeed.slice(gerundMatch[0].length);
}

function stripHedges(text) {
  let result = text;
  for (const pattern of HEDGE_PATTERNS) {
    result = result.replace(pattern, ' ');
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

function collapseRedundantSentences(text) {
  const rawParts = text.split(/([.!?]+[\s\n]+)/);
  if (rawParts.length <= 1) return text;

  const sentences = [];
  for (let i = 0; i < rawParts.length; i += 2) {
    const body = rawParts[i];
    const sep = rawParts[i + 1] ?? '';
    if (body.trim()) sentences.push(body.trim() + sep.trimEnd());
  }
  if (sentences.length <= 1) return text;

  const contentWords = (s) => s.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !SENT_STOP.has(w));

  const seen = new Set(contentWords(sentences[0]));
  const kept = [sentences[0]];

  for (let i = 1; i < sentences.length; i++) {
    const ws = contentWords(sentences[i]);
    if (ws.length === 0) {
      kept.push(sentences[i]);
      continue;
    }
    const overlap = ws.filter(w => seen.has(w)).length;
    if (overlap / ws.length < 0.65) {
      kept.push(sentences[i]);
      ws.forEach(w => seen.add(w));
    }
  }

  return kept.join(' ').replace(/\s{2,}/g, ' ').trim();
}

export function detectLanguageTag(filename) {
  if (!filename) return null;
  for (const [pattern, tag] of LANG_TAG_RULES) {
    if (pattern.test(filename)) return tag;
  }
  return null;
}

export function extractConstraints(text) {
  const constraints = [];

  let cleaned = text.replace(CONSTRAINT_SENT_RE, (_, phrase) => {
    const p = phrase.replace(/\s+/g, ' ').trim();
    if (p.split(/\s+/).length >= 3) {
      constraints.push(`Constraint: ${p}.`);
      return '.';
    }
    return _;
  });

  cleaned = cleaned.replace(CONSTRAINT_CLAUSE_RE, (_, _sep, phrase) => {
    const p = phrase.replace(/\s+/g, ' ').trim();
    if (p.split(/\s+/).length >= 3) {
      constraints.push(`Constraint: ${p}.`);
      return '';
    }
    return _;
  });

  cleaned = cleaned.replace(/[,;]\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
  return { cleaned, constraints };
}

export function extractInlinePath(prompt) {
  const match = prompt.match(INLINE_PATH_RE);
  return match ? match[1] : null;
}

export function normalizePrompt(prompt) {
  let normalized = prompt.replace(/\s+/g, ' ').replace(POLITE_PREFIX, '').trim();
  if (!normalized) return '';
  normalized = normalizeVerb(normalized);
  normalized = stripHedges(normalized);
  normalized = stripFiller(normalized);
  normalized = collapseRedundantSentences(normalized);
  normalized = capitalizeSentences(normalized);

  const sentence = normalized.replace(/[.?!]+$/, '').trim();
  if (!sentence) return '';
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}
