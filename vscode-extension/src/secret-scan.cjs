// CE: Scan Workspace for Secrets — locates secrets in the files Git can COMMIT,
// reusing the exact same patterns as the chat redactor (shared.scanSecrets).
//
// Risk-aware by design: the command feeds in only Git's committable set
// (tracked + untracked-but-not-ignored). Gitignored files — your local `.env`,
// build output, caches — are intentionally NOT scanned, because that is the
// correct place for secrets. So a secret in a gitignored `.env` produces no
// finding; only secrets that can actually escape via a commit are flagged.
//
// Pure regex, local, no network, no tokens. This module is IO-free: the command
// injects the file list, a text reader, the scanner, and a tracked-set lookup,
// which keeps the risk classification and the report fully unit-testable.

const MAX_FILE_BYTES = 512 * 1024; // skip oversized/minified blobs — keeps a big repo fast

// Decide whether a file's bytes are worth scanning. Returns the text to scan, or
// null to skip (too big, or binary — a NUL byte in the head is the usual tell).
function readableText(bytes) {
  if (!bytes || bytes.length === 0) {return null;}
  if (bytes.length > MAX_FILE_BYTES) {return null;}
  const head = bytes.subarray(0, Math.min(bytes.length, 8000));
  if (head.includes(0)) {return null;} // binary
  return bytes.toString('utf8');
}

// Walk the supplied (committable) file list, locating secrets in each. IO is
// injected so this stays pure: `readText(file)` returns a string or null (skip),
// `scan` is shared.scanSecrets, `isTracked(file)` marks already-committed files.
function scanFiles({ files, readText, scan, isTracked }) {
  const findings = [];
  let scannedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const text = readText(file);
    if (text === null || text === undefined) {
      skippedCount += 1;
      continue;
    }
    scannedCount += 1;
    for (const hit of scan(text, { filename: file })) {
      findings.push({
        file,
        line: hit.line,
        column: hit.column,
        id: hit.id,
        tracked: isTracked ? !!isTracked(file) : false,
      });
    }
  }

  // Already-tracked secrets first (higher risk — may be pushed), then by path/line.
  findings.sort((a, b) =>
    Number(b.tracked) - Number(a.tracked) ||
    a.file.localeCompare(b.file) ||
    a.line - b.line);

  return { findings, scannedCount, skippedCount };
}

function statusFor(tracked) {
  return tracked
    ? '🔴 tracked in git — rotate; may already be pushed'
    : '🟠 not yet committed — gitignore or remove before commit';
}

function buildSecretScanReport({ findings, scannedCount, skippedCount, meta }) {
  const m = meta || {};
  const lines = [
    '# Certance Token Kit — Secret Scan',
    '',
    `_Generated ${m.generatedAt || ''} · workspace \`${m.workspace || '(no folder)'}\` · scanned ${scannedCount} file(s), ${skippedCount} skipped_`,
    '',
    '> **Risk-aware scan.** Only files Git can commit are checked. Gitignored files (your local `.env`, build output, caches) are intentionally **not** scanned — that is the correct place for secrets. Best-effort regex; local, no AI, **zero tokens**.',
    '',
  ];

  if (findings.length === 0) {
    lines.push(
      '## ✅ No secrets found in committable files',
      '',
      `Scanned ${scannedCount} file(s); ${skippedCount} skipped (binary or > ${Math.round(MAX_FILE_BYTES / 1024)} KB). Gitignored files were not scanned by design.`,
      '',
    );
    return lines.join('\n');
  }

  const trackedCount = findings.filter(f => f.tracked).length;
  lines.push(
    `## ⛔ ${findings.length} potential secret(s) in committable files`,
    '',
    `${trackedCount} in **tracked** files (may already be pushed), ${findings.length - trackedCount} in not-yet-committed files. Values are shown only as their redaction type — the scan never copies the secret itself.`,
    '',
    '| File | Line | Type | Status |',
    '|---|---|---|---|',
  );
  for (const f of findings) {
    lines.push(`| \`${f.file}\` | ${f.line} | ${f.id} | ${statusFor(f.tracked)} |`);
  }
  lines.push(
    '',
    '**Next steps**',
    '1. Remove the secret from the file — use an env var or secret manager, not source.',
    '2. If a 🔴 row is already pushed, **rotate** that credential; redacting the file alone does not un-leak it.',
    '3. To block this at commit time, run **CE: Install Pre-commit Secret Scan**.',
    '',
  );
  return lines.join('\n');
}

module.exports = { scanFiles, buildSecretScanReport, readableText, MAX_FILE_BYTES };
