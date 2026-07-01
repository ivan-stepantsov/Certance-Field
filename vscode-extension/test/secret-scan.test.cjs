const test = require('node:test');
const assert = require('node:assert/strict');

const { scanFiles, buildSecretScanReport, readableText } = require('../src/secret-scan.cjs');

// A deterministic fake scanner: flags any line containing SECRET. (The real
// shared.scanSecrets is covered by scripts/lib/secret-protection.test.js.)
function fakeScan(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes('SECRET')) {out.push({ id: 'fake-token', line: i + 1, column: 1, label: '[REDACTED_FAKE]' });}
  });
  return out;
}

test('scanFiles classifies findings by tracked state and counts scanned/skipped', () => {
  const texts = {
    'src/config.ts': 'const k = "SECRET";',
    'seed.json': 'no secret here',
    'new.env': 'API=SECRET',
    'image.png': null, // skipped (binary/oversized -> reader returns null)
  };
  const tracked = new Set(['src/config.ts', 'seed.json']);

  const result = scanFiles({
    files: Object.keys(texts),
    readText: f => texts[f],
    scan: fakeScan,
    isTracked: f => tracked.has(f),
  });

  assert.equal(result.scannedCount, 3, 'three readable files scanned');
  assert.equal(result.skippedCount, 1, 'the null-reader file is skipped');
  assert.equal(result.findings.length, 2, 'two files contain a secret');

  // Tracked finding sorts ahead of the untracked one.
  assert.equal(result.findings[0].file, 'src/config.ts');
  assert.equal(result.findings[0].tracked, true);
  assert.equal(result.findings[1].file, 'new.env');
  assert.equal(result.findings[1].tracked, false);
});

test('buildSecretScanReport renders a clean report with no findings', () => {
  const md = buildSecretScanReport({ findings: [], scannedCount: 42, skippedCount: 3, meta: { workspace: 'demo' } });
  assert.match(md, /✅ No secrets found in committable files/);
  assert.match(md, /Scanned 42 file\(s\); 3 skipped/);
  assert.match(md, /Gitignored files were not scanned by design/);
  assert.doesNotMatch(md, /\| File \| Line \|/, 'no findings table when clean');
});

test('buildSecretScanReport tabulates findings with risk-ranked status', () => {
  const findings = [
    { file: 'src/config.ts', line: 12, column: 5, id: 'github-token', tracked: true },
    { file: 'new.env', line: 1, column: 1, id: 'dotenv-assignment', tracked: false },
  ];
  const md = buildSecretScanReport({ findings, scannedCount: 10, skippedCount: 0, meta: { workspace: 'demo' } });

  assert.match(md, /⛔ 2 potential secret\(s\)/);
  assert.match(md, /1 in \*\*tracked\*\* files/);
  assert.match(md, /`src\/config\.ts` \| 12 \| github-token \| 🔴 tracked in git/);
  assert.match(md, /`new\.env` \| 1 \| dotenv-assignment \| 🟠 not yet committed/);
  assert.match(md, /CE: Install Pre-commit Secret Scan/, 'points to the commit-time guard');
  // The report carries only redaction types, never secret material.
  assert.doesNotMatch(md, /REDACTED|ghp_|AIza/);
});

test('readableText skips binary, oversized, and empty buffers', () => {
  assert.equal(readableText(Buffer.from('hello world')), 'hello world');
  assert.equal(readableText(Buffer.from([0x68, 0x00, 0x69])), null, 'NUL byte => binary => skip');
  assert.equal(readableText(Buffer.alloc(0)), null, 'empty => skip');
  assert.equal(readableText(Buffer.alloc(600 * 1024, 0x61)), null, 'over 512 KB => skip');
});
