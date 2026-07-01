const SECRET_PATTERNS = [
  {
    id: 'github-token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{20,255})\b/g,
    replacer: () => '[REDACTED_GITHUB_TOKEN]',
  },
  {
    id: 'openai-anthropic-key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,255}\b/g,
    replacer: () => '[REDACTED_API_KEY]',
  },
  {
    id: 'stripe-secret-key',
    pattern: /\bsk_live_[A-Za-z0-9]{16,255}\b/g,
    replacer: () => '[REDACTED_STRIPE_SECRET_KEY]',
  },
  {
    id: 'stripe-publishable-key',
    pattern: /\bpk_live_[A-Za-z0-9]{16,255}\b/g,
    replacer: () => '[REDACTED_STRIPE_PUBLISHABLE_KEY]',
  },
  {
    id: 'slack-token',
    pattern: /\bxox(?:b|p|a|r|s)-[A-Za-z0-9-]{10,255}\b/g,
    replacer: () => '[REDACTED_SLACK_TOKEN]',
  },
  {
    id: 'npm-token',
    pattern: /\bnpm_[A-Za-z0-9]{36,255}\b/g,
    replacer: () => '[REDACTED_NPM_TOKEN]',
  },
  {
    id: 'google-api-key',
    pattern: /\bAIza[0-9A-Za-z_-]{35,}\b/g,
    replacer: () => '[REDACTED_GOOGLE_API_KEY]',
  },
  {
    id: 'gitlab-token',
    pattern: /\bglpat-[0-9A-Za-z_-]{20,}\b/g,
    replacer: () => '[REDACTED_GITLAB_TOKEN]',
  },
  {
    id: 'sendgrid-key',
    pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    replacer: () => '[REDACTED_SENDGRID_KEY]',
  },
  {
    id: 'twilio-api-key',
    pattern: /\bSK[0-9a-fA-F]{32}\b/g,
    replacer: () => '[REDACTED_TWILIO_KEY]',
  },
  {
    id: 'shopify-token',
    pattern: /\bshp(?:at|ca|pa|ss)_[A-Fa-f0-9]{32}\b/g,
    replacer: () => '[REDACTED_SHOPIFY_TOKEN]',
  },
  {
    id: 'digitalocean-token',
    pattern: /\bdop_v1_[a-f0-9]{64}\b/g,
    replacer: () => '[REDACTED_DIGITALOCEAN_TOKEN]',
  },
  {
    id: 'square-token',
    pattern: /\bsq0(?:atp|csp)-[0-9A-Za-z_-]{22,}\b/g,
    replacer: () => '[REDACTED_SQUARE_TOKEN]',
  },
  {
    id: 'postman-key',
    pattern: /\bPMAK-[0-9a-fA-F]{24}-[0-9a-fA-F]{34}\b/g,
    replacer: () => '[REDACTED_POSTMAN_KEY]',
  },
  {
    id: 'aws-access-key-id',
    pattern: /\b(?:AKIA|ASIA|AIDA|AGPA|ANPA|AROA|AIPA)[A-Z0-9]{16}\b/g,
    replacer: () => '[REDACTED_AWS_ACCESS_KEY_ID]',
  },
  {
    id: 'bearer-token',
    pattern: /(\bBearer\s+)([A-Za-z0-9._~+/=-]{16,})/g,
    replacer: (_, prefix) => `${prefix}[REDACTED_BEARER_TOKEN]`,
  },
  {
    id: 'jwt-token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacer: () => '[REDACTED_JWT]',
  },
  {
    id: 'private-key-block',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacer: () => '-----BEGIN PRIVATE KEY-----\n[REDACTED_PRIVATE_KEY_BLOCK]\n-----END PRIVATE KEY-----',
  },
  {
    id: 'sensitive-env-assignment',
    pattern: /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET)[A-Za-z0-9_]*\s*=\s*).*$/gim,
    replacer: (_, prefix) => `${prefix}[REDACTED_ENV_VALUE]`,
  },
  {
    id: 'auth-header',
    pattern: /(\b(?:Authorization|X-API-Key|Api-Key|X-Auth-Token|X-Amz-Security-Token)\s*[:=]\s*)([^\s,;]+)/gi,
    replacer: (_, prefix) => `${prefix}[REDACTED_HEADER_VALUE]`,
  },
  {
    id: 'azure-connection-secret',
    pattern: /(\b(?:AccountKey|SharedAccessKey|SharedAccessSignature|EndpointSuffix)\s*=\s*)([^;\r\n]+)/gi,
    replacer: (_, prefix) => `${prefix}[REDACTED_AZURE_SECRET]`,
  },
  {
    id: 'database-connection-credentials',
    pattern: /\b((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqp|sqlserver):\/\/)([^:\s/@]+):([^@\s/]+)@/gi,
    replacer: (_, prefix) => `${prefix}[REDACTED_DB_USER]:[REDACTED_DB_PASSWORD]@`,
  },
  {
    id: 'gcp-service-account-private-key-id',
    pattern: /("private_key_id"\s*:\s*")([^"]+)(")/gi,
    replacer: (_, prefix, _value, suffix) => `${prefix}[REDACTED_GCP_PRIVATE_KEY_ID]${suffix}`,
  },
  {
    id: 'gcp-service-account-private-key',
    pattern: /("private_key"\s*:\s*")([^"]+)(")/gi,
    replacer: (_, prefix, _value, suffix) => `${prefix}[REDACTED_GCP_PRIVATE_KEY]${suffix}`,
  },
  {
    id: 'json-sensitive-field',
    pattern: /("(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|password|secret)"\s*:\s*")([^"]+)(")/gi,
    replacer: (_, prefix, _value, suffix) => `${prefix}[REDACTED_FIELD_VALUE]${suffix}`,
  },
];

