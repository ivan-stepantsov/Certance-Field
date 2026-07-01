#!/usr/bin/env node

import { optimizePrompt } from './lib/prompt-optimizer.js';

const FLAG_MAP = {
  '--file':      'file',
  '--error':     'error',
  '--output':    'output',
  '--selection': 'selection',
};

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { prompt: null, file: null, error: null, output: null, selection: null, xml: false, stdin: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const key = FLAG_MAP[arg];
    if (key && args[i + 1]) {
      opts[key] = args[++i];
    } else if (arg === '--xml') {
      opts.xml = true;
    } else if (!arg.startsWith('-') && !opts.prompt) {
      opts.prompt = arg;
    }
  }

  opts.stdin = !process.stdin.isTTY && !opts.prompt;
  return opts;
}

function printStats(beforeTokens, afterTokens, ratio) {
  const delta = beforeTokens - afterTokens;
  const label = delta >= 0 ? 'Saved' : 'Added';
  const magnitude = Math.abs(delta);
  const qualifier = delta >= 0 ? 'reduction' : 'expansion';
  process.stderr.write(
    `\n[certance-prompt] Prompt optimization\n` +
    `  Before : ~${beforeTokens.toLocaleString()} tokens\n` +
    `  After  : ~${afterTokens.toLocaleString()} tokens\n` +
    `  ${label}  : ~${magnitude.toLocaleString()} tokens (${Math.abs(ratio)}% ${qualifier})\n\n`
  );
}

async function readStdinPrompt() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

function printProtectionReport(protectionReport) {
  if (!protectionReport?.redacted) return;
  const labels = protectionReport.findings.map(item => `${item.id}=${item.count}`).join(', ');
  process.stderr.write(
    `[certance-secrets] Redacted ${protectionReport.totalRedactions} high-confidence secret match(es): ${labels}\n\n`
  );
}

function printWarnings(warnings) {
  if (warnings.length === 0) return;
  for (const warning of warnings) {
    process.stderr.write(`[certance-prompt] Warning: ${warning}\n`);
  }
  process.stderr.write('\n');
}

async function main() {
  const opts = parseArgs(process.argv);
  let prompt = opts.prompt;

  if (opts.stdin) prompt = await readStdinPrompt();

  if (!prompt) {
    process.stderr.write(
      'Usage: node optimize-prompt.js "fix the failing test" [--file path] [--error message] [--output instruction]\n' +
      '       printf "review this diff" | node optimize-prompt.js --file src/app.ts\n'
    );
    process.exit(1);
  }

  const result = optimizePrompt(prompt, {
    file: opts.file,
    error: opts.error,
    output: opts.output,
    selection: opts.selection,
    xml: opts.xml,
  });

  printProtectionReport(result.protectionReport);
  printWarnings(result.warnings);
  printStats(result.beforeTokens, result.afterTokens, result.ratio);
  process.stdout.write(result.optimizedPrompt);
  if (!result.optimizedPrompt.endsWith('\n')) process.stdout.write('\n');
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});