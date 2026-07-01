// CE: Recommend a Model for This Task — the model-selection lever.
//
// Model choice is a MULTIPLIER on the whole request (a premium model can cost
// many× a base one for the same prompt), so right-sizing it is the single
// biggest cost dial — bigger than prompt size. This advisor heuristically
// classifies a task into a cost tier and recommends the cheapest model that
// fits, then defers to VS Code's own model picker for the live multipliers.
//
// Honest by construction: classification is local regex (no AI, zero tokens),
// it is ADVISORY (CE cannot switch your model), and multipliers vary by plan and
// change over time — the picker is the source of truth. Pure & IO-free so the
// classifier and report are fully unit-testable.

// Signals that a task is cheap/mechanical — a base model handles these fine.
const ECONOMY_SIGNALS = [
  { re: /\brenam(e|ing)\b/, label: 'rename' },
  { re: /\btypos?\b/, label: 'typo fix' },
  { re: /\bformat(ting)?\b/, label: 'formatting' },
  { re: /\bboilerplate\b/, label: 'boilerplate' },
  { re: /\b(getter|setter)s?\b/, label: 'getter/setter' },
  { re: /\b(jsdoc|docstrings?|doc comments?)\b/, label: 'doc comment' },
  { re: /\bimports?\b/, label: 'imports' },
  { re: /\b(add|insert)\s+(a\s+)?logs?\b/, label: 'add logging' },
  { re: /\blint(ing)?\b/, label: 'lint' },
  { re: /\bindent(ation)?\b/, label: 'indentation' },
  { re: /\bone[- ]?liner\b/, label: 'one-liner' },
  { re: /\bstubs?\b/, label: 'stub' },
  { re: /\bspelling\b/, label: 'spelling' },
  { re: /\bsimple\b/, label: 'self-described simple' },
];

// Signals that a task needs real reasoning — a premium model earns its cost.
const PREMIUM_SIGNALS = [
  { re: /\brefactor(ing)?\b/, label: 'refactor' },
  { re: /\barchitect(ure|ing)?\b/, label: 'architecture' },
  { re: /\bdebug(ging)?\b/, label: 'debugging' },
  { re: /\brace conditions?\b/, label: 'race condition' },
  { re: /\bconcurren(t|cy)\b/, label: 'concurrency' },
  { re: /\bdeadlocks?\b/, label: 'deadlock' },
  { re: /\bmemory leaks?\b/, label: 'memory leak' },
  { re: /\b(re)?design\b/, label: 'design' },
  { re: /\bmigrat(e|ion|ing)\b/, label: 'migration' },
  { re: /\bsecurity\b/, label: 'security' },
  { re: /\bperformance\b/, label: 'performance' },
  { re: /\boptimi[sz](e|ation|ing)\b/, label: 'optimization' },
  { re: /\balgorithms?\b/, label: 'algorithm' },
  { re: /\broot cause\b/, label: 'root-cause analysis' },
  { re: /\bwhy (is|does|do|are|did)\b/, label: 'diagnostic "why…"' },
  { re: /\b(multi[- ]?file|across (multiple |several )?files)\b/, label: 'multi-file' },
  { re: /\btrade[- ]?offs?\b/, label: 'trade-off reasoning' },
  { re: /\bdistributed\b/, label: 'distributed system' },
];

// Tasks the kit can do LOCALLY (Transform mode) — often no model call needed.
// These compress *context/output*, they do NOT edit code — so "shorten/trim/tidy"
// only counts when its object is context text (output, log, diff…), never a code
// edit like "tidy the imports" or "trim whitespace".
const LOCAL_TRANSFORM_SIGNALS = [
  { re: /\bcompress\b/, label: 'compress' },
  { re: /\boutline\b/, label: 'outline' },
  { re: /\bextract\b/, label: 'extract' },
  { re: /\bredact\b/, label: 'redact' },
  { re: /\b(shorten|trim|tidy|condense)\b[^.]*\b(output|logs?|context|text|response|answer|paste|dump|diff|json|payload|trace|failure|selection)\b/, label: 'shorten output/context' },
];
// Bulk, non-interactive work — cheapest on a batch/offline API lane (not Chat).
const BATCH_SIGNALS = [
  { re: /\b(bulk|batch|in bulk)\b/, label: 'bulk/batch' },
  { re: /\b(every|all)\s+files?\b/, label: 'every/all files' },
  { re: /\bfor each\b/, label: 'for-each' },
  { re: /\b(dataset|thousands|corpus)\b/, label: 'large dataset' },
  { re: /\b(classify|translate)\b/, label: 'classify/translate at scale' },
];

const LARGE_SELECTION_CHARS = 2000; // ~500 tokens — a sizeable chunk to reason over

const TIERS = {
  economy: {
    name: 'Economy — base / lowest-multiplier model',
    guidance: 'A base, low-multiplier model is plenty here. Spending a premium model on mechanical work is wasted credits.',
  },
  standard: {
    name: 'Standard — a mid-tier model',
    guidance: 'A mid-tier model fits. Start there; escalate to a premium model only if the first answer misses.',
  },
  premium: {
    name: 'Premium — a high-reasoning model',
    guidance: 'A premium, high-reasoning model is justified — the multiplier is worth it for this kind of work.',
  },
};