// Org-configurable patterns, applied ON TOP of the built-ins on every call so a
// regulated team can catch their own token formats (e.g. an internal key shape)
// without touching the engine. Registered once at extension activation from the
// `ceTokenKit.secretPatterns` setting.
let customPatterns = [];

function compileCustomPattern(spec) {
  if (!spec) return null;
  const rawRegex = typeof spec === 'object' ? spec.regex : spec;
  const rawName = typeof spec === 'object' ? spec.name : null;
  if (!rawRegex) return null;
  const label = (String(rawName || 'custom').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'CUSTOM').toUpperCase();
  try {
    let re = rawRegex instanceof RegExp ? rawRegex : new RegExp(String(rawRegex));
    if (!re.global) re = new RegExp(re.source, `${re.flags}g`);
    return { id: `custom:${label.toLowerCase()}`, pattern: re, replacer: () => `[REDACTED_${label}]` };
  } catch {
    return null; // an invalid regex must never crash the redactor — skip it
  }
}

/**
 * Register org-specific secret patterns. Each spec is `{ name, regex }` (regex a
 * string or RegExp); invalid regexes are skipped. Returns how many compiled.
 */
export function setCustomSecretPatterns(specs) {
  customPatterns = (Array.isArray(specs) ? specs : [])
    .map(compileCustomPattern)
    .filter(Boolean);
  return customPatterns.length;
}

/**
 * Serializable view of the active detection patterns — `{ id, source, flags }`
 * for every built-in plus any registered custom pattern. Replacers are omitted
 * (detection-only). Lets the pre-commit hook installer GENERATE a self-contained
 * scanner straight from this single source of truth, so the committed hook can
 * never drift from the redactor's patterns.
 */
export function getSecretPatternSummaries() {
  return [...SECRET_PATTERNS, ...customPatterns].map(descriptor => ({
    id: descriptor.id,
    source: descriptor.pattern.source,
    flags: descriptor.pattern.flags,
  }));
}

const DOTENV_ASSIGNMENT_RE = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*)(.*)$/;
const DOTENV_VALUE_PLACEHOLDER = '[REDACTED_ENV_VALUE]';
const DOTENV_CONTINUATION_PLACEHOLDER = '[REDACTED_ENV_VALUE_CONTINUATION]';

function isDotenvFilename(filename) {
  if (!filename) return false;
  const normalized = String(filename).split(/[\\/]/).pop() || '';
  if (!(normalized === '.env' || normalized.startsWith('.env.'))) return false;
  // Example/template dotenv files are placeholder catalogs meant to be committed
  // (`.env.example`, `.env.sample`, `.env.template`, `.env.dist`). The blanket
  // "every value is a secret" rule must NOT run for them, or every KEY=placeholder
  // becomes a false "leaked secret". Real per-environment files (.env.production)
  // still count.
  return !/\.(example|sample|template|dist|tpl)$/i.test(normalized);
}

