# Certance Token Kit

**Cut your GitHub Copilot token bill - locally.** Certance Token Kit compresses oversized context (long test output, big diffs, large JSON, heavily-commented code) before it reaches the model, disciplines verbose output, and advises the cheapest model for each task. Around that sits a transparent guardrail layer: it **redacts and scans for secrets** (in prompts at runtime, across the repo, and at commit time), controls which files Copilot can index through GitHub content-exclusion policies, and **exports audit evidence** of the savings and protections for a security review. No cloud dependencies, no external service calls, no content stored - pure local regex, zero extra tokens.

For teams that want retrospective analytics as a separate layer, AI Engineering Coach can be used as an optional companion after policy review; this kit remains the preventive, local-first control layer.

---

## What's in the box

| Component | What it does |
|---|---|
| **VS Code extension** | In-IDE token optimization: an `@cetoken` Copilot Chat participant (with `/compress`, `/review`, `/debug`, `/explain`), a `#ceCompress` agent-mode tool, and 13 command-palette commands. Status bar shows net tokens saved. See [In Copilot Chat and agent mode](#in-copilot-chat-and-agent-mode). |
| **Compression helper** | The primary lever: shrinks test output, diffs, JSON, code, and instruction files before they reach Chat (`scripts/compress.js`), with runtime high-confidence secret redaction (including dedicated full-value `.env` assignment redaction) |
| **Secret protection** | Defence in depth: runtime redaction in prompts, **`CE: Scan Workspace for Secrets`** (risk-aware repo scan - only files Git can commit; a gitignored `.env` is correctly left alone), and **`CE: Install Pre-commit Secret Scan`** (a self-contained hook that blocks a commit carrying a secret). Same patterns everywhere; pure regex, local, zero tokens. |
| **Audit evidence** | **`CE: Export Audit Evidence`** writes a per-developer pack (markdown + JSON): tokens -> **estimated cost saved**, redaction counts, content-exclusion coverage, readiness. Turns "trust us" into numbers for a risk review. |
| **One-command setup** | **`CE: Apply Guardrail Profile`** deploys the instruction files + content-exclusion reference **non-destructively** (adds only what's missing, never overwrites), and reports an MCP advisory - your connections are never changed. |
| **Prompt optimizer** | CLI five-stage pipeline that tightens loosely-phrased prompts (`scripts/optimize-prompt.js`) - useful for structure, a lighter lever than compression |
| **Copilot instructions** | Short repository-wide direct-answer default layer (`.github/copilot-instructions.md`) |
| **Output discipline** | Auto-applied instruction file that targets the *expensive* side - output tokens (~5x input): terseness plus a "don't over-build" ladder (reuse before adding, smallest viable change), with safety guardrails (`.github/instructions/lean-output.instructions.md`) |
| **Content exclusion** | Controls which files Copilot can use for IDE completions, Chat, and code review (GitHub settings). Separate behavioral instructions cover Agent Mode gaps (`AGENTS.md`). |
| **Engineer playbook** | Practical habit guide - habits that reduce waste regardless of stack (`playbook.md`) |
| **Profiles** | Installable bundles for different rollout stages (`profiles/`) |
| **Measurement pack** | Evidence capture for before/after validation (`measurement/`) |

---

## Features at a glance

- **Token & cost savings** - compress oversized context (`@cetoken /compress`, `#ceCompress`), extract focused packs (`/focus`), outline big files, and discipline the expensive *output* side (`@cetoken-concise`, `lean-output`).
- **Cost visibility** - `CE: Recommend a Model for This Task` routes each task to the cheapest fit (local-transform / completion / Auto / premium / batch) - the model multiplier is the biggest cost dial.
- **Secret protection** - runtime redaction, a risk-aware `CE: Scan Workspace for Secrets`, and a `CE: Install Pre-commit Secret Scan` hook that blocks a leak at commit time.
- **Governance & compliance** - `CE: Export Audit Evidence` (tokens -> cost saved, redaction counts, an enforced-vs-advisory matrix), content exclusion + `AGENTS.md`, and a Transform-only lockdown.
- **Proof** - a measurement pack, a concise **quality gate** (proves terse stays complete), and a step-by-step UAT script.

**-> Full feature catalogue, with the business angle for each: [docs/FEATURES.md](docs/FEATURES.md).**

---

## Day-to-day: which feature, when

Setup is one-time; this is the everyday habit loop. **The one rule that matters most: compress big context *before* it reaches the model** - that's where the repeatable savings are.

- **Big/noisy context** (long test failure, big diff, large JSON, commented file) -> select it, `@cetoken /compress` (or `/focus` for the decisive lines, `/outline` for a big file)
- **A question, no code change** -> `@cetoken-concise <question>` - terse, answer-first replies that cut the expensive *output* side
- **Review a diff / debug a trace / explain code** -> `@cetoken /review` · `/debug` · `/explain`
- **Pasting something that may hold a secret** -> nothing to do; **redaction is automatic** before anything leaves your machine
- **Unsure which model** -> `CE: Recommend a Model for This Task` - the biggest cost dial; start cheap, escalate only if the answer misses
- **Agent mode** -> enable `#ceCompress` so the agent auto-compresses large context

Plus two zero-tooling habits: a **fresh chat per task** (avoid context rot) and **paste only the relevant lines**. Full flow and one-time setup: **[docs/QUICK-START.md](docs/QUICK-START.md)**.

---

## In Copilot Chat and agent mode

The fastest way to use the kit is from inside Copilot itself - no command palette, no clipboard detour.

- **`@cetoken` chat participant.** In the Copilot Chat box, type `@cetoken fix the failing login test`. It folds in your active file and selection, optimizes the prompt, redacts high-confidence secrets, and returns a tightened prompt with a token delta. Slash commands operate on the current selection: `/compress` (code, JSON, output, or diff), `/focus` (extract only the decisive lines from a failure/diff/trace into a labelled pack), `/outline` (keep a big file's signatures, drop bodies), `/review` (compress + review a diff), `/debug` (stack trace), `/explain` (explain code - outlines big files).
  - By default `@cetoken` runs in **Transform mode** (returns the optimized prompt - no Copilot request spent). Turn on the `ceTokenKit.chat.answerMode` setting for **Answer mode**, where it sends the optimized prompt to your selected model and streams the answer in-pane.
- **`@cetoken-concise` chat participant.** A second, opt-in participant that **forces terse, concise answers** to save *output* tokens (the expensive side, ~5x input). Type `@cetoken-concise <question>` and it answers tersely (intensity levels `lite` and `full`, with verbatim-code and safety carve-outs). Context is opt-in - **select code (or attach `#file`/`#selection`) to ask about it; a merely-open file is never pulled in** ("selection is the switch"). It only acts when you `@`-mention it - for workspace-wide terseness (incl. agent mode) use the `lean-output.instructions.md` file instead. Measured on a 21-prompt eval (Haiku proxy, on the shipped delivery channel): **27% shorter output (median)** than a plain "be concise" ask, **34% shorter than an unguided answer**, and **~56% on explanations of a selected snippet** (the biggest win). Tellingly, a bare "Answer concisely." instruction on its own saves only ~2% - the *structured* instruction, not brevity-nagging, is what earns the savings. It compresses the *wording* only, never the reasoning, and stays fully verbose for false-premise, safety, and multi-step answers. Reproduce with `npm run evals:concise` ([evals/concise/](evals/concise/)).
- **`#ceCompress` agent tool.** For Copilot **agent mode**, the kit registers a Language Model tool the agent can call on its own to compress large code, diffs, JSON, or test output before it enters context. It is **off by default** - enable it with the `ceTokenKit.agentTool.enabled` setting, then control it from the agent **Configure Tools** picker (untick to return to default behavior) or invoke it explicitly with `#ceCompress`.

Every run's token delta rolls into the status-bar savings counter. Full details: [vscode-extension/README.md](vscode-extension/README.md).

### Security & governance commands

Run these from `Cmd+Shift+P` -> type `CE:`. All are **local, pure-regex, zero-token** - they send nothing anywhere.

- **CE: Scan Workspace for Secrets** - risk-aware scan over the files Git can commit. A gitignored `.env` is *not* flagged (that's the right place for secrets); a committable secret is, ranked 🔴 tracked vs 🟠 not-yet-committed, shown as `file:line + type` (never the value).
- **CE: Install Pre-commit Secret Scan** - generates a self-contained hook that scans **staged** content and blocks a commit carrying a secret. Non-destructive (never overwrites an existing hook or `core.hooksPath`); honest bypass with `git commit --no-verify`.
- **CE: Export Audit Evidence** - a markdown + JSON pack: tokens -> estimated cost saved, redaction counts, exclusion coverage, readiness - for a security/risk review.
- **CE: Apply Guardrail Profile** - non-destructive deploy of the instruction + content-exclusion assets, with an advise-only MCP report.

---

## Compliance & data flow

Built to be defensible in regulated environments (DORA, FCA/PRA operational resilience, and similar). The kit is **local-first** - the only features that contact a model are opt-in (Answer mode and `@cetoken-concise`), and all model access can be pinned off by policy.

| Feature | Calls a model? | Leaves your machine? |
|---|---|---|
| Compression & optimization - CLI, `@cetoken` **Transform mode** (default), all slash commands, palette commands | **No** | **No - fully local** |
| Secret scanning, pre-commit hook, audit evidence, guardrail profile (palette commands) | **No** | **No - pure local regex, zero tokens** |
| `@cetoken` **Answer mode** (`ceTokenKit.chat.answerMode`, opt-in, off by default) | Yes - Copilot's Language Model API | Yes - the **redacted** prompt, the *same path as using Copilot Chat directly* |
| `@cetoken-concise` (opt-in per message - only when you `@`-mention it) | Yes - Copilot's Language Model API | Yes - the **redacted** prompt + a terseness instruction, *same path as Copilot Chat* |
| `#ceCompress` **agent tool** (`ceTokenKit.agentTool.enabled`, opt-in, off by default) | The tool itself does no network I/O; it *shrinks* what the agent sends | Via the agent's existing model loop |

- **No network calls of its own**, **no runtime dependencies**, and **no content persisted** - only local token/command counts.
- High-confidence secrets are **redacted before anything is displayed or sent**, and the slash/optimize commands show a `⚠ Redacted N...` warning when they fire.
- The VS Code "wants to access the language models" consent prompt appears **only** for Answer mode or `@cetoken-concise` - it is VS Code's own gate on the Copilot LM API. A Transform-only lockdown (`ceTokenKit.chat.answerMode`, `ceTokenKit.concise.enabled`, `ceTokenKit.agentTool.enabled` all `false`) removes every model-calling surface.

For a security reviewer: the full data-flow model, the audit evidence, copy-paste **verification commands**, and a **Transform-only lockdown** (`configurationDefaults`) are in **[vscode-extension/SECURITY.md](vscode-extension/SECURITY.md)**. A ready-to-share **[audit pack](docs/audit/)** (security one-pager, data-flow diagram, and an IP/conflict-of-interest disclosure template) is in `docs/audit/`.

---

## Recent updates

Recent additions now included in the kit:

1. **Secret scanning, two layers** - **CE: Scan Workspace for Secrets** (risk-aware: only files Git can commit; a gitignored `.env` is correctly left alone) and **CE: Install Pre-commit Secret Scan** (a self-contained hook that blocks a commit carrying a secret). Both reuse the redactor's patterns, run on pure local regex, and cost zero tokens.
2. **CE: Export Audit Evidence** - a markdown + JSON pack that converts estimated tokens saved into **cost saved**, with redaction counts and content-exclusion coverage, for a security/risk review.
3. **CE: Apply Guardrail Profile** - one-command, non-destructive deploy of the instruction files + content-exclusion reference, plus an advise-only MCP report.
4. **`@cetoken-concise` participant** - opt-in terse answers that target the *expensive* output side (~5x input); measured 27% shorter (median) than a plain "be concise" ask and 34% vs an unguided answer (21-prompt eval on the shipped channel), compressing wording only - never the reasoning.
5. **`@cetoken` Copilot Chat participant** with Transform/Answer modes and `/compress`, `/review`, `/debug`, `/explain`, plus the **`#ceCompress`** agent-mode tool (off by default) for auto-compressing large context.
6. Cacheability scoring and MCP/tool-bloat warnings - **CE: Optimize Prompt** scores how reusable a prompt's prefix is and flags volatile run details (IDs, timestamps) to move to the end.

---

## Quick install - 5 minutes

### 1. Install the VS Code extension

```bash
code --install-extension ce-token-kit-0.2.64.vsix
```

Or: VS Code -> Extensions -> `...` -> **Install from VSIX** -> select `ce-token-kit-0.2.64.vsix`.

Restart VS Code. You'll see `$(graph) CE: 0t saved` in the status bar when the extension is active.

### 2. Deploy the guardrail profile into your repository

**Easiest - one command, non-destructive.** In VS Code, `Cmd+Shift+P` -> **CE: Apply Guardrail Profile**. It adds the output-discipline instruction file, a direct-answer `copilot-instructions.md`, and a content-exclusion reference **only if they're missing** - it never overwrites your files - then opens a report with the content-exclusion checklist and an MCP advisory (your connections are never changed).

**Or copy them manually:**

```bash
cp <path-to-kit>/AGENTS.md .
cp <path-to-kit>/.github/copilot-instructions.md .github/
mkdir -p .github/instructions
cp <path-to-kit>/.github/instructions/lean-output.instructions.md .github/instructions/
cp <path-to-kit>/.github/copilot-content-exclusion.yml .github/
```

> MCP is **advisory** in this kit. If you keep a `.vscode/mcp.json`, review it for tools your repo doesn't need and prefer `allowed_tools` / `defer_loading` - see `profiles/mcp-minimal-tools.jsonc` for a reference. The kit never edits your MCP connections.

If your team uses VS Code, also apply the personal settings template once per engineer:

1. `Cmd+Shift+P` -> **Open User Settings (JSON)**
2. Merge `profiles/vscode-user-settings.jsonc` into the file
3. Save

### 3. Set up content exclusion in GitHub (required for enforcement)

1. Go to your repository on GitHub -> **Settings -> Copilot -> Content exclusion**
2. Paste the patterns from `.github/copilot-content-exclusion.yml`
3. Save - propagates to IDEs within 30 minutes

For organisation-wide setup or the REST API approach, see [SETUP.md](docs/SETUP.md).

### 4. First thing to try after install

Start with the biggest, most concrete win: **compressing large context before it reaches Copilot.** Select a long test failure or a big diff in your editor, then type `@cetoken /compress` in the Copilot Chat box. A 180-line Playwright failure collapses to ~15 lines - the error, the failing assertion, and where it came from - so the model sees the signal, not the noise. The same applies to big JSON payloads and heavily-commented code.

Once that habit lands, `@cetoken fix the failing test` (no slash command) also tightens a raw prompt and folds in your active file. Both paths show a before/after token count and roll the delta into the status-bar savings counter.

> Prompt-tightening (including the cacheability scoring built into **CE: Optimize Prompt**) is a situational extra - modern Copilot models already handle loosely-phrased prompts well, and Copilot Chat exposes no cache-hit control you can steer. Reach for it when you want structure, not as the headline lever. Compressing oversized context is where the repeatable savings are.

---

## Going further

- **Feature catalogue:** [docs/FEATURES.md](docs/FEATURES.md) - every feature with its business angle (for demos and reviews)
- **Full setup reference:** [SETUP.md](docs/SETUP.md) - content exclusion layers, prompt optimizer CLI, measurement
- **Quick-start guide:** [QUICK-START.md](docs/QUICK-START.md) - one-page summary of the 80% path
- **Engineer habits:** [playbook.md](docs/playbook.md) - distribute this to your team

---

## What the kit does not do

- It does not send any data externally by default. All compression and optimization run locally. The one exception is the extension's opt-in **Answer mode**, which sends the *redacted* prompt to your own Copilot model over Copilot's Language Model API (off by default; can be disabled by policy) - see [vscode-extension/SECURITY.md](vscode-extension/SECURITY.md).
- It does not remove secrets from local files on disk. Runtime redaction protects prompt payloads, not stored source files.
- It does not protect direct manual paste into Copilot Chat if the pasted content does not go through the local optimizer/compressor flow first.
- It does not make savings guarantees. Token counts are estimated locally (`ceil(len/4)`, no runtime tokenizer); the reported **percentage reduction** is reliable to roughly ±5pp while absolute counts can drift 20-30% - measured in [evals/tokenizer/](evals/tokenizer/). Use `measurement/savings-worksheet.md` to measure your own baseline.
- The `.copilotignore` file is a community convention, not a first-class GitHub Copilot feature. For guaranteed content exclusion, use the GitHub settings or REST API (Step 3 above).

---

## Support

Contact: Ivan Stepantsov - Quality Engineering Team Lead, Certance Advisory
