#!/usr/bin/env node
/**
 * Token-estimate calibration — quantify how far the kit's zero-dependency
 * `estimateTokens` heuristic (ceil(len/4)) diverges from a real BPE tokenizer.
 *
 * The kit ships with no runtime tokenizer (a deliberate zero-dependency choice),
 * so every "tokens saved" figure is an estimate. This dev-only script measures
 * the estimate's error against gpt-tokenizer (cl100k_base — the GPT-3.5/4 family
 * encoding) on representative payloads and, more importantly, checks whether the
 * before/after *ratio* the kit reports is biased: a compression ratio computed
 * from a biased per-char estimate could over- or under-state the real savings.
 *
 *   npm run evals:tokenizer
 *
 * Dev/eval only: gpt-tokenizer is a devDependency and never ships. The runtime
 * estimate stays ceil(len/4); this just publishes its error bars.
 */

import { encode } from 'gpt-tokenizer';
import { estimateTokens } from '../../scripts/lib/tokens.js';
import { compressContent } from '../../scripts/lib/engine.js';

const real = (text) => encode(text).length;
const pctErr = (estimate, actual) => (actual === 0 ? 0 : ((estimate - actual) / actual) * 100);
const round = (n, d = 1) => Number(n.toFixed(d));

const CODE = `// Authentication service for the login flow.
import { sign } from 'jsonwebtoken';

/**
 * Issues a short-lived session token for a verified user.
 * @param {string} userId
 */
export function issueToken(userId) {
  const payload = { sub: userId, iat: Date.now() };
  return sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
}
`;

const JSON_SAMPLE = JSON.stringify({
  status: 'ok',
  items: Array.from({ length: 8 }, (_, i) => ({ id: i, name: `item-${i}`, active: i % 2 === 0, tags: [] })),
  meta: { page: 1, total: 8, nextCursor: null },
}, null, 2);

const PROSE = `# Contribution guidance

In order to keep the review process efficient, it is important to write small,
focused pull requests. Please make sure to add tests for any new behavior, and
remember to update the documentation when you change a public interface. Avoid
mixing refactoring with feature work in the same change.
`;

const DIFF = `diff --git a/src/login.ts b/src/login.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/login.ts
+++ b/src/login.ts
@@ -10,7 +10,9 @@ export async function login(email, password) {
   const user = await findUser(email);
-  if (!user) return null;
+  if (!user) {
+    throw new AuthError('no such user');
+  }
   return verify(user, password);
 }
`;

const OUTPUT = `Running 12 tests using 4 workers

  1) login.spec.ts:14:3 › redirects after successful login
    Error: expect(received).toHaveURL(expected)
    Expected: "/dashboard"
    Received: "/login"
      at login.spec.ts:18:32
      at node:internal/process/task_queues:95:5

  10 passed
  1 failed
`;

const SAMPLES = [
  { name: 'code (TS)', mode: 'code', filename: 'auth.ts', text: CODE },
  { name: 'json (API)', mode: 'json', filename: 'res.json', text: JSON_SAMPLE },
  { name: 'prose (md)', mode: 'instructions', filename: 'CONTRIBUTING.md', text: PROSE },
  { name: 'diff', mode: 'diff', filename: 'change.diff', text: DIFF },
  { name: 'output (log)', mode: 'output', filename: 'run.log', text: OUTPUT },
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const rows = SAMPLES.map((sample) => {
  const estBefore = estimateTokens(sample.text);
  const realBefore = real(sample.text);
  const { output } = compressContent(sample.text, { mode: sample.mode, filename: sample.filename });
  const estAfter = estimateTokens(output);
  const realAfter = real(output);
  const ratioEst = estBefore > 0 ? (1 - estAfter / estBefore) * 100 : 0;
  const ratioReal = realBefore > 0 ? (1 - realAfter / realBefore) * 100 : 0;
  return {
    name: sample.name,
    estBefore,
    realBefore,
    estErrPct: pctErr(estBefore, realBefore),
    ratioEst,
    ratioReal,
    ratioBiasPP: ratioEst - ratioReal,
  };
});

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log('\nToken-estimate calibration — ceil(len/4) vs gpt-tokenizer (cl100k_base)\n');
console.log(
  pad('sample', 14) + padL('est', 6) + padL('real', 6) + padL('est err', 9) +
  padL('ratio est', 11) + padL('ratio real', 12) + padL('bias', 8),
);
console.log('-'.repeat(66));
for (const r of rows) {
  console.log(
    pad(r.name, 14) +
    padL(r.estBefore, 6) +
    padL(r.realBefore, 6) +
    padL(`${round(r.estErrPct)}%`, 9) +
    padL(`${round(r.ratioEst)}%`, 11) +
    padL(`${round(r.ratioReal)}%`, 12) +
    padL(`${round(r.ratioBiasPP)}pp`, 8),
  );
}

const absErrs = rows.map((r) => Math.abs(r.estErrPct));
const absBias = rows.map((r) => Math.abs(r.ratioBiasPP));

console.log('\nSummary');
console.log(`  Raw token estimate error : mean ${round(absErrs.reduce((a, b) => a + b, 0) / absErrs.length)}%, ` +
  `median ${round(median(absErrs))}%, max ${round(Math.max(...absErrs))}%`);
console.log(`  Compression-ratio bias   : mean ${round(absBias.reduce((a, b) => a + b, 0) / absBias.length)}pp, ` +
  `median ${round(median(absBias))}pp, max ${round(Math.max(...absBias))}pp`);
console.log('\n  "est err"   = how far ceil(len/4) is from the real token count (signed).');
console.log('  "bias"      = reported savings ratio minus real savings ratio, in percentage points.');
console.log('  The estimate assumes 4 chars/token. Punctuation-dense JSON/diffs/logs run fewer');
console.log('  chars/token (estimate under-counts); prose runs more (estimate over-counts). But');
console.log('  the before/after ratio stays within a few points of real because that per-char');
console.log('  bias lands on both sides of the division and largely cancels.\n');
