// Focused Context Pack builder — turns a noisy selection (test failure, stack
// trace, diff, JSON payload, or code) into a compact, LABELLED, extractive pack
// that keeps the decisive lines and drops the surrounding noise.
//
// This is deliberately different from the compressors: a compressor strips noise
// but keeps the whole artifact; a context pack EXTRACTS only the lines that
// decide a fix or review (the failing assertion, the top app frame, the changed
// hunks, the error fields) and labels them. Extractive by design — it never
// summarizes evidence away. Pure, local, deterministic (no AI, no network).

import { estimateTokens } from './tokens.js';

const APP_FRAME_NOISE = /node_modules|site-packages|(^|\/)dist\/|(^|\/)build\/|internal\/|<anonymous>/;
const LOCKFILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|composer\.lock)/;
const FILE_REF = /(?:^|\s|\()([A-Za-z0-9_./-]+\.(?:tsx?|jsx?|mjs|cjs|py|go|rb|java|cs|rs|php|kt|swift)):(\d+)(?::\d+)?/g;

function detectPackKind(text) {
  if (/^(?:diff --git |@@ -\d|\+\+\+ |--- )/m.test(text)) return 'diff';
  // Test failures often embed a stack frame, so check test signals BEFORE stack.
  if (/\b(?:FAIL|✕|✗|✖|not ok|AssertionError|Expected:|Received:|expect\(|to (?:be|equal|match|contain))\b/.test(text)) return 'test';
  if (/(?:^|\n)\s*(?:at\s+.+:\d+:\d+|File ".+", line \d+)|Traceback \(most recent call last\)/.test(text)) return 'stack';
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) return 'json';
  return 'code';
}

function uniqueFileRefs(text, limit = 6) {
  const seen = new Set();
  let match;
  FILE_REF.lastIndex = 0;
  while ((match = FILE_REF.exec(text)) !== null) {
    const ref = `${match[1]}:${match[2]}`;
    if (!APP_FRAME_NOISE.test(match[1])) seen.add(ref);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

function keepLines(text, predicate, limit = 40) {
  const out = [];
  for (const line of text.split('\n')) {
    if (predicate(line)) out.push(line.replace(/\s+$/, ''));
    if (out.length >= limit) break;
  }
  return out;
}

function extractTest(text) {
  const failing = keepLines(text, l => /(?:^|\s)(?:FAIL|✕|✗|✖|×|not ok|●)\s|\b\d+ (?:failing|failed)\b/.test(l), 12);
  const assertion = keepLines(text, l => /Expected:|Received:|AssertionError|expect\(|toBe|toEqual|to (?:be|equal|match|contain)|\bactual\b|\bexpected\b/i.test(l), 20);
  const where = uniqueFileRefs(text);
  return {
    sections: [
      { title: 'Failing test(s)', lines: failing },
      { title: 'Assertion (expected vs actual)', lines: assertion },
      { title: 'Where', lines: where },
    ],
  };
}

function extractStack(text) {
  const errorLine = (text.split('\n').find(l => /(?:^|\s)(?:[A-Z]\w*Error|Exception|panic:|FATAL|Traceback)\b/.test(l)) || '').trim();
  const frames = keepLines(text, l => /^\s*(?:at\s+.+:\d+|File ".+", line \d+|\S+\.\w+:\d+)/.test(l), 30)
    .filter(l => !APP_FRAME_NOISE.test(l));
  return {
    sections: [
      { title: 'Error', lines: errorLine ? [errorLine] : [] },
      { title: 'Top app frames', lines: frames.slice(0, 6) },
    ],
  };
}

function extractDiff(text) {
  // Stateful: a lockfile's changed lines don't carry the filename, so we skip the
  // whole per-file section once its `diff --git` header names a lockfile.
  const files = [];
  const hunks = [];
  const changed = [];
  let inLockfile = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (/^diff --git /.test(line)) {
      inLockfile = LOCKFILE.test(line);
      if (!inLockfile) files.push(line);
      continue;
    }
    if (inLockfile) continue;
    if (/^(?:\+\+\+ |--- )/.test(line)) {
      if (LOCKFILE.test(line)) inLockfile = true;
      else files.push(line);
    } else if (/^@@ /.test(line)) {
      hunks.push(line);
    } else if (/^[+-](?![+-])/.test(line)) {
      changed.push(line);
    }
  }
  return {
    sections: [
      { title: 'Changed files', lines: files.slice(0, 20) },
      { title: 'Hunks', lines: hunks.slice(0, 20) },
      { title: 'Changed lines', lines: changed.slice(0, 60) },
    ],
  };
}

function truncateValue(value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str && str.length > 80 ? `${str.slice(0, 77)}…` : str;
}

function extractJson(text) {
  const keyLines = [];
  try {
    const parsed = JSON.parse(text);
    const walk = (obj, prefix) => {
      if (keyLines.length >= 40) return;
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          const path = prefix ? `${prefix}.${k}` : k;
          if (v && typeof v === 'object') walk(v, path);
          else keyLines.push(`${path}: ${truncateValue(v)}`);
          if (keyLines.length >= 40) break;
        }
      }
    };
    walk(parsed, '');
  } catch {
    // Not valid JSON — keep lines that name a key or an error/status field.
    keyLines.push(...keepLines(text, l => /"[^"]+"\s*:|error|status|message|code/i.test(l), 40));
  }
  const errors = keyLines.filter(l => /(?:^|\.)(?:error|message|status|code)\b/i.test(l));
  return {
    sections: [
      { title: 'Error / status fields', lines: errors },
      { title: 'Shape (keys → truncated values)', lines: keyLines.slice(0, 30) },
    ],
  };
}

function extractCode(text) {
  const signatures = keepLines(
    text,
    l => /^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const\s+\w+\s*=\s*(?:async\s*)?\(|def|func|fn|public|private|protected)\b/.test(l),
    40,
  );
  // Fall back to the trimmed source when there are no clear signatures.
  return { sections: [{ title: 'Signatures', lines: signatures.length ? signatures : text.trim().split('\n').slice(0, 20) }] };
}

const EXTRACTORS = { test: extractTest, stack: extractStack, diff: extractDiff, json: extractJson, code: extractCode };

const KIND_LABEL = {
  test: 'Focused context — test failure',
  stack: 'Focused context — stack trace',
  diff: 'Focused context — diff',
  json: 'Focused context — payload',
  code: 'Focused context — code',
};

/**
 * Build a focused context pack. Returns `{ kind, pack, beforeTokens, afterTokens,
 * sections }`. `pack` is markdown with labelled sections holding only the decisive
 * lines. Empty input yields an empty pack; unknown code with no signatures falls
 * back to the trimmed source so nothing decisive is ever dropped silently.
 */
export function buildContextPack(input, options = {}) {
  const text = String(input ?? '');
  if (!text.trim()) {
    return { kind: 'empty', pack: '', beforeTokens: 0, afterTokens: 0, sections: [] };
  }

  const kind = options.kind && EXTRACTORS[options.kind] ? options.kind : detectPackKind(text);
  const { sections } = EXTRACTORS[kind](text);

  const nonEmpty = sections.filter(s => s.lines && s.lines.length);
  const body = [];
  for (const s of nonEmpty) {
    body.push(`## ${s.title}`, ...s.lines, '');
  }
  const assembled = body.join('\n').trim();
  // If extraction found nothing usable, return the trimmed original (graceful).
  const pack = assembled ? `# ${KIND_LABEL[kind]}\n\n${assembled}` : text.trim();

  return {
    kind,
    pack,
    beforeTokens: estimateTokens(text),
    afterTokens: estimateTokens(pack),
    sections: nonEmpty,
  };
}
