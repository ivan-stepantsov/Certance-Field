// CE: Install Pre-commit Secret Scan — generates a self-contained git hook that
// scans STAGED content and blocks a commit carrying a secret.
//
// DRY by construction: the scanner is GENERATED from the canonical pattern
// summaries (getSecretPatternSummaries), so the committed hook can never drift
// from the chat redactor's patterns. Pure regex; local; no network; no tokens.
//
// Non-destructive by construction (same rule as the guardrail/MCP work): we
// never overwrite a hook we didn't write, and never override an existing
// core.hooksPath. In those cases we write only the scanner and ADVISE.

const SCANNER_REL_PATH = '.ce-token-kit/secret-scan-hook.cjs';
const HOOK_MARKER = 'CE-TOKEN-KIT-HOOK';
// One-line snippet a user can paste into their own existing hook / husky setup.
const HOOK_SNIPPET = 'node "$(git rev-parse --show-toplevel)/.ce-token-kit/secret-scan-hook.cjs" || exit 1';

function ensureGlobalFlags(flags) {
  const value = String(flags || '');
  return value.includes('g') ? value : `${value}g`;
}

// Generate the self-contained pre-commit scanner from the canonical pattern
// summaries AND the scanner suppression source. Patterns are embedded via
// `new RegExp(source, flags)` (source is JSON-escaped, so no literal-escaping
// hazards). `suppressionSource` is the stringified body of the EXACT helpers
// scanSecrets uses (getScannerSuppressionSource), inlined verbatim so the hook
// makes the identical block/skip decision — no hand-maintained second copy, no
// drift. When run as a hook it scans staged content and exits non-zero on a hit;
// when `require`d it exports its scan functions so the artifact is unit-testable.
function generateHookScanner(patternSummaries, suppressionSource) {
  const patternLines = (Array.isArray(patternSummaries) ? patternSummaries : [])
    .map(p => `  { id: ${JSON.stringify(p.id)}, re: new RegExp(${JSON.stringify(p.source)}, ${JSON.stringify(ensureGlobalFlags(p.flags))}) },`)
    .join('\n');

  return `#!/usr/bin/env node
'use strict';
// Certance Token Kit — pre-commit secret scan (GENERATED, self-contained; safe to commit).
// Scans STAGED file content and blocks the commit if a secret is detected.
// Pure regex; local; no network; no tokens. Bypass once: git commit --no-verify
// Regenerate from VS Code: "CE: Install Pre-commit Secret Scan". ${HOOK_MARKER}
const { execFileSync } = require('node:child_process');

const MAX_BYTES = 524288;
const PATTERNS = [
${patternLines}
];

// --- Inlined from scanSecrets (getScannerSuppressionSource) — do not edit here;
// change scripts/lib/secret-protection.js and regenerate. Keeps hook == scanner.
${suppressionSource}
// --- end inlined suppression -------------------------------------------------

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) { if (text[i] === '\\n') { line += 1; } }
  return line;
}

// Mirrors scanSecrets' block decision exactly: real .env* files flag every
// non-placeholder assignment value; every pattern hit flags unless its value is a
// suppressed placeholder/identifier (high-confidence token formats return null
// from placeholderValueForMatch and are never suppressed).
function scanText(text, file) {
  const findings = [];
  const seen = new Set();
  const add = (id, line) => { const key = id + ':' + line; if (!seen.has(key)) { seen.add(key); findings.push({ id, line }); } };

  if (file && shouldRunDotenvStage(file)) {
    text.split('\\n').forEach((ln, i) => {
      const t = ln.trim();
      if (!t || t[0] === '#') { return; }
      const m = ln.match(DOTENV_ASSIGNMENT_RE);
      const value = m ? (m[2] == null ? '' : m[2]) : '';
      if (m && value.length > 0 && !isPlaceholderSecret(value)) { add('dotenv-assignment', i + 1); }
    });
  }

  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text)) !== null) {
      const pv = placeholderValueForMatch(p.id, m);
      if (pv === null || !isSuppressedHeuristicValue(p.id, pv, m)) { add(p.id, lineOf(text, m.index)); }
      if (m.index === p.re.lastIndex) { p.re.lastIndex += 1; }
    }
  }
  return findings;
}

function scanStagedFile(file) {
  let content;
  try { content = execFileSync('git', ['show', ':' + file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch { return []; }
  if (!content || content.length > MAX_BYTES || content.indexOf('\\u0000') !== -1) { return []; }
  return scanText(content, file).map(f => ({ file, line: f.line, id: f.id }));
}

function run() {
  let staged;
  try { staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM', '-z'], { encoding: 'utf8' }); }
  catch { process.exit(0); }
  const files = staged.split('\\u0000').filter(Boolean);
  const problems = [];
  for (const file of files) { for (const p of scanStagedFile(file)) { problems.push(p); } }
  if (problems.length) {
    process.stderr.write('\\n\\u2716 Certance Token Kit blocked this commit — possible secret(s) in staged content:\\n\\n');
    for (const p of problems) { process.stderr.write('   ' + p.file + ':' + p.line + '  (' + p.id + ')\\n'); }
    process.stderr.write('\\nRemove or rotate the secret before committing.\\nBest-effort local regex scan. To bypass once: git commit --no-verify\\n\\n');
    process.exit(1);
  }
}

if (require.main === module) { run(); }
else { module.exports = { scanText, scanStagedFile }; }
`;
}

