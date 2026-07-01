const PARTICIPANT_ID = 'ivan-stepantsov.cetoken';

// Derived from PARTICIPANT_ID so branding only has to stamp the base id.
const CONCISE_PARTICIPANT_ID = `${PARTICIPANT_ID}-concise`;

// Forces caveman-terse answers — the output-discipline lever as a per-message,
// opt-in chat mode. Output tokens cost ~5x input, so a terse answer is the
// expensive side of the savings. Injected on every @cetoken-concise turn.
//
// The ruleset adapts the proven terseness approach from the MIT-licensed
// `caveman` skill (github.com/juliusbrussee/caveman) — the drop-list, the
// verbatim-preservation rail, and the safety carve-outs — rewritten in our own
// words. Three intensity levels (lite/full/ultra) via ceTokenKit.concise.level.

// Rails applied at every level: reason fully, preserve technical signal exactly,
// and never let terseness clip safety-critical detail. The first rail is the
// research-backed guard — forcing brevity on the *reasoning* (not just the
// wording) degrades accuracy with sharp threshold behavior; the last two keep
// this defensible in a regulated environment.
const CONCISE_CORE =
  'Compress the phrasing, never the substance: shorten how you say things, but keep every step, caveat, and piece of reasoning the answer needs to be correct — brevity must not drop necessary content. Do the full reasoning to reach the right answer (in hidden thinking where the model supports it); the terseness applies to the final answer only. '
  + 'Lead with the answer; no preamble, no restating the question, no summary of what you are about to do, no self-reference about answering style. '
  + 'Do not re-explain code you were given, add a closing recap or summary, hedge with disclaimers, or end with an offer of further help ("want me to…?", "let me know if…") — but never cut a one-line correction when the question assumes something false or unsafe. '
  + 'Keep all code, error strings, and API / function / file / CLI names exactly as written — never abbreviate, reword, or summarize them. '
  + 'Always put any code, command, or error string in a fenced ``` code block (or an inline `code` span for short ones) so it renders correctly and stays exact. '
  + 'Switch to full, normal prose (not terse) for security warnings, irreversible-action confirmations, and multi-step ordered instructions where word order matters — and never omit a caveat that affects correctness or safety.';

// Level-specific terseness, from lightest to most compressed.
const CONCISE_LEVELS = {
  lite:
    'Answer in complete sentences with no filler. Cut hedging and pleasantries ("sure", "of course", "happy to", "just", "basically", "really"). '
    + 'Keep articles and normal grammar — professional but tight; aim for the shortest answer that still reads as normal prose.',
  full:
    'Answer in a few short sentences or tight bullets — caveman style. '
    + 'Drop articles (a/an/the), filler (just/really/basically/simply), and pleasantries. Sentence fragments are fine. '
    + 'Prefer short words ("fix", not "implement a solution for"). No tool-call narration, no decorative tables or emoji. '
    + 'Lead each point with the substance: [thing] [action/property] [reason]. Add a next step only when the answer is actionable (a fix, a command, a thing to do); for explanatory "why/what" questions, skip it.',
};

const CONCISE_DEFAULT_LEVEL = 'full';

// `ultra` is retired. The refreshed output-reduction eval showed it produced
// LONGER output than `full`, with wider variance — compressing the wording
// harder backfires — so it no longer has its own body and maps to `full`. The
// value stays valid in the setting so existing configs don't error; the footer
// and the setting description say plainly that ultra now runs as full, pending a
// redesign of what an aggressive level should be.
const CONCISE_LEVEL_ALIASES = {
  ultra: 'full',
};

function resolveConciseLevel(level) {
  return CONCISE_LEVEL_ALIASES[level] || level;
}

// Footer label: shows the alias so a retired level is never presented as if a
// distinct mode ran (e.g. "ultra → full"); an un-aliased level shows as-is.
function conciseLevelLabel(level) {
  const resolved = resolveConciseLevel(level);
  return resolved === level ? level : `${level} → ${resolved}`;
}

