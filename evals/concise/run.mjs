#!/usr/bin/env node
// Generate the @cetoken-concise eval snapshot.
//
// Runs each prompt in prompts.txt through the `claude` CLI under four arms and
// records the real output, so measure.mjs can report how much the concise
// instruction actually shortens answers. Mirrors the three-arm design of the
// MIT-licensed caveman evals (github.com/juliusbrussee/caveman), extended with
// an `ultra` arm.
//
//   __baseline__   no system prompt                     (verbose control)
//   __terse__      "Answer concisely." (system prompt)   (generic-terseness control)
//   concise_full   the shipped full-level instruction    (USER-message prefix)
//   concise_ultra  the shipped ultra-level instruction   (USER-message prefix)
//
// The honest delta for the feature is concise_* vs __terse__ — i.e. what our
// instruction adds on top of a plain "be terse" ask. Comparing to __baseline__
// conflates the instruction with the generic terseness effect.
//
// DELIVERY CHANNEL — matches production, on purpose. The shipped
// @cetoken-concise sends its instruction as a USER-message PREFIX
// (chat-participant.cjs buildAnswer → LanguageModelChatMessage.User(prompt)),
// NOT a system prompt. Measuring it as a system prompt overstates adherence, so
// the concise_* arms deliver via user-prefix here to match exactly what users
// get. The __baseline__/__terse__ controls stay on their original channels
// (none / system prompt): a stronger-adhering control is the conservative choice
// — it makes concise_* work harder to beat, so the honest delta can never
// flatter the tool. This is a deliberate cross-channel asymmetry; read the
// headline as "our shipped user-prefix instruction vs a system-prompt terse
// ask", a comparison that cannot overstate the tool.
//
// The arm instructions are imported from the SHIPPED extension code, so the
// snapshot always measures exactly what users get.
//
// Usage:
//   node evals/concise/run.mjs                 # default model, 5 concurrent
//   CE_EVAL_MODEL=claude-haiku-4-5 node evals/concise/run.mjs
//
// Requires the `claude` CLI logged in. Real model calls — costs a little.

import { execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { buildConciseInstruction } = require('../../vscode-extension/src/chat-participant.cjs');

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.CE_EVAL_MODEL || 'claude-haiku-4-5';
const CONCURRENCY = Number(process.env.CE_EVAL_CONCURRENCY || 5);

// Each arm declares HOW its instruction is delivered (see the DELIVERY CHANNEL
// note above): controls ride the system prompt (or nothing); concise_* ride a
// user-message prefix to mirror what production sends the model.
const ARMS = {
  __baseline__: { system: null },
  __terse__: { system: 'Answer concisely.' },
  concise_full: { userPrefix: buildConciseInstruction('full') },
  concise_ultra: { userPrefix: buildConciseInstruction('ultra') },
};

function runOne(prompt, arm) {
  // Deliver the arm's instruction on its declared channel. userPrefix arms
  // prepend the instruction to the user turn (production-faithful); system arms
  // append it via --append-system-prompt (the controls).
  const effectivePrompt = arm.userPrefix ? `${arm.userPrefix}\n\n${prompt}` : prompt;
  const args = ['-p', effectivePrompt, '--model', MODEL];
  if (arm.system) {
    args.push('--append-system-prompt', arm.system);
  }
  return new Promise(resolve => {
    // Run from a neutral cwd so the default Claude Code context (CLAUDE.md, git
    // status) does not vary the arms. It is constant across arms regardless,
    // but a clean dir keeps the answers focused on the question.
    execFile('claude', args, { cwd: tmpdir(), maxBuffer: 8 * 1024 * 1024, timeout: 120000 }, (err, stdout) => {
      if (err) {
        resolve({ ok: false, text: `__ERROR__ ${err.message}` });
        return;
      }
      resolve({ ok: true, text: String(stdout).trim() });
    });
  });
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  // Skip blank lines AND `#` group-comment lines so prompts.txt can label its
  // families (general Q&A / selection-bearing / false-premise) without those
  // labels being sent to the model as prompts.
  const prompts = readFileSync(join(HERE, 'prompts.txt'), 'utf8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  const jobs = [];
  for (const arm of Object.keys(ARMS)) {
    for (let p = 0; p < prompts.length; p++) {
      jobs.push({ arm, p, prompt: prompts[p], spec: ARMS[arm] });
    }
  }

  process.stderr.write(`Running ${jobs.length} calls (${prompts.length} prompts x ${Object.keys(ARMS).length} arms) on ${MODEL}…\n`);
  let done = 0;
  const results = await mapLimit(jobs, CONCURRENCY, async job => {
    const r = await runOne(job.prompt, job.spec);
    done += 1;
    process.stderr.write(`  [${done}/${jobs.length}] ${job.arm} #${job.p + 1} ${r.ok ? 'ok' : 'FAIL'}\n`);
    return { ...job, ...r };
  });

  const arms = {};
  for (const arm of Object.keys(ARMS)) {
    arms[arm] = prompts.map((_, p) => {
      const hit = results.find(r => r.arm === arm && r.p === p);
      return hit ? hit.text : '';
    });
  }

  let cliVersion = 'unknown';
  try {
    cliVersion = execFileSync('claude', ['--version']).toString().trim();
  } catch { /* ignore */ }

  const snapshot = {
    metadata: {
      model: MODEL,
      generated_at: new Date().toISOString(),
      prompt_count: prompts.length,
      arms: Object.keys(ARMS),
      delivery: 'concise_* arms delivered as a user-message prefix (production-faithful); __terse__ as a system prompt; __baseline__ none. Cross-channel by design — the control adheres at least as strongly, so the concise_* delta cannot be overstated.',
      note: 'Output measured on the named model as a proxy for Copilot models; the terseness effect transfers across models but absolute numbers vary.',
    },
    prompts,
    arms,
  };

  mkdirSync(join(HERE, 'snapshots'), { recursive: true });
  writeFileSync(join(HERE, 'snapshots', 'results.json'), JSON.stringify(snapshot, null, 2) + '\n');
  process.stderr.write(`Wrote snapshots/results.json (${prompts.length} prompts).\n`);
}

main();