// The POSIX-sh hook git invokes. Resolves the repo top-level itself so it works
// from any worktree, fails OPEN if node is missing (loud warning, never bricks
// commits), and carries the marker so a re-install recognizes its own hook.
function buildHookShell() {
  return `#!/bin/sh
# Certance Token Kit — pre-commit secret scan (generated; safe to commit). ${HOOK_MARKER}
# Scans STAGED content only and blocks the commit if a secret is found.
# Managed by "CE: Install Pre-commit Secret Scan". Bypass once: git commit --no-verify
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
scanner="$root/${SCANNER_REL_PATH}"
[ -f "$scanner" ] || exit 0
if command -v node >/dev/null 2>&1; then
  node "$scanner" || exit 1
else
  echo "CE: pre-commit secret scan skipped — node not found on PATH" >&2
fi
`;
}

// Decide what is safe to write. The scanner is always (re)written (it is our own
// namespaced file); the hook is written only when absent or already ours.
function planHookInstall({ hooksPathConfig, existingHookContent }) {
  const configured = String(hooksPathConfig || '').trim();
  if (configured && configured !== '.ce-token-kit/hooks' && !configured.startsWith('.git')) {
    // A custom hooks directory is in force (e.g. husky). Writing .git/hooks would
    // be ignored by git, so we advise wiring the snippet into that setup instead.
    return { action: 'conflict-hookspath', writeHook: false, writeScanner: true, hooksPath: configured };
  }
  if (existingHookContent === null || existingHookContent === undefined) {
    return { action: 'fresh', writeHook: true, writeScanner: true };
  }
  if (existingHookContent.includes(HOOK_MARKER)) {
    return { action: 'already', writeHook: true, writeScanner: true };
  }
  return { action: 'conflict-custom', writeHook: false, writeScanner: true };
}

function renderInstallReport({ plan, hookPath, patternCount }) {
  const lines = [
    '# Certance Token Kit — Pre-commit Secret Scan',
    '',
    `_Self-contained hook generated from ${patternCount} active pattern(s). Pure regex; local; no network; no tokens._`,
    '',
  ];

  if (plan.action === 'fresh' || plan.action === 'already') {
    lines.push(
      plan.action === 'fresh' ? '## ✅ Installed' : '## ✅ Refreshed',
      '',
      `- Hook: \`${hookPath}\` — runs on every \`git commit\`.`,
      `- Scanner: \`${SCANNER_REL_PATH}\` — self-contained; **commit it** so teammates can reuse it.`,
      '- Scans **staged content only** (`git diff --cached`). Gitignored files are never staged, so your local `.env` is never scanned — but a *staged* secret is **blocked**.',
      '',
      '### Try it',
      '1. Stage a line like `const k = "ghp_' + 'x'.repeat(36) + '"` and run `git commit`.',
      '2. The commit is blocked with the `file:line (type)` of the secret — no value is printed.',
      '3. Real bypass when you must: `git commit --no-verify` (honest escape hatch).',
      '',
      '### Share with the team',
      `- Commit \`${SCANNER_REL_PATH}\`. Teammates run **CE: Install Pre-commit Secret Scan** once (or set \`git config core.hooksPath\`) to activate the hook in their clone — git hooks are per-clone by design.`,
      '',
    );
  } else if (plan.action === 'conflict-custom') {
    lines.push(
      '## ⚠️ Existing pre-commit hook left untouched',
      '',
      `You already have a \`${hookPath}\` that CE did not create — it was **not** overwritten.`,
      `The scanner was still written to \`${SCANNER_REL_PATH}\`. To chain it into your hook, add this line:`,
      '',
      '```sh',
      HOOK_SNIPPET,
      '```',
      '',
    );
  } else if (plan.action === 'conflict-hookspath') {
    lines.push(
      '## ⚠️ Custom hooks directory detected',
      '',
      `\`core.hooksPath\` is set to \`${plan.hooksPath}\` (e.g. husky), so \`.git/hooks\` is bypassed — CE did **not** change your hooks config.`,
      `The scanner was written to \`${SCANNER_REL_PATH}\`. Add this line to your \`${plan.hooksPath}/pre-commit\`:`,
      '',
      '```sh',
      HOOK_SNIPPET,
      '```',
      '',
    );
  }

  lines.push('> Best-effort regex (same patterns as the redactor). It reduces accidental leaks; it is not a guarantee. Pair with the GitHub push-protection / secret-scanning controls.', '');
  return lines.join('\n');
}

module.exports = {
  SCANNER_REL_PATH,
  HOOK_MARKER,
  HOOK_SNIPPET,
  generateHookScanner,
  buildHookShell,
  planHookInstall,
  renderInstallReport,
};