// A matched value that is obviously NOT a real secret: a variable reference, an
// angle-bracket placeholder, a bare auth scheme word, a reversible-obfuscation
// marker, or a common dummy ("your-token", "changeme", "replace-with-…"). Used to
// suppress findings from the assignment/header heuristics — the high-entropy token
// formats (github-token, jwt, aws, …) are never placeholder-checked, so a real key
// is still caught. Conservative on purpose: only clear placeholders are dropped.
// Normalization first strips a trailing inline comment (` # …` / ` // …`) and any
// surrounding markdown backticks, so `pa-...  # note` and `` `<key>` `` are seen as
// the placeholder they are. A comment needs leading whitespace, so a secret that
// contains `#` (no space) is untouched — a real token never carries a space.
function isPlaceholderSecret(rawValue) {
  const v = String(rawValue ?? '').trim()
    .replace(/\s+(?:#|\/\/).*$/, '')   // trailing inline comment
    .replace(/^`+|`+$/g, '')           // surrounding markdown backticks
    .replace(/^["']|["']$/g, '')       // surrounding quotes
    .trim();
  if (!v) return true;
  if (/^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(v)) return true;        // $VAR / ${VAR}
  if (/^%[A-Za-z_][A-Za-z0-9_]*%$/.test(v)) return true;              // %VAR%
  if (/^\{\{\s*[A-Za-z0-9_.]+\s*\}\}$/.test(v)) return true;          // {{ VAR }}
  if (/^<[^>]+>$/.test(v)) return true;                              // <token>, <secret-from-…>
  if (/^(?:bearer|basic|token|negotiate|digest)$/i.test(v)) return true; // bare auth scheme
  if (/^obf:/i.test(v)) return true;                                 // reversible obfuscation marker
  if (/\b(?:your|my|the|a)[-_](?:token|key|api[-_]?key|secret|password|client[-_]?secret|access[-_]?key)\b/i.test(v)) return true;
  if (/replace[-_ ]?(?:with|me|this|here)/i.test(v)) return true;    // replace-with-secret
  if (/\bchange[-_ ]?me\b/i.test(v)) return true;                    // change-me / change-me-<name>
  if (/^(?:changeme|change[-_]?me|placeholder|example|dummy|todo|redacted|sample|none)$/i.test(v)) return true;
  if (/(?:\.{3,}|…)\s*$/.test(v)) return true;                      // ..., prefix-..., prefix_..., …
  return false;
}

// First meaningful token of an assignment value — before trailing punctuation, a
// second token, or a comment: `max_tokens,` -> `max_tokens`, `x  # note` -> `x`.
function firstValueToken(rawValue) {
  const v = String(rawValue ?? '').trim().replace(/^["']|["']$/g, '').trim();
  const m = v.match(/^[^\s,;)}#]+/);
  return m ? m[0] : '';
}

// A single quoted string literal — `"..."` / `'...'` with no inner quote of the
// same kind. A real secret is written as a literal like this, so it is NEVER
// dismissed as "just code" (see the carve-out in isNonSecretAssignmentValue).
function isSingleQuotedLiteral(rawValue) {
  const s = String(rawValue ?? '').trim();
  return /^"[^"]*"$/.test(s) || /^'[^']*'$/.test(s);
}

// A code expression rather than a secret literal: a function/method call
// (`data.get("nextPageToken")`, `base64.b64encode(...)`) or a spaced
// concatenation/arithmetic operator (`"whsec_" + base64...`). The spaced-operator
// rule is deliberate — a base64 secret's inline `+`/`/` has no surrounding
// spaces, so it is not mistaken for concatenation.
function looksLikeCodeExpression(rawValue) {
  const s = String(rawValue ?? '').trim();
  if (/[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)/.test(s)) return true; // ident(...) / obj.method(...)
  if (/\S\s[-+*/%]\s\S/.test(s)) return true;                    // token <spaced op> token
  return false;
}

// A sensitive-env-assignment VALUE that is clearly not a secret literal: a
// number, a language literal, a bare lowercase snake_case identifier or an
// attribute reference (a variable being passed — e.g. the Python kwarg
// `max_tokens=max_tokens`, where "token" is only a substring of the key), or a
// value that just echoes its own key. Deliberately does NOT reject a bare alnum
// blob with no underscore — that can be a real low-structure token, so it still
// fires. SCANNER-ONLY suppression; the redactor stays maximally aggressive.
function isNonSecretAssignmentValue(rawValue, key) {
  const t = firstValueToken(rawValue);
  if (!t) return false;
  if (/^[+-]?\d[\d_]*(?:\.\d+)?$/.test(t)) return true;                        // 512, 1_000, 3.14
  if (/^(?:true|false|none|null|nil|undefined|nan)$/i.test(t)) return true;    // language literals
  if (t.length <= 24 && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(t)) return true; // snake_case identifier
  if (/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(t)) return true; // self.max_tokens
  if (key && t.toLowerCase() === String(key).toLowerCase()) return true;       // self-reference
  // A code expression (call / concatenation) — but never a plain quoted string
  // literal, which is how a real secret is written, so `API_KEY="realkey…"` fires.
  if (!isSingleQuotedLiteral(rawValue) && looksLikeCodeExpression(rawValue)) return true;
  return false;
}

// An auth-header VALUE that is a type/identifier from surrounding code, not a
// leaked token: the assignment non-secrets above, plus a short purely-alphabetic
// word (`str`, `machine`, `None`). A real Authorization / API-key token is long
// and/or carries digits or punctuation. SCANNER-ONLY.
function isNonSecretHeaderValue(rawValue) {
  const t = firstValueToken(rawValue);
  if (!t) return false;
  if (isNonSecretAssignmentValue(t)) return true;
  if (/^[A-Za-z]+$/.test(t) && t.length < 12) return true;
  return false;
}

// The env-var name from a sensitive-env-assignment prefix group
// ("  export FOO=" -> "FOO"), for the self-reference check.
function envKeyFromPrefix(prefix) {
  return String(prefix ?? '').replace(/^\s*(?:export\s+)?/i, '').replace(/\s*=\s*$/, '').trim();
}

// Scanner-side suppression for the heuristic assignment/header patterns: an
// obvious placeholder, or a value that plainly is not a secret. High-entropy
// token formats (github, jwt, aws, …) return null from placeholderValueForMatch
// and are never routed here, so a real key is always still located.
function isSuppressedHeuristicValue(id, value, match) {
  if (isPlaceholderSecret(value)) return true;
  if (id === 'sensitive-env-assignment') return isNonSecretAssignmentValue(value, envKeyFromPrefix(match[1]));
  if (id === 'auth-header') return isNonSecretHeaderValue(value);
  return false;
}

// The value portion a heuristic pattern flagged, so it can be placeholder-checked.
// Returns null for high-entropy token formats — those are never suppressed.
function placeholderValueForMatch(id, match) {
  switch (id) {
    case 'sensitive-env-assignment':
      return match[0].slice((match[1] || '').length);
    case 'auth-header':
    case 'azure-connection-secret':
    case 'json-sensitive-field':
    case 'bearer-token':
      return match[2] ?? '';
    case 'database-connection-credentials':
      return match[3] ?? '';
    default:
      return null;
  }
}

// Source text (via Function.prototype.toString) of the EXACT scan-suppression
// helpers scanSecrets uses, plus the dotenv-assignment regex. The self-contained
// pre-commit hook inlines this so it makes the IDENTICAL block/skip decision as
// scanSecrets — a true mirror generated from this one source, never a
// hand-maintained second copy (which is what reinvites drift). Every entry is a
// pure function (or one regex const) that references nothing outside this set, so
// the concatenation is valid standalone JS.
export function getScannerSuppressionSource() {
  const parts = [
    `const DOTENV_ASSIGNMENT_RE = ${DOTENV_ASSIGNMENT_RE.toString()};`,
    isDotenvFilename,
    shouldRunDotenvStage,
    firstValueToken,
    isSingleQuotedLiteral,
    looksLikeCodeExpression,
    isPlaceholderSecret,
    isNonSecretAssignmentValue,
    isNonSecretHeaderValue,
    envKeyFromPrefix,
    placeholderValueForMatch,
    isSuppressedHeuristicValue,
  ];
  return parts.map(part => (typeof part === 'string' ? part : part.toString())).join('\n\n');
}

function isEscapedContinuation(value) {
  const trimmed = value.trimEnd();
  let slashCount = 0;
  for (let i = trimmed.length - 1; i >= 0 && trimmed[i] === '\\'; i -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

// The blanket dotenv stage redacts EVERY assignment value regardless of key
// name, so it runs ONLY for real .env* files, where every value is a secret by
// convention. Arbitrary pasted text that merely looks like KEY=value — config
// dumps, feature-flag lists, .properties files — is deliberately NOT blanket
// scrubbed; it falls through to the key-name-scoped `sensitive-env-assignment`
// pattern below, which redacts only keys that name a secret (TOKEN/SECRET/
// PASSWORD/API_KEY/…). This keeps legitimate non-secret context the engineer
// wanted the model to see, instead of destroying it. (Previously a content-shape
// heuristic also triggered here, which over-redacted innocuous KEY=value text.)
function shouldRunDotenvStage(filename) {
  return isDotenvFilename(filename);
}

function redactDotenvAssignments(text) {
  const lines = text.split('\n');
  const outputLines = [];
  let findingCount = 0;
  let inContinuation = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (inContinuation) {
      outputLines.push(DOTENV_CONTINUATION_PLACEHOLDER);
      if (!isEscapedContinuation(line)) {
        inContinuation = false;
      }
      continue;
    }

    if (!trimmed || trimmed.startsWith('#')) {
      outputLines.push(line);
      continue;
    }

    const match = line.match(DOTENV_ASSIGNMENT_RE);
    if (!match) {
      outputLines.push(line);
      continue;
    }

    const prefix = match[1];
    const value = match[2] ?? '';
    if (value.length === 0) {
      outputLines.push(line);
      continue;
    }

    findingCount += 1;
    outputLines.push(`${prefix}${DOTENV_VALUE_PLACEHOLDER}`);
    if (isEscapedContinuation(value)) {
      inContinuation = true;
    }
  }

  return {
    output: outputLines.join('\n'),
    count: findingCount,
  };
}

function mergeFindingCounts(target, findings) {
  for (const finding of findings) {
    const prev = target.get(finding.id) || 0;
    target.set(finding.id, prev + finding.count);
  }
}

function applyPattern(input, descriptor) {
  let count = 0;
  const output = input.replace(descriptor.pattern, (...args) => {
    count += 1;
    return descriptor.replacer(...args);
  });
  return { output, count };
}

function toFindings(countMap) {
  return [...countMap.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function mergeSecretReports(...findingLists) {
  const countMap = new Map();
  for (const findings of findingLists) {
    if (!Array.isArray(findings)) continue;
    mergeFindingCounts(countMap, findings);
  }
  return toFindings(countMap);
}

function buildFindingMap(text) {
  let output = text;
  const findingMap = new Map();
  for (const descriptor of [...SECRET_PATTERNS, ...customPatterns]) {
    const result = applyPattern(output, descriptor);
    output = result.output;
    if (result.count > 0) {
      findingMap.set(descriptor.id, (findingMap.get(descriptor.id) || 0) + result.count);
    }
  }
  return { output, findingMap };
}

// Every replacer emits a `[REDACTED_<KIND>]` placeholder, so the true number of
// redacted regions is simply how many placeholders the output contains.
const REDACTION_SPAN_PATTERN = /\[REDACTED_[A-Z_]+\]/g;

function countRedactionSpans(text) {
  const matches = text.match(REDACTION_SPAN_PATTERN);
  return matches ? matches.length : 0;
}

export function protectSecrets(input, options = {}) {
  const mode = options.mode ?? 'redact';
  if (mode !== 'redact') throw new Error(`Unsupported secret sanitization mode: ${mode}`);

  const text = String(input ?? '');
  if (!text) return { output: text, redacted: false, totalRedactions: 0, findings: [], mode };

  let preprocessed = text;
  const dotenvMap = new Map();
  if (shouldRunDotenvStage(options.filename ?? '')) {
    const dotenvResult = redactDotenvAssignments(text);
    preprocessed = dotenvResult.output;
    if (dotenvResult.count > 0) {
      dotenvMap.set('dotenv-assignment', dotenvResult.count);
    }
  }

  const { output, findingMap } = buildFindingMap(preprocessed);
  const findings = toFindings(mergeFindingMaps(dotenvMap, findingMap));
  // Report the number of masked regions actually present in the output, not the
  // sum of per-pattern hits. A single KEY=value secret is matched by both its
  // specific pattern and the generic sensitive-env-assignment pattern (which
  // re-matches the placeholder the first pattern inserted), so summing counts it
  // twice while only one span is redacted. The count we surface must equal what a
  // reader can see in the output — the honest, auditable number. Subtract any
  // placeholders the caller's own input already contained.
  const totalRedactions = countRedactionSpans(output) - countRedactionSpans(text);
  return { output, redacted: totalRedactions > 0, totalRedactions, findings, mode };
}

function mergeFindingMaps(first, second) {
  const merged = new Map(first);
  for (const [key, value] of second.entries()) {
    merged.set(key, (merged.get(key) || 0) + value);
  }
  return merged;
}

// --- Locating scanner -------------------------------------------------------
// protectSecrets() MASKS secrets in a string. scanSecrets() LOCATES them: it
// reports {id, line, column, label} for every match WITHOUT returning the secret
// value (label is the redaction placeholder, never the raw token), so a scan
// report can be written to disk or shown without leaking. Reuses the exact same
// SECRET_PATTERNS + custom patterns + dotenv rule, so the file scanner and the
// chat redactor can never drift. Pure, local, no network, no tokens.

function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function offsetToLineColumn(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo] + 1 };
}

// The label is the redaction placeholder (e.g. "[REDACTED_GITHUB_TOKEN]"), which
// by construction contains no secret material. Collapse whitespace (private-key
// blocks span lines) and cap length so a finding row stays tidy and leak-free.
function cleanLabel(label, id) {
  const text = String(label ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return `[REDACTED_${String(id).toUpperCase()}]`;
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/**
 * Locate (don't redact) every secret in `input`. Returns an array of
 * `{ id, line, column, label }`, sorted by position, with overlapping matches
 * collapsed so one secret yields one finding. `label` is the masked placeholder
 * — never the raw value. Pass `{ filename }` so real `.env*` files report every
 * assignment value (secret by convention), matching protectSecrets().
 */
export function scanSecrets(input, options = {}) {
  const text = String(input ?? '');
  if (!text) return [];

  const filename = options.filename ?? '';
  const lineStarts = buildLineStarts(text);
  const raw = [];

  // .env* files: every assignment value is a secret by convention. Mark the whole
  // value span so a token pattern matching inside it dedupes to one finding.
  if (shouldRunDotenvStage(filename)) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = line.match(DOTENV_ASSIGNMENT_RE);
      const value = match ? match[2] ?? '' : '';
      if (match && value.length > 0 && !isPlaceholderSecret(value)) {
        const start = lineStarts[i] + (match[1] ? match[1].length : 0);
        raw.push({ id: 'dotenv-assignment', start, end: lineStarts[i] + line.length, label: DOTENV_VALUE_PLACEHOLDER });
      }
    }
  }

  // matchAll clones the regex internally, so the shared global patterns are safe
  // to reuse (their lastIndex is not mutated). Scanning the ORIGINAL text per
  // pattern is intentionally more thorough than the sequential redactor.
  for (const descriptor of [...SECRET_PATTERNS, ...customPatterns]) {
    for (const match of text.matchAll(descriptor.pattern)) {
      const placeholderValue = placeholderValueForMatch(descriptor.id, match);
      if (placeholderValue !== null && isSuppressedHeuristicValue(descriptor.id, placeholderValue, match)) {
        continue; // a variable/placeholder/scheme-word/identifier, not a real secret
      }
      const start = match.index ?? 0;
      let label;
      try {
        label = descriptor.replacer(...match);
      } catch {
        label = `[REDACTED_${descriptor.id}]`;
      }
      raw.push({ id: descriptor.id, start, end: start + match[0].length, label });
    }
  }

  // One finding per secret region: sort by start (longest first on ties) and drop
  // anything that overlaps an already-kept span.
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const findings = [];
  let coveredEnd = -1;
  for (const item of raw) {
    if (item.start < coveredEnd) continue;
    coveredEnd = item.end;
    const { line, column } = offsetToLineColumn(lineStarts, item.start);
    findings.push({ id: item.id, line, column, label: cleanLabel(item.label, item.id) });
  }
  return findings;
}