// Compose the level body with the always-on rails. Aliased or unknown levels
// resolve to a real body (default: full).
function buildConciseInstruction(level) {
  const resolved = resolveConciseLevel(level);
  const body = CONCISE_LEVELS[resolved] || CONCISE_LEVELS[CONCISE_DEFAULT_LEVEL];
  return `${body}\n\n${CONCISE_CORE}`;
}

// Backwards-compatible default (full level) used as the export and fallback.
const CONCISE_INSTRUCTION = buildConciseInstruction(CONCISE_DEFAULT_LEVEL);

// @cetoken Copilot Chat participant.
//
// Default (no slash command): optimize the typed prompt with the active file +
// selection as context. Slash commands run the selection through the kit's
// compressors: /compress (utility), /review (diff), /debug (stack trace),
// /explain (code). In every mode high-confidence secrets are redacted first.
//
// Two response modes, chosen by the ceTokenKit.chat.answerMode setting:
//   - Transform (default): stream the optimized/compressed prompt for the
//     engineer to send — no model call, no request spend.
//   - Answer: send the optimized prompt to the selected Copilot model and stream
//     the answer back in-pane.
//
// handleChatRequest is a pure dependency-injected function (the model call,
// editor, shared library, and stats sink are all injected) so every branch is
// testable with a fake chat stream.

const SELECTION_INTENTS = {
  review: {
    commandKey: 'chatReview',
    commandLabel: 'Chat: Review Diff',
    instruction: 'Review this diff. List the highest-risk findings first.',
    expectedKind: 'diff',
    mismatchNote: 'Selection does not look like a diff — reviewing it as-is.',
    fence: 'diff',
  },
  debug: {
    commandKey: 'chatDebug',
    commandLabel: 'Chat: Debug Stack Trace',
    instruction: 'Explain the likely root cause first, then the smallest plausible fix.',
    expectedKind: 'stack-trace',
    mismatchNote: 'Selection does not look like a stack trace — debugging it as-is.',
    fence: 'text',
  },
};


// Resolve the content a selection command should operate on, in priority order:
//   1. A highlighted text selection in the active editor.
//   2. Files/selections attached to the chat request (#file, #selection) —
//      resolved via the injected resolveReferences, so attaching context in the
//      chat box works, not just highlighting in the editor.
// Returns { text, file }; streams a hint and returns empty text when nothing is
// available.
// Resolve opt-in context: an active editor selection, or #file / #selection
// attachments. Never the merely-open file. Returns { text, file, source } with
// source one of 'selection' | 'reference' | null. No side effects.
// VS Code hands a participant everything attached to the chat in one list:
// deliberate attachments (a #file:… you typed or a chip you added) AND a fixed
// set of auto-added workspace context (instruction files, the customizations
// index, the implicit selection). Diagnostics on a real session showed the
// merely-open file is NOT auto-attached — only chips you add are. So a reference
// counts as intentional context if you typed it (#file:… has a prompt range) or
// attached it as a chip; the `vscode.instructions.*` / `vscode.customizations.*`
// / `vscode.implicit.*` entries are workspace noise we never want folded in.
function isIntentionalReference(ref) {
  if (!ref) {
    return false;
  }
  if (Array.isArray(ref.range)) {
    return true;
  }
  const id = String(ref.id || '');
  if (id.startsWith('vscode.instructions.') || id.startsWith('vscode.customizations.') || id.startsWith('vscode.implicit.')) {
    return false;
  }
  return true;
}

async function resolveEditorContext(deps) {
  const { editor, getSelectedText, workspacePathForDocument, resolveReferences, request, dropAutoContext } = deps;

  const selectionText = editor ? getSelectedText(editor) : '';
  if (selectionText) {
    return { text: selectionText, file: editor ? workspacePathForDocument(editor.document) : null, source: 'selection' };
  }

  if (typeof resolveReferences === 'function') {
    let references = request.references;
    if (dropAutoContext && Array.isArray(references)) {
      references = references.filter(isIntentionalReference);
    }
    const resolved = await resolveReferences(references);
    if (resolved && resolved.text) {
      return { text: resolved.text, file: resolved.file ?? null, source: 'reference' };
    }
  }

  return { text: '', file: null, source: null };
}

