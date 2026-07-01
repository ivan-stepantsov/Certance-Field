#!/usr/bin/env node
// Read the committed eval snapshot and report how much @cetoken-concise shortens
// model output. No model calls — pure measurement, safe to run in CI.
//
// Tokens are counted with the kit's own estimateTokens heuristic (the same
// approximation the extension reports everywhere), so the numbers are internally
// consistent. They are an APPROXIMATION of real tokenizer counts; read them as
// "output-length reduction", not exact provider tokens. The ratio between arms
// is what matters, and the heuristic is applied identically to every arm.
//
// The headline, honest number is concise_* vs __terse__ — what our instruction
// adds on top of a plain "Answer concisely." ask.
//
// Usage: node evals/concise/measure.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { estimateTokens } from '../../scripts/lib/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = join(HERE, 'snapshots', 'results.json');

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = x => `${x >= 0 ? '' : '−'}${Math.abs(x * 100).toFixed(0)}%`;

function main() {
  let snap;
  try {
    snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  } catch {
    console.error(`No snapshot at ${SNAPSHOT}. Run: node evals/concise/run.mjs`);
    process.exit(1);
  }

  const { arms, metadata } = snap;
  const n = metadata.prompt_count;

  // Token count per arm per prompt; drop any prompt where an arm failed/empty.
  const tokens = {};
  for (const arm of Object.keys(arms)) {
    tokens[arm] = arms[arm].map(o => (o && !o.startsWith('__ERROR__') ? estimateTokens(o) : null));
  }
  const valid = [];
  for (let i = 0; i < n; i++) {
    if (Object.keys(arms).every(a => tokens[a][i] != null && tokens[a][i] > 0)) {
      valid.push(i);
    }
  }

  const armMean = arm => Math.round(mean(valid.map(i => tokens[arm][i])));

  console.log(`# @cetoken-concise output-reduction eval\n`);
  console.log(`_Model: ${metadata.model} · generated ${metadata.generated_at} · ${valid.length}/${n} prompts usable_\n`);
  console.log(`Mean output tokens per arm (lower = cheaper output):\n`);
  console.log('| Arm | Mean output tokens |');
  console.log('|---|--:|');
  for (const arm of Object.keys(arms)) {
    console.log(`| \`${arm}\` | ${armMean(arm)} |`);
  }

  const reductions = (arm, vs) => valid.map(i => 1 - tokens[arm][i] / tokens[vs][i]);
  const row = (label, arm, vs) => {
    const r = reductions(arm, vs);
    return `| ${label} | ${pct(median(r))} | ${pct(mean(r))} | ${pct(Math.min(...r))} | ${pct(Math.max(...r))} |`;
  };

  console.log(`\nOutput reduction (positive = shorter than the comparison arm):\n`);
  console.log('| Comparison | Median | Mean | Min | Max |');
  console.log('|---|--:|--:|--:|--:|');
  for (const arm of Object.keys(arms).filter(a => a.startsWith('concise_'))) {
    console.log(row(`**${arm}** vs \`__terse__\` (honest)`, arm, '__terse__'));
    console.log(row(`${arm} vs \`__baseline__\``, arm, '__baseline__'));
  }

  const headline = median(reductions('concise_full', '__terse__'));
  console.log(`\n**Headline:** \`concise_full\` is **${pct(headline)}** shorter (median) than a plain "Answer concisely." ask — and ${pct(median(reductions('concise_full', '__baseline__')))} shorter than an unguided answer.`);
}

main();
