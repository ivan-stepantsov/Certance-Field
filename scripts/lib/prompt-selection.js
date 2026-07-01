import { compressContent, detectMode } from './engine.js';
import { estimateTokens } from './tokens.js';

const STACK_TRACE_PATTERN = /^\s*at\s+.+:\d+:\d+\)?$/m;
const DIFF_HEADER_PATTERN = /^(diff --git|@@ |---\s|\+\+\+\s)/m;
const ERROR_LINE_PATTERN = /\b(error|exception|failed|failure|assert)\b/i;
const MAX_COMPACT_DIFF_SUMMARY_CHARS = 220;
const MAX_DIFF_HOTSPOTS = 3;

const FILE_TYPE_RULES = [
  { type: 'auth', risk: 'high', re: /(auth|login|session|token|oauth|sso|credential|rbac|permission)/i },
  { type: 'ci', risk: 'high', re: /(^|\/)(\.github\/workflows|gitlab-ci|azure-pipelines|jenkinsfile|circleci)/i },
  { type: 'deps', risk: 'high', re: /(package-lock\.json|pnpm-lock\.ya?ml|yarn\.lock|requirements\.txt|poetry\.lock|pom\.xml|build\.gradle|go\.sum|cargo\.lock)$/i },
  { type: 'config', risk: 'medium', re: /(tsconfig|eslint|prettier|babel|vite|webpack|rollup|dockerfile|compose|\.env|\.ya?ml$|\.toml$|\.ini$|\.json$)/i },
  { type: 'infra', risk: 'medium', re: /(terraform|k8s|helm|ansible|pulumi|docker|compose)/i },
  { type: 'tests', risk: 'low', re: /(^|\/)(test|tests|spec|__tests__|features)\//i },
  { type: 'docs', risk: 'low', re: /\.(md|mdx|adoc|rst|txt)$/i },
];

const RISK_SCORE = {
  low: 1,
  medium: 2,
  high: 3,
};

function truncatePreview(text, maxLength = 120) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3)}...`;
}

function isDiffSelection(text) {
  return DIFF_HEADER_PATTERN.test(text);
}

// A strong signal: real stack frames like "at file.js:12:9". Source code never
// contains these, so they win outright.
function hasStackFrames(text) {
  return STACK_TRACE_PATTERN.test(text);
}

// A weak signal: the mere word "error"/"exception"/"failed"/"assert". Real code
// says these constantly (throw new Error(...)), so on its own it must NOT beat a
// code filename — only classify as a trace when there is no code file behind it.
function hasErrorWord(trimmed) {
  return ERROR_LINE_PATTERN.test(trimmed);
}

function detectKindFromFilename(metadata) {
  const filenameMode = metadata.filename ? detectMode(metadata.filename) : 'unknown';
  if (filenameMode === 'code' || filenameMode === 'json' || filenameMode === 'output') {
    return filenameMode;
  }
  return null;
}

function isJsonLikeSelection(trimmed) {
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

function classifyFileType(filePath) {
  for (const rule of FILE_TYPE_RULES) {
    if (rule.re.test(filePath)) {
      return { type: rule.type, risk: rule.risk };
    }
  }
  return { type: 'code', risk: 'medium' };
}

function parseDiffPath(line) {
  const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (match) return match[2];
  const plusPlus = line.match(/^\+\+\+\s+b\/(.+)$/);
  if (plusPlus) return plusPlus[1];
  return null;
}

function createDiffFileRecord(filePath) {
  const classified = classifyFileType(filePath);
  return {
    path: filePath,
    additions: 0,
    deletions: 0,
    hunks: 0,
    type: classified.type,
    risk: classified.risk,
  };
}

function collectDiffStats(lines) {
  const files = new Map();
  let currentFile = null;
  let additions = 0;
  let deletions = 0;
  let hunks = 0;

  for (const line of lines) {
    const parsedPath = parseDiffPath(line);
    if (parsedPath) {
      if (!files.has(parsedPath)) {
        files.set(parsedPath, createDiffFileRecord(parsedPath));
      }
      currentFile = files.get(parsedPath);
      continue;
    }

    if (line.startsWith('@@ ')) {
      hunks += 1;
      if (currentFile) currentFile.hunks += 1;
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions += 1;
      if (currentFile) currentFile.additions += 1;
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      deletions += 1;
      if (currentFile) currentFile.deletions += 1;
    }
  }

  const fileRecords = [...files.values()];
  const fileCount = fileRecords.length || 1;
  return {
    fileCount,
    hunks: hunks || 1,
    additions,
    deletions,
    fileRecords,
  };
}

function summarizeRiskByType(fileRecords) {
  const byType = new Map();
  let highestRisk = 'low';

  for (const file of fileRecords) {
    const existing = byType.get(file.type) ?? { count: 0, risk: file.risk };
    existing.count += 1;
    if (RISK_SCORE[file.risk] > RISK_SCORE[existing.risk]) {
      existing.risk = file.risk;
    }
    byType.set(file.type, existing);
    if (RISK_SCORE[file.risk] > RISK_SCORE[highestRisk]) {
      highestRisk = file.risk;
    }
  }

  const sorted = [...byType.entries()].sort((a, b) => {
    const riskDelta = RISK_SCORE[b[1].risk] - RISK_SCORE[a[1].risk];
    if (riskDelta !== 0) return riskDelta;
    return b[1].count - a[1].count;
  });

  const typeRiskSummary = sorted.slice(0, 2).map(([type, details]) => `${type}=${details.risk}`).join(', ');
  return { highestRisk, typeRiskSummary };
}

function riskHotspots(fileRecords) {
  return [...fileRecords]
    .sort((a, b) => {
      const riskDelta = RISK_SCORE[b.risk] - RISK_SCORE[a.risk];
      if (riskDelta !== 0) return riskDelta;
      return (b.additions + b.deletions) - (a.additions + a.deletions);
    })
    .slice(0, MAX_DIFF_HOTSPOTS)
    .map(file => file.path);
}

function summarizeDiff(lines, metadata = {}) {
  const stats = collectDiffStats(lines);
  const { highestRisk, typeRiskSummary } = summarizeRiskByType(stats.fileRecords);
  const hotspots = riskHotspots(stats.fileRecords);
  const compact = [
    `Selected diff: files=${stats.fileCount}, hunks=${stats.hunks}, +${stats.additions}/-${stats.deletions}, risk=${highestRisk}`,
    typeRiskSummary ? `byType=${typeRiskSummary}` : null,
    hotspots.length > 0 ? `hotspots=${hotspots.join('|')}` : null,
  ].filter(Boolean).join('; ');

  if (metadata.diffSummaryMode === 'expanded') {
    return [
      'Selected diff summary:',
      `- Files changed: ${stats.fileCount}`,
      `- Hunks: ${stats.hunks}`,
      `- Net lines: +${stats.additions}/-${stats.deletions}`,
      `- Risk: ${highestRisk}${typeRiskSummary ? ` (by type: ${typeRiskSummary})` : ''}`,
      `- Hotspots: ${hotspots.length > 0 ? hotspots.join(', ') : 'none'}`,
    ].join('\n');
  }

  return truncatePreview(compact, MAX_COMPACT_DIFF_SUMMARY_CHARS);
}

export function detectSelectionKind(text, metadata = {}) {
  const trimmed = text.trim();
  if (!trimmed) return 'selected-text';

  if (isDiffSelection(text)) return 'diff';

  // Real stack frames are unambiguous and beat everything else.
  if (hasStackFrames(text)) return 'stack-trace';

  // An open code/json/output file beats the weak error-word heuristic below, so
  // source that merely mentions "Error" still reaches the code path (e.g. the
  // comment-preserving Explain compressor) instead of the log compressor.
  const filenameKind = detectKindFromFilename(metadata);
  if (filenameKind) return filenameKind;

  // No code file behind it, but it reads like an error: treat pasted error /
  // console output as a stack trace.
  if (hasErrorWord(trimmed)) return 'stack-trace';

  if (isJsonLikeSelection(trimmed)) {
    return 'json';
  }

  return 'selected-text';
}

function summarizeStackTrace(lines) {
  const nonEmpty = lines.map(l => l.trim()).filter(Boolean);
  const errorLine = nonEmpty.find(l => ERROR_LINE_PATTERN.test(l)) ?? nonEmpty[0] ?? 'Stack trace selected.';
  const frames = lines
    .map(l => l.trim())
    .filter(l => STACK_TRACE_PATTERN.test(l))
    .slice(0, 3)
    .map(l => truncatePreview(l, 90));
  return frames.length > 0
    ? `Selected stack trace: ${truncatePreview(errorLine)} Frames: ${frames.join(' | ')}.`
    : `Selected error output: ${truncatePreview(errorLine)}.`;
}

function firstPreview(lines, fallback) {
  return lines.map(l => l.trim()).find(Boolean) ?? fallback;
}

const KIND_SUMMARIZERS = {
  'stack-trace': (lines) => summarizeStackTrace(lines),
  code:          (lines) => `Selected code (${lines.length} lines): ${truncatePreview(firstPreview(lines, 'Code selection'))}.`,
  json:          (lines) => `Selected JSON payload (${lines.length} lines). Keep only the fields relevant to the task.`,
  output:        (lines) => `Selected output (${lines.length} lines): ${truncatePreview(firstPreview(lines, 'Output selection'))}.`,
};

export function summarizeSelection(text, metadata = {}) {
  const kind = detectSelectionKind(text, metadata);
  const lines = text.split('\n');
  let summary;

  if (kind === 'diff') {
    summary = summarizeDiff(lines, metadata);
  } else {
    const summarizer = KIND_SUMMARIZERS[kind];
    summary = summarizer
      ? summarizer(lines)
      : `Selected text (${lines.length} lines): ${truncatePreview(firstPreview(lines, 'Selected text'))}.`;
  }

  return { kind, summary };
}

export function buildSelectionWarnings(kind) {
  if (kind === 'diff') {
    return ['Diff detected. Ask for changed behavior, regression risk, or the smallest safe fix.'];
  }
  if (kind === 'stack-trace') {
    return ['Stack trace detected. Include the failing assertion or top error line if you have it.'];
  }
  return [];
}

export function optimizeSelectionText(text, metadata = {}) {
  const kind = detectSelectionKind(text, metadata);

  // Map the detected kind to a real compression mode where one applies. Stack
  // traces and error/console logs compress best with the output engine, which
  // keeps the error message, Expected/Received lines, code-frame markers, and
  // top source frames while dropping passing tests and runtime-internal noise.
  // Routing them here instead of to the one-line summary fallback preserves the
  // failing assertion — the part you actually need to debug.
  const compressionMode = kind === 'code' || kind === 'json' || kind === 'output'
    ? kind
    : kind === 'stack-trace'
      ? 'output'
      : kind === 'diff'
        ? 'diff'
        : null;

  if (compressionMode) {
    const result = compressContent(text, {
      mode: compressionMode,
      filename: metadata.filename ?? '',
    });
    return {
      kind,
      output: result.output,
      beforeTokens: result.beforeTokens,
      afterTokens: result.afterTokens,
      ratio: result.ratio,
      warnings: [],
    };
  }

  const summary = summarizeSelection(text, metadata);
  const beforeTokens = estimateTokens(text);
  const afterTokens = estimateTokens(summary.summary);
  const ratio = beforeTokens > 0 ? Math.round((1 - afterTokens / beforeTokens) * 100) : 0;

  return {
    kind,
    output: summary.summary,
    beforeTokens,
    afterTokens,
    ratio,
    warnings: buildSelectionWarnings(kind),
  };
}

// Above this many tokens, an "explain" selection is treated as too large to
// explain line-by-line, so it is outlined (signatures kept, bodies dropped) for
// a structural explanation. Below it, the selection is compressed but comments
// are KEPT — for "explain this code" the comments carry the intent to explain.
// Raised from 500: a ~55-line file should get a real explanation, not a map.
export const EXPLAIN_OUTLINE_THRESHOLD_TOKENS = 1200;

// Shared by the palette "CE: Explain Selection" and the chat "/explain": one
// size-aware, comment-preserving policy so both surfaces behave identically.
export function explainSelection(text, metadata = {}) {
  const filename = metadata.filename ?? '';
  const kind = detectSelectionKind(text, metadata);

  if (kind === 'code') {
    const outlined = estimateTokens(text) >= EXPLAIN_OUTLINE_THRESHOLD_TOKENS;
    const result = outlined
      ? compressContent(text, { mode: 'outline', filename })
      : compressContent(text, { mode: 'code', filename, keepComments: true });
    return {
      kind,
      outlined,
      output: result.output,
      language: result.language,
      beforeTokens: result.beforeTokens,
      afterTokens: result.afterTokens,
      ratio: result.ratio,
      warnings: [],
    };
  }

  // Non-code selections (diff, stack trace, JSON, logs) have no outline notion —
  // keep the existing compression behavior.
  return { ...optimizeSelectionText(text, metadata), outlined: false };
}