async function resolveSelection(deps) {
  const ctx = await resolveEditorContext(deps);
  if (!ctx.text) {
    deps.stream.markdown(
      'Select the code, diff, or stack trace in your editor — or attach it with `#file` / `#selection` in the chat box — then run this command again.'
    );
  }
  return { text: ctx.text, file: ctx.file };
}

// Wrap content in a Markdown code fence that survives any backtick runs inside
// it. Per CommonMark a fenced block can only be closed by a backtick run at
// least as long as the one that opened it, so we open with a run one longer than
// the longest run found in the content (never fewer than 3). Without this,
// content that itself contains ``` — a markdown file, nested fenced output, or
// an inner fenced block we already built (e.g. /explain wraps code, then we wrap
// that) — breaks out of the fence and corrupts both the rendered "copy this"
// block and, in answer mode, the prompt we hand the model.
function fenceBlock(content, lang = '') {
  const text = String(content ?? '');
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) {
    if (match[0].length > longest) {
      longest = match[0].length;
    }
  }
  const ticks = '`'.repeat(Math.max(3, longest + 1));
  return `${ticks}${lang}\n${text}\n${ticks}`;
}

async function streamOrAnswer(deps, finalPrompt, beforeTokens, afterTokens) {
  const { stream, answerMode, answer, formatDelta } = deps;
  // This path tightens/structures a prompt — token reduction is not its goal, so
  // a longer result is a deliberate clarity trade, not a failed compression.
  const saved = beforeTokens - afterTokens;
  const delta = saved < 0
    ? `structured for clarity (+${Math.abs(saved).toLocaleString()} tokens)`
    : formatDelta(beforeTokens, afterTokens);

  if (answerMode && typeof answer === 'function') {
    stream.markdown(`_Optimized — ${delta}. Asking the model…_\n\n`);
    await answer({ prompt: finalPrompt });
    return;
  }

  stream.markdown('**Optimized prompt** — copy this into Copilot Chat:\n\n');
  stream.markdown(fenceBlock(finalPrompt, 'text') + '\n\n');
  stream.markdown(`_${delta}._`);
}

async function handleOptimize(deps) {
  const { request, stream, editor, shared, workspacePathForDocument, getSelectedText, recordRun } = deps;
  const rawPrompt = String(request.prompt ?? '').trim();

  if (!rawPrompt) {
    stream.markdown(
      'Select a long test failure, diff, or big file and run `@cetoken /compress` to shrink it before it costs tokens '
      + '(a 180-line failure becomes ~15). '
      + 'Or type a request like `@cetoken fix the failing login test` to tighten a prompt and fold in your active file. '
      + '`/review`, `/debug`, and `/explain` work on a selection too.'
    );
    return { metadata: { command: 'optimize', empty: true } };
  }

  const file = editor ? workspacePathForDocument(editor.document) : null;
  const selectionText = editor ? getSelectedText(editor) : '';

  const result = shared.optimizePrompt(rawPrompt, { file, selectionText });
  const protection = shared.protectSecrets(result.optimizedPrompt);

  // Surface the redaction receipt + warnings BEFORE any model call, so the user
  // always sees "secrets were masked" even if the model errors mid-stream.
  reportRedaction(stream, protection);
  reportWarnings(stream, result.warnings);

  await streamOrAnswer(deps, protection.output, result.beforeTokens, result.afterTokens);

  const contextBits = [];
  if (file) {
    contextBits.push(`file \`${file}\``);
  }
  if (selectionText) {
    contextBits.push(`${selectionText.length} chars of selection`);
  }
  if (contextBits.length > 0) {
    stream.markdown(`\n\n_Folded in ${contextBits.join(' and ')}._`);
  }

  if (typeof recordRun === 'function') {
    // Build the recurrence skeleton from a REDACTED copy so a secret never lands
    // in stats (globalState) and is never echoed back in the nudge.
    const safePrompt = shared.protectSecrets(rawPrompt);
    const promptSkeletonId = typeof shared.buildPromptSkeletonId === 'function'
      ? shared.buildPromptSkeletonId(safePrompt.output, { file })
      : null;
    const updatedStats = await recordRun({
      commandKey: 'chatOptimize',
      commandLabel: 'Chat: Optimize Prompt',
      group: 'prompt',
      promptSkeletonId,
      result,
    });
    // Never suggest "promote this to a committed instructions file" for a prompt
    // that carried secrets — that would push credentials toward the repo.
    if (!safePrompt.redacted) {
      nudgeRecurringPrompt(stream, updatedStats, promptSkeletonId, safePrompt.output);
    }
  }

  return { metadata: { command: 'optimize' } };
}

