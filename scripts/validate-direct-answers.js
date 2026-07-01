#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimateTokens } from './lib/tokens.js';

// Quality gate: each requirement is a GROUP of alternatives; a complete answer
// must contain at least one alternative per group. A group with no match means a
// decisive concept was dropped — the answer is short-but-incomplete. This is what
// turns "shorter" into "shorter AND still correct/safe". Case-insensitive.
export function findMissingRequirements(output, requiredElements) {
  const haystack = String(output || '').toLowerCase();
  const groups = Array.isArray(requiredElements) ? requiredElements : [];
  const missing = [];
  for (const group of groups) {
    const alternatives = Array.isArray(group) ? group : [group];
    const satisfied = alternatives.some(alt => haystack.includes(String(alt).toLowerCase()));
    if (!satisfied) missing.push(alternatives.join(' | '));
  }
  return missing;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    promptSet: 'measurement/direct-answer-prompt-set.json',
    snapshot: 'measurement/direct-answer-snapshot.example.json',
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--prompt-set' && args[index + 1]) {
      opts.promptSet = args[++index];
    } else if (arg === '--snapshot' && args[index + 1]) {
      opts.snapshot = args[++index];
    }
  }

  return opts;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function resolveOutput(variant, snapshotPath) {
  if (typeof variant.output === 'string') {
    return variant.output;
  }

  if (typeof variant.outputFile === 'string' && variant.outputFile) {
    const baseDir = path.dirname(path.resolve(snapshotPath));
    const resolvedPath = path.resolve(baseDir, variant.outputFile);
    return fs.readFileSync(resolvedPath, 'utf8').trimEnd();
  }

  return '';
}

function findCoverageErrors(prompts, resultsById, snapshotPath) {
  const orderedVariants = ['baseline', 'concise', 'directDefault'];
  const errors = [];

  for (const prompt of prompts) {
    const variants = resultsById.get(prompt.id);
    if (!variants) {
      errors.push(`Missing snapshot result for prompt '${prompt.id}'.`);
      continue;
    }

    for (const key of orderedVariants) {
      if (!Object.prototype.hasOwnProperty.call(variants, key)) {
        errors.push(`Missing variant '${key}' for prompt '${prompt.id}'.`);
        continue;
      }

      const output = resolveOutput(variants[key] || {}, snapshotPath);
      if (!output.trim()) {
        errors.push(`Missing output for variant '${key}' in prompt '${prompt.id}'.`);
      }
    }
  }

  return errors;
}

function verdictCell(value) {
  return value === true ? 'pass' : value === false ? 'fail' : 'review';
}

function buildRow(prompt, variants, snapshotPath) {
  const ordered = ['baseline', 'concise', 'directDefault'];
  const variantRows = [];

  for (const key of ordered) {
    const variant = variants[key] || {};
    const output = resolveOutput(variant, snapshotPath);
    const complete = Array.isArray(prompt.requiredElements) && prompt.requiredElements.length > 0
      ? (findMissingRequirements(output, prompt.requiredElements).length === 0 ? 'pass' : 'fail')
      : '—';
    variantRows.push({
      name: key,
      tokens: output ? estimateTokens(output) : 0,
      mainIdea: verdictCell(variant.keptMainIdea),
      reason: verdictCell(variant.keptReason),
      nextAction: verdictCell(variant.keptNextAction),
      safety: verdictCell(variant.keptSafety),
      complete,
      notes: variant.notes || '',
    });
  }

  const lines = [
    `### ${prompt.id} — ${prompt.title}`,
    '',
    `Prompt: ${prompt.prompt}`,
    '',
    '| Variant | Tokens | Main idea | Reason | Next action | Safety | Complete | Notes |',
    '|---|---:|---|---|---|---|---|---|',
  ];

  for (const row of variantRows) {
    lines.push(`| ${row.name} | ${row.tokens} | ${row.mainIdea} | ${row.reason} | ${row.nextAction} | ${row.safety} | ${row.complete} | ${row.notes} |`);
  }

  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv);
  const promptSet = readJson(opts.promptSet);
  const snapshot = readJson(opts.snapshot);
  const prompts = promptSet.prompts || [];
  const resultsById = new Map((snapshot.results || []).map(result => [result.id, result.variants || {}]));
  const coverageErrors = findCoverageErrors(prompts, resultsById, opts.snapshot);

  if (coverageErrors.length > 0) {
    process.stderr.write('Direct-answer snapshot is incomplete.\n');
    for (const error of coverageErrors) {
      process.stderr.write(`- ${error}\n`);
    }
    process.exitCode = 1;
    return;
  }

  // Quality gate: the CONCISE (terse) answer must retain every decisive concept.
  // This catches answers that are shorter but incomplete or unsafe.
  const qualityErrors = [];
  for (const prompt of prompts) {
    if (!Array.isArray(prompt.requiredElements) || prompt.requiredElements.length === 0) continue;
    const variants = resultsById.get(prompt.id) || {};
    const conciseOutput = resolveOutput(variants.concise || {}, opts.snapshot);
    for (const group of findMissingRequirements(conciseOutput, prompt.requiredElements)) {
      qualityErrors.push(`Concise answer for '${prompt.id}' is short but incomplete — missing a required element: [${group}].`);
    }
  }

  if (qualityErrors.length > 0) {
    process.stderr.write('Direct-answer quality check failed (a terse answer dropped decisive content).\n');
    for (const error of qualityErrors) {
      process.stderr.write(`- ${error}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const sections = [
    '# Direct-Answer Validation Report',
    '',
    `Prompt set: ${opts.promptSet}`,
    `Snapshot: ${opts.snapshot}`,
    '',
    'Use this report to compare normal output, a plain concise request, and the persistent direct-default style against the same prompt set.',
    '',
  ];

  for (const prompt of prompts) {
    sections.push(buildRow(prompt, resultsById.get(prompt.id) || {}, opts.snapshot));
    sections.push('');
  }

  process.stdout.write(sections.join('\n'));
  if (!sections[sections.length - 1].endsWith('\n')) process.stdout.write('\n');
}

// Run only when invoked directly, so the pure helpers can be imported in tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}