// How to ROUTE the request under Copilot AI-credit billing — the spend-risk lens
// on top of the tier. Advisory only; the kit cannot switch your model or route.
const ROUTING = {
  'local-transform': {
    label: 'Local transform — you may not need a model call at all',
    guidance: 'This looks like a mechanical transform the kit does **locally**. Try `@cetoken /compress`, `/focus`, or `/outline` (Transform mode) before spending a Copilot request.',
  },
  'completion-or-base': {
    label: 'Inline completion or a base model',
    guidance: 'Small, scoped edit. Inline completions (not AI-credit billed) or a base/low-multiplier model handle this — no premium needed.',
  },
  auto: {
    label: 'Auto model selection',
    guidance: 'Uncertain or multi-step, but not clearly high-risk. Copilot **Auto** routes by complexity and carries a discount on eligible paid plans — a sensible default. Escalate manually only if it misses.',
  },
  premium: {
    label: 'Premium model justified',
    guidance: 'High-reasoning work (architecture, tricky debugging, security). The multiplier earns its cost here.',
  },
  'batch-offline': {
    label: 'Batch / offline lane (if you use vendor APIs directly)',
    guidance: 'Bulk, non-interactive work is cheapest on a Batch/offline API lane where policy permits — not interactive Copilot Chat.',
  },
};

function routeFor(tier, haystack) {
  if (LOCAL_TRANSFORM_SIGNALS.some(s => s.re.test(haystack))) {return 'local-transform';}
  if (BATCH_SIGNALS.some(s => s.re.test(haystack))) {return 'batch-offline';}
  if (tier === 'economy') {return 'completion-or-base';}
  if (tier === 'premium') {return 'premium';}
  return 'auto';
}

// Classify a task into a cost tier from an optional description + selection size.
// Returns { tier, reasons } — reasons are human-readable so the report explains
// itself. Ties favour the safer (higher) tier: under-powering a real task erodes
// trust faster than a little overspend, and the escalation rule recovers savings.
function classifyTask({ text = '', selectionLength = 0 } = {}) {
  const haystack = String(text || '').toLowerCase();
  const reasons = [];
  let economy = 0;
  let premium = 0;

  for (const signal of ECONOMY_SIGNALS) {
    if (signal.re.test(haystack)) { economy += 1; reasons.push(`cheap/mechanical: ${signal.label}`); }
  }
  for (const signal of PREMIUM_SIGNALS) {
    if (signal.re.test(haystack)) { premium += 1; reasons.push(`needs reasoning: ${signal.label}`); }
  }
  // Local-transform / batch matches drive the routing, not the tier — but record
  // them so the report's signals line reflects them (a `compress` task should not
  // read "no strong signal").
  for (const signal of LOCAL_TRANSFORM_SIGNALS) {
    if (signal.re.test(haystack)) { reasons.push(`local transform: ${signal.label}`); }
  }
  for (const signal of BATCH_SIGNALS) {
    if (signal.re.test(haystack)) { reasons.push(`bulk/offline: ${signal.label}`); }
  }
  if (selectionLength > LARGE_SELECTION_CHARS) {
    premium += 1;
    reasons.push(`large selection (${selectionLength} chars) to reason over`);
  }

  let tier;
  if (premium > 0 && premium >= economy) {tier = 'premium';}
  else if (economy > premium) {tier = 'economy';}
  else {tier = 'standard';}

  if (reasons.length === 0) {
    reasons.push('no strong signal either way — defaulting to standard');
  }
  return { tier, routing: routeFor(tier, haystack), reasons, economyScore: economy, premiumScore: premium };
}

function renderModelAdvice(result, meta = {}) {
  const tier = TIERS[result.tier] || TIERS.standard;
  const routing = ROUTING[result.routing] || ROUTING.auto;
  const taskLine = meta.taskText
    ? `Task: _${meta.taskText}_`
    : meta.selectionLength
      ? `Task judged from a ${meta.selectionLength}-char selection (no description given).`
      : 'No task description or selection — showing general guidance.';

  const signals = result.reasons.map(reason => reason.replace(/^[^:]*:\s*/, '')).join(', ');

  return [
    `# Model Recommendation — **${tier.name}**`,
    '',
    `${taskLine}${signals ? ` · signals: ${signals}` : ''}`,
    '',
    `${tier.guidance} Model choice is the biggest cost dial — the multiplier hits the whole request.`,
    '',
    `**Route:** ${routing.label} — ${routing.guidance}`,
    '',
    '**Start here; escalate to a premium model only if the answer misses** — pick it in the Copilot Chat model picker (it shows live multipliers).',
    '',
    '> Advisory · local · **no AI (zero tokens)**; multipliers vary by plan — the picker is the source of truth and CE can’t switch the model for you. See GitHub’s [usage-based billing](https://docs.github.com/en/copilot/concepts/billing/copilot-usage-based-billing) docs.',
    '',
  ].join('\n');
}

module.exports = { classifyTask, renderModelAdvice, TIERS, LARGE_SELECTION_CHARS };