const RECURRENCE_NUDGE_THRESHOLD = 3;

// When the same prompt shape recurs, suggest promoting it to repo instructions
// so the engineer stops re-typing (and re-paying for) the same scaffolding.
function nudgeRecurringPrompt(stream, stats, skeletonId, rawPrompt) {
  if (!stats || !skeletonId) {
    return;
  }
  const count = stats.skeletonCounts ? stats.skeletonCounts[skeletonId] ?? 0 : 0;
  if (count < RECURRENCE_NUDGE_THRESHOLD) {
    return;
  }
  const sample = rawPrompt.length > 60 ? `${rawPrompt.slice(0, 57)}…` : rawPrompt;
  stream.markdown(
    `\n\n💡 You've sent this kind of prompt ${count}× (e.g. "${sample}"). `
    + 'Promote the recurring part to `.github/copilot-instructions.md` (or a '
    + '`.github/instructions/*.instructions.md` file) so Copilot applies it automatically '
    + 'and you stop re-paying for the scaffolding each time.'
  );
}

async function handleCompress(deps) {
  const { stream, shared, recordRun } = deps;
  const { text, file } = await resolveSelection(deps);
  if (!text) {
    return { metadata: { command: 'compress', empty: true } };
  }

  const result = shared.optimizeSelectionText(text, { filename: file ?? '' });
  const protection = shared.protectSecrets(result.output);

  stream.markdown(`**Compressed ${result.kind}** — copy this into Copilot Chat:\n\n`);
  stream.markdown(fenceBlock(protection.output, 'text') + '\n\n');
  stream.markdown(`_${deps.formatDelta(result.beforeTokens, result.afterTokens)}._`);
  reportRedaction(stream, protection);
  reportWarnings(stream, result.warnings);

  if (typeof recordRun === 'function') {
    await recordRun({
      commandKey: 'chatCompress',
      commandLabel: 'Chat: Compress Selection',
      group: 'selection',
      result,
    });
  }

  return { metadata: { command: 'compress' } };
}

async function handleOutline(deps) {
  const { stream, shared, recordRun } = deps;
  const { text, file } = await resolveSelection(deps);
  if (!text) {
    return { metadata: { command: 'outline', empty: true } };
  }

  const result = shared.compressContent(text, { mode: 'outline', filename: file ?? '' });
  const protection = shared.protectSecrets(result.output);

  stream.markdown('**Outline** — signatures and types kept, bodies dropped:\n\n');
  stream.markdown(fenceBlock(protection.output, result.language || '') + '\n\n');
  stream.markdown(`_${deps.formatDelta(result.beforeTokens, result.afterTokens)}._`);
  reportRedaction(stream, protection);

  if (typeof recordRun === 'function') {
    await recordRun({
      commandKey: 'chatOutline',
      commandLabel: 'Chat: Outline File',
      group: 'selection',
      result,
    });
  }

  return { metadata: { command: 'outline' } };
}

