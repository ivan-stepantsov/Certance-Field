#!/usr/bin/env node
/**
 * Certance Token Kit — Compress CLI
 * ===================================
 * Pre-processes content before it enters Copilot Chat context.
 * Inspired by Headroom's SmartCrusher, CodeCompressor, and output filtering.
 *
 * Usage:
 *   node compress.js <file>                  # auto-detect type from extension
 *   node compress.js <file> --mode json      # force JSON mode
 *   node compress.js <file> --mode code      # force code mode
 *   node compress.js <file> --mode output    # force test output mode
 *   node compress.js <file> --mode instructions  # compress instruction/docs prose
 *   cat test-output.txt | node compress.js --mode output   # pipe stdin
 *   node compress.js <file> --write          # overwrite file in place
 *   node compress.js <file> --copy           # write to <file>.compressed
 *
 * Output: compressed content printed to stdout + stats to stderr.
 * Pipe directly: node compress.js LoginPage.ts | pbcopy  (macOS clipboard)
 *
 * Zero runtime dependencies — requires only Node.js 16+ to execute.
 */

import fs from 'node:fs';
import path from 'node:path';
import { compressContent, formatCompressionStats, isCompressionMode } from './lib/engine.js';
import { protectSecrets } from './lib/secret-protection.js';

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { file: null, mode: null, write: false, copy: false, stdin: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      opts.mode = args[++i];
    } else if (args[i] === '--write') {
      opts.write = true;
    } else if (args[i] === '--copy') {
      opts.copy = true;
    } else if (!args[i].startsWith('-')) {
      opts.file = args[i];
    }
  }

  // Detect stdin
  opts.stdin = !process.stdin.isTTY && !opts.file;
  return opts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readInput(opts) {
  if (opts.stdin) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return { input: Buffer.concat(chunks).toString('utf8'), filename: 'stdin.txt' };
  }
  if (opts.file) {
    const filePath = path.resolve(opts.file);
    if (!fs.existsSync(filePath)) {
      process.stderr.write(`Error: file not found: ${filePath}\n`);
      process.exit(1);
    }
    return { input: fs.readFileSync(filePath, 'utf8'), filename: path.basename(filePath) };
  }
  process.stderr.write(
    'Usage: node compress.js <file> [--mode json|code|output|instructions] [--write] [--copy]\n' +
    '       node compress.js <file> [--mode instructions]\n' +
    '       cat output.txt | node compress.js --mode output\n'
  );
  process.exit(1);
}

function writeOutput(opts, output) {
  if (opts.write && opts.file) {
    fs.writeFileSync(path.resolve(opts.file), output, 'utf8');
    process.stderr.write(`  Written: ${opts.file}\n`);
  } else if (opts.copy && opts.file) {
    const outPath = path.resolve(opts.file) + '.compressed';
    fs.writeFileSync(outPath, output, 'utf8');
    process.stderr.write(`  Written: ${outPath}\n`);
  } else {
    process.stdout.write(output);
    if (!output.endsWith('\n')) process.stdout.write('\n');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.mode && !isCompressionMode(opts.mode)) {
    process.stderr.write(
      `Error: invalid mode "${opts.mode}". Use --mode json|code|output|instructions.\n`
    );
    process.exit(1);
  }

  const { input, filename } = await readInput(opts);
  const protectionReport = protectSecrets(input, { filename });

  let result;
  try {
    result = compressContent(protectionReport.output, { mode: opts.mode, filename });
  } catch (err) {
    process.stderr.write(`Compression error: ${err.message}\n`);
    process.exit(1);
  }

  const { output, ...stats } = result;
  if (protectionReport.redacted) {
    const labels = protectionReport.findings.map(item => `${item.id}=${item.count}`).join(', ');
    process.stderr.write(
      `[certance-secrets] Redacted ${protectionReport.totalRedactions} high-confidence secret match(es): ${labels}\n\n`
    );
  }
  process.stderr.write(formatCompressionStats(filename, stats));
  writeOutput(opts, output);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
