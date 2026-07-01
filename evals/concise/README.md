# `@cetoken-concise` output-reduction evals

Measures how much the **concise** instruction actually shortens model output -
the *output*-token savings that `@cetoken-concise` exists to deliver. This is the
honest answer to "does caveman mode really save tokens?": real model output,
measured, committed to git, reviewable as a diff.

Adapted from the three-arm design of the MIT-licensed
[caveman](https://github.com/juliusbrussee/caveman) evals.

## The four arms

| Arm | Instruction | Delivery channel |
|-----|-------------|------------------|
| `__baseline__` | none (verbose control) | none |
| `__terse__` | `Answer concisely.` (generic-terseness control) | system prompt |
| `concise_full` | the shipped **full**-level instruction | **user-message prefix** |
| `concise_ultra` | the shipped **ultra**-level instruction | **user-message prefix** |

**The honest number is `concise_* ` vs `__terse__`** - how much our instruction
adds *on top of* a plain "be terse" ask. Comparing to `__baseline__` alone
inflates the figure by counting the generic terseness effect too (we report both
so the difference is visible).

The arm instructions are imported from the **shipped extension code**
(`vscode-extension/src/chat-participant.cjs` -> `buildConciseInstruction`), so the
snapshot always measures exactly what users get.

### Delivery channel matches production (and stays conservative)

The shipped `@cetoken-concise` sends its instruction as a **user-message prefix**
(`buildAnswer` -> `LanguageModelChatMessage.User(prompt)`), *not* a system
prompt. So the `concise_*` arms deliver via user-prefix here too - measuring them
as a system prompt would overstate how strongly the model follows them.

The `__terse__` / `__baseline__` controls stay on their original channels (system
prompt / none). That is a deliberate cross-channel asymmetry: a system-prompt
control adheres *at least as strongly* as a user-prefix one, so it only makes
`concise_*` **harder** to beat. The `concise_* vs __terse__` headline therefore
cannot flatter the tool - read it as "our shipped user-prefix instruction vs a
system-prompt terse ask".

### Prompt families

`prompts.txt` is grouped (with `#` comment lines the runner skips) into three
families so the set exercises the real code paths and the safety guard:

- **A - general explanatory Q&A** - brevity-safe; wording compresses with no
  false premise.
- **B - selection-bearing** - a code snippet / query embedded inline, to
  approximate the with-context (`#file` / selection) branch.
- **C - false-premise / factual-correction** - the **Phare** guard target
  ([arXiv 2505.11365](https://arxiv.org/abs/2505.11365)): a generic "be concise"
  drops hallucination-resistance here, so brevity must stay **off**. These
  prompts are in the set now so the guard (shipping in the response-shape feature)
  is measurable; read family C **per-family**, not folded into the aggregate.

## Two scripts (caveman's split)

- **`run.mjs`** - calls the `claude` CLI once per (prompt x arm), captures real
  output, writes `snapshots/results.json`. Needs a logged-in `claude` CLI and
  makes real (small) model calls. Run it to refresh the snapshot.
- **`measure.mjs`** - reads the committed snapshot, counts tokens, prints the
  reduction table. **No model calls** - deterministic, free, safe in CI.

```bash
# Refresh the snapshot (real model calls - costs a little)
CE_EVAL_MODEL=claude-haiku-4-5 node evals/concise/run.mjs

# Read it (no model, runs anywhere)
node evals/concise/measure.mjs      # or: npm run evals:concise
```

## What the numbers are - and are not

- **Real output**, not hand-written examples (no circularity).
- Tokens are counted with the kit's own `estimateTokens` heuristic, applied
  identically to every arm. Read them as **output-length reduction**, not exact
  provider tokens - the *ratio* between arms is the meaningful part.
- Measured on the named model as a **proxy** for Copilot's models. The terseness
  effect transfers across models; absolute numbers vary. For an exact figure in
  your environment, run the same prompts through Copilot Chat with and without
  `@cetoken-concise` and compare.
- A snapshot is **committed** so the numbers are reviewable and CI is free.
  Regenerate it whenever the instruction or prompt set changes - the diff shows
  the impact.
- **Regeneration needs an authenticated `claude` CLI and spends a little on real
  model calls**, so it does not run in CI or in an unauthenticated build. When
  the delivery channel or prompt set changes (as in this revision), the committed
  numbers are refreshed by running `run.mjs` in an authenticated environment -
  the reported figures come from that run, never hand-edited.

## Honesty note

The kit's **hard** guarantee is *input* compression (measured before/after on
every run). The *output* saving is a **measured strong tendency**, not a per-call
guarantee - it depends on the model honouring the instruction. These evals show
it does, on average, across a fixed prompt set.

## Adding a prompt

Append a line to `prompts.txt` (one prompt per line; `#` lines are family labels
the runner skips), then re-run `run.mjs` in an authenticated environment.