async function handleExplain(deps) {
  const { stream, shared, recordRun } = deps;
  const { text, file } = await resolveSelection(deps);
  if (!text) {
    return { metadata: { command: 'explain', empty: true } };
  }

  const filename = file ?? '';
  // Size-aware + comment-preserving policy lives in the shared library so this
  // matches the palette CE: Explain Selection exactly.
  const result = shared.explainSelection(text, { filename });
  const instruction = result.outlined
    ? 'Explain what this code does — its responsibilities, the main pieces, and how they fit together. Be concise.'
    : 'Explain this concisely — what it does and why.';

  const protection = shared.protectSecrets(result.output);
  const fence = result.language || 'text';
  const finalPrompt = `${instruction}\n\n${fenceBlock(protection.output, fence)}`;

  await streamOrAnswer(deps, finalPrompt, result.beforeTokens, result.afterTokens);
  if (result.outlined) {
    stream.markdown('\n\n_Large selection — explained from its outline (signatures kept, bodies dropped)._');
  }
  reportRedaction(stream, protection);

  if (typeof recordRun === 'function') {
    await recordRun({
      commandKey: 'chatExplain',
      commandLabel: 'Chat: Explain Selection',
      group: 'selection',
      result,
    });
  }

  return { metadata: { command: 'explain' } };
}

async function handleSelectionIntent(deps, intent) {
  const { stream, shared, recordRun } = deps;
  const { text, file } = await resolveSelection(deps);
  if (!text) {
    return { metadata: { command: intent.commandKey, empty: true } };
  }

  const result = shared.optimizeSelectionText(text, { filename: file ?? '' });

  if (intent.expectedKind && result.kind !== intent.expectedKind) {
    stream.markdown(`_${intent.mismatchNote}_\n\n`);
  }

  const protection = shared.protectSecrets(result.output);
  const finalPrompt = `${intent.instruction}\n\n${fenceBlock(protection.output, intent.fence)}`;

  await streamOrAnswer(deps, finalPrompt, result.beforeTokens, result.afterTokens);
  reportRedaction(stream, protection);
  reportWarnings(stream, result.warnings);

  if (typeof recordRun === 'function') {
    await recordRun({
      commandKey: intent.commandKey,
      commandLabel: intent.commandLabel,
      group: 'selection',
      result,
    });
  }

  return { metadata: { command: intent.commandKey } };
}

function reportRedaction(stream, protection) {
  if (protection.redacted) {
    stream.markdown(
      `\n\n⚠ Redacted ${protection.totalRedactions} high-confidence secret value(s) before display.`
    );
  }
}

function reportWarnings(stream, warnings) {
  const list = warnings ?? [];
  if (list.length === 0) {
    return;
  }
  stream.markdown('\n\n**Warnings**\n');
  for (const warning of list) {
    stream.markdown(`- ${warning}\n`);
  }
}

async function handleFocus(deps) {
  const { stream, shared, recordRun } = deps;
  const { text } = await resolveSelection(deps);
  if (!text) {
    return { metadata: { command: 'focus', empty: true } };
  }

  // Extractive focused-context pack: keeps the decisive lines (assertion, top
  // frame, changed hunks, error fields) in labelled sections. Local utility —
  // like /compress, it returns the pack for you to send; it never calls the model.
  const result = shared.buildContextPack(text);
  const protection = shared.protectSecrets(result.pack);

  stream.markdown(`**Focused context pack** (${result.kind}) — the decisive lines, ready for Copilot:\n\n`);
  stream.markdown(fenceBlock(protection.output, 'markdown') + '\n\n');
  stream.markdown(`_${deps.formatDelta(result.beforeTokens, result.afterTokens)}._`);
  reportRedaction(stream, protection);

  if (typeof recordRun === 'function') {
    await recordRun({
      commandKey: 'chatFocus',
      commandLabel: 'Chat: Focused Context Pack',
      group: 'selection',
      result,
    });
  }

  return { metadata: { command: 'focus' } };
}

async function handleChatRequest(deps) {
  const command = deps.request.command;
  if (command === 'focus') {
    return handleFocus(deps);
  }
  if (command === 'compress') {
    return handleCompress(deps);
  }
  if (command === 'outline') {
    return handleOutline(deps);
  }
  if (command === 'explain') {
    return handleExplain(deps);
  }
  if (SELECTION_INTENTS[command]) {
    return handleSelectionIntent(deps, SELECTION_INTENTS[command]);
  }
  return handleOptimize(deps);
}

// Builds a resolver for chat prompt references (#file / #selection). Each
// reference's value is a Uri (whole file), a Location { uri, range } (a
// selection), or a string. Returns the first readable one as { text, file }.
// Returns null when the host can't open documents (older VS Code / test fake).
function buildReferenceResolver(vscodeApi, workspacePathForDocument) {
  if (!vscodeApi.workspace || typeof vscodeApi.workspace.openTextDocument !== 'function') {
    return null;
  }
  return async (references) => {
    if (!Array.isArray(references)) {
      return null;
    }
    for (const ref of references) {
      const value = ref && ref.value;
      if (!value) {
        continue;
      }
      try {
        if (value.uri && value.range) {
          const doc = await vscodeApi.workspace.openTextDocument(value.uri);
          const text = doc.getText(value.range);
          if (text && text.trim()) {
            return { text, file: workspacePathForDocument(doc) };
          }
        } else if (value.path || value.fsPath) {
          const doc = await vscodeApi.workspace.openTextDocument(value);
          const text = doc.getText();
          if (text && text.trim()) {
            return { text, file: workspacePathForDocument(doc) };
          }
        } else if (typeof value === 'string' && value.trim()) {
          return { text: value, file: null };
        }
      } catch {
        // Unreadable reference — skip it and try the next one.
      }
    }
    return null;
  };
}

// Thin glue that wires the handler to the real VS Code Chat + Language Model
// APIs. Returns null (registering nothing) when the host lacks the Chat
// Participant API, so the extension still activates cleanly on older VS Code
// builds and under the test harness's fake vscode.
function registerChatParticipant(vscodeApi, context, wiring) {
  if (!vscodeApi.chat || typeof vscodeApi.chat.createChatParticipant !== 'function') {
    return null;
  }

  const {
    loadSharedLibrary,
    getActiveEditor,
    getAnswerMode,
    recordRun,
    statusBar,
    workspacePathForDocument,
    getSelectedText,
    formatDelta,
  } = wiring;

  const resolveReferences = buildReferenceResolver(vscodeApi, workspacePathForDocument);

  const handler = async (request, _chatContext, stream, token) => {
    const shared = await loadSharedLibrary();
    const answer = buildAnswer(vscodeApi, request, stream, token);

    return handleChatRequest({
      request,
      stream,
      editor: getActiveEditor(),
      shared,
      workspacePathForDocument,
      getSelectedText,
      resolveReferences,
      recordRun: details => recordRun(context, statusBar, details),
      formatDelta,
      answerMode: typeof getAnswerMode === 'function' ? getAnswerMode() : false,
      answer,
    });
  };

  const participant = vscodeApi.chat.createChatParticipant(PARTICIPANT_ID, handler);
  context.subscriptions.push(participant);
  return participant;
}

// Builds the streaming model-call function shared by both participants, or null
// when no model is available (e.g. the user has not granted LM access yet).
function buildAnswer(vscodeApi, request, stream, token) {
  if (!request.model || !vscodeApi.LanguageModelChatMessage) {
    return null;
  }
  return async ({ prompt }) => {
    const messages = [vscodeApi.LanguageModelChatMessage.User(prompt)];
    const response = await request.model.sendRequest(messages, {}, token);
    for await (const fragment of response.text) {
      stream.markdown(fragment);
    }
  };
}

// Diagnostic: describe one ChatPromptReference as VS Code passed it, so we can
// see what is implicit (auto-attached / pinned) vs explicitly typed/attached.
function describeReference(ref, index) {
  if (!ref) {
    return `${index + 1}. (empty)`;
  }
  const id = ref.id || '(no id)';
  const typed = Array.isArray(ref.range) ? `yes [${ref.range.join(',')}]` : 'no';
  const value = ref.value;
  let kind = 'none';
  let where = '';
  if (value) {
    if (value.uri && value.range) {
      kind = 'location';
      const u = value.uri;
      where = u.path || u.fsPath || (typeof u.toString === 'function' ? u.toString() : '');
    } else if (value.path || value.fsPath || value.scheme) {
      kind = 'uri';
      where = value.path || value.fsPath || (typeof value.toString === 'function' ? value.toString() : '');
    } else if (typeof value === 'string') {
      kind = `string(${value.length} chars)`;
    } else {
      kind = typeof value;
    }
  }
  const verdict = isIntentionalReference(ref) ? '**KEPT**' : 'dropped';
  return `${index + 1}. id=\`${id}\` · typed=${typed} · value=${kind}${where ? ` · \`${where}\`` : ''} · current filter: ${verdict}`;
}

function describeReferences(references) {
  if (!Array.isArray(references) || references.length === 0) {
    return '_🔎 ref-debug: `request.references` is empty._';
  }
  return `_🔎 ref-debug: ${references.length} reference(s) in \`request.references\` (concise keeps typed #refs + chips you added, drops workspace customizations):_\n\n`
    + references.map((ref, i) => describeReference(ref, i)).join('\n');
}

// @cetoken-concise — opt-in terse chat mode. Context is opt-in (a live selection
// or a typed #-reference; never the merely-open file), the CONCISE_INSTRUCTION is
// prepended, and it always answers. Calling it is the consent: no global toggle.
async function handleConciseRequest(deps) {
  const { request, stream, shared, recordRun, answer, getLevel, getDebugReferences } = deps;
  const rawPrompt = String(request.prompt ?? '').trim();

  if (typeof getDebugReferences === 'function' && getDebugReferences()) {
    stream.markdown(describeReferences(request.references) + '\n\n');
  }

  if (!rawPrompt) {
    stream.markdown(
      'Type your question after `@cetoken-concise` — e.g. `@cetoken-concise why is this login test flaky?`. '
      + 'Answers come back terse to save output tokens (the expensive side). '
      + '**Select code** (or attach `#file` / `#selection`) to ask about it; with nothing selected it just answers your question — your open file is not pulled in.'
    );
    return { metadata: { command: 'concise', empty: true } };
  }

  const level = typeof getLevel === 'function' ? getLevel() : CONCISE_DEFAULT_LEVEL;
  const instruction = buildConciseInstruction(level);

  // Context is opt-in: an active selection, or #file / #selection. The merely-open
  // file is never folded in — selecting code includes it, deselecting drops it.
  const ctx = await resolveEditorContext(deps);

  // Deterministic, intent-keyed output-shape hint (answer-first + a SOFT length
  // nudge, or — via the Phare guard — an explicit "answer completely, flag a
  // false premise" line for fact-check / verify / destructive prompts). The
  // Copilot path exposes no enforced output cap, so the length line is a
  // model-dependent nudge, never a guarantee. inferResponseShape is a core shared
  // export (guaranteed present by module-boundaries.test.cjs); the fallback only
  // keeps partial test mocks working.
  const inferShape = typeof shared.inferResponseShape === 'function'
    ? shared.inferResponseShape
    : () => null;

  // When the user points at code / a diff / output, COMPRESS and EMBED it so the
  // model can actually analyze it. optimizePrompt only *summarizes* context (it
  // runs the selection through summarizeSelection), which left the model asking
  // to "see the diff". With no context, just tighten the bare question.
  let result;
  let body;
  if (ctx.text) {
    result = shared.optimizeSelectionText(ctx.text, { filename: ctx.file || '' });
    // optimizeSelectionText does not shape, so append the hint ourselves.
    const shapeLine = inferShape(rawPrompt, { selectionKind: result.kind, file: ctx.file || '' });
    body = `${rawPrompt}\n\n${fenceBlock(result.output)}`;
    if (shapeLine) {
      body += `\n\n${shapeLine}`;
    }
  } else {
    // optimizePrompt already folds a format slot in; hand it our hint via the
    // output metadata so the line appears exactly once (no double shaping).
    const shapeLine = inferShape(rawPrompt, { selectionKind: 'prompt-only', file: '' });
    result = shared.optimizePrompt(rawPrompt, shapeLine ? { output: shapeLine } : {});
    body = result.optimizedPrompt;
  }
  const protection = shared.protectSecrets(body);
  const finalPrompt = `${instruction}\n\n${protection.output}`;

  // Show the redaction receipt BEFORE the model call, so the user sees that
  // secrets were masked even if the model errors mid-stream.
  reportRedaction(stream, protection);

  if (typeof answer === 'function') {
    stream.markdown(`_Concise mode (${conciseLevelLabel(level)}) — answering tersely to save output tokens…_\n\n`);
    await answer({ prompt: finalPrompt });
  } else {
    stream.markdown('**Concise prompt** — copy into Copilot Chat (no model access granted yet):\n\n');
    stream.markdown(fenceBlock(finalPrompt, 'text'));
  }

  if (ctx.source === 'selection') {
    stream.markdown(`\n\n_Folded in your selection (${ctx.text.length} chars) — click or arrow-key in the editor to deselect and ask without it._`);
  } else if (ctx.source === 'reference') {
    const what = ctx.file ? `\`${ctx.file}\`` : 'context';
    stream.markdown(`\n\n_Folded in your attached ${what} (${ctx.text.length} chars) — remove the chip in the chat to exclude it._`);
  }

  if (typeof recordRun === 'function') {
    await recordRun({
      commandKey: 'chatConcise',
      commandLabel: 'Chat: Concise Answer',
      group: 'prompt',
      result,
    });
  }

  return { metadata: { command: 'concise' } };
}

function registerConciseParticipant(vscodeApi, context, wiring) {
  if (!vscodeApi.chat || typeof vscodeApi.chat.createChatParticipant !== 'function') {
    return null;
  }

  const { loadSharedLibrary, getActiveEditor, getLevel, getDebugReferences, recordRun, statusBar, workspacePathForDocument, getSelectedText, formatDelta } = wiring;

  const resolveReferences = buildReferenceResolver(vscodeApi, workspacePathForDocument);

  const handler = async (request, _chatContext, stream, token) => {
    const shared = await loadSharedLibrary();
    return handleConciseRequest({
      request,
      stream,
      editor: getActiveEditor(),
      shared,
      workspacePathForDocument,
      getSelectedText,
      resolveReferences,
      dropAutoContext: true,
      getLevel,
      getDebugReferences,
      recordRun: details => recordRun(context, statusBar, details),
      formatDelta,
      answer: buildAnswer(vscodeApi, request, stream, token),
    });
  };

  const participant = vscodeApi.chat.createChatParticipant(CONCISE_PARTICIPANT_ID, handler);
  context.subscriptions.push(participant);
  return participant;
}

module.exports = {
  PARTICIPANT_ID,
  CONCISE_PARTICIPANT_ID,
  CONCISE_INSTRUCTION,
  CONCISE_LEVELS,
  CONCISE_DEFAULT_LEVEL,
  buildConciseInstruction,
  fenceBlock,
  SELECTION_INTENTS,
  handleChatRequest,
  handleConciseRequest,
  buildReferenceResolver,
  registerChatParticipant,
  registerConciseParticipant,
};
