# Certance Token Kit - VS Code Extension

Cut your GitHub Copilot token bill, locally. An `@cetoken` chat participant, a `#ceCompress` agent tool, and fourteen commands that compress context, redact and scan for secrets, and export audit evidence. No external calls; tokens saved shown live in the status bar.

---

## Install

```bash
code --install-extension ce-token-kit-0.2.64.vsix
```

Or: Extensions -> `...` -> **Install from VSIX** -> select `ce-token-kit-0.2.64.vsix`.

After install, restart VS Code. You'll see `$(graph) CE: 0t saved` in the status bar.

---

## `@cetoken` in Copilot Chat

The fastest way to use the kit - no command palette, no clipboard. In the Copilot Chat box, type `@cetoken` followed by your request:

```
@cetoken fix the failing login test
```

`@cetoken` folds in your active file and selection, runs the request through the optimizer, redacts high-confidence secrets, and handles it in the chat pane. Open the relevant file (and optionally select the failing code) before invoking, so it can attach that as context. Every run's token delta rolls into the status-bar savings counter.

### Slash commands

Select the relevant text in your editor (or attach it with `#file` / `#selection` in the chat box), then run one of these after `@cetoken`:

| Command | What it does |
|---|---|
| `/compress` | Compresses the selection (auto-detects code, JSON, test output, or diff) for pasting into Chat |
| `/focus` | Builds a **focused context pack** - auto-detects the artifact and *extracts* only the decisive lines (failing assertion, top app frame, changed hunks, error fields) into labelled sections. Extractive, not summarizing; a smarter, unified take on `/review` + `/debug`. |
| `/outline` | Outlines a large file - keeps imports, types, and signatures, drops function bodies (often 70-90% smaller). Ideal for giving Copilot context about a big file. |
| `/review` | Compresses the selected diff (keeps the changed lines, drops context + lockfile noise) and frames it - highest-risk findings first |
| `/debug` | Frames the selected stack trace - root cause, then the smallest fix |
| `/explain` | Explains code - **outlines** a large selection (signatures only) and asks for a structural explanation, or compresses + explains a small one. Understand an unfamiliar file cheaply. |

### Transform vs Answer mode

By default `@cetoken` runs in **Transform mode**: it returns the optimized/compressed prompt for you to send - no Copilot request is spent. Turn on the `ceTokenKit.chat.answerMode` setting to switch to **Answer mode**, where `@cetoken` sends the optimized prompt to your selected Copilot model and streams the answer back in-pane (this consumes a Copilot request). `/compress` is always a utility and never calls the model.

> **Security / regulated environments:** Answer mode and `@cetoken-concise` are the only features that contact a model, and they send the *redacted* prompt over Copilot's own Language Model API (the same path as Copilot Chat) - that's what the one-time "wants to access the language models" consent prompt is. Transform mode and the slash commands are fully local with no model access. For the full data-flow model, the audit evidence, and how to hard-disable model access by policy, see [SECURITY.md](SECURITY.md).

---

## `@cetoken-concise` - concise mode

A second participant that **forces terse answers** to save *output* tokens - the expensive side (output costs roughly 5x input). Type `@cetoken-concise` followed by your question:

```
@cetoken-concise why is this login test flaky?
```

It answers your question with a strict terseness instruction prepended, redacts secrets, and **always** sends it to your Copilot model. You get a short, dense answer instead of three paragraphs.

**Context is opt-in - you control it with visible chips and your selection:** concise folds in a **live selection** or a **file you attach** (`#file:...` or the paperclip chip). With nothing selected and nothing attached, it just answers your question - a merely-*open* file is **never** pulled in. The footer always names what was folded so it's never a surprise.

> Concise folds in only context **you added** - a selection or an attachment chip. The workspace context VS Code attaches automatically (your `copilot-instructions.md` / `AGENTS.md` / instruction files and the customizations blob) is **dropped**, so it can't bloat or steer a terse answer. (This filtering is concise-specific; `@cetoken` still honors all attached context.)

| You do | Concise includes |
|---|---|
| Select code, then ask | that selection |
| Attach a file (`#file:...` or paperclip), then ask | that file |
| Nothing selected/attached, just ask | nothing - pure Q&A |
| Deselect / remove the chip | drops it - back to pure Q&A |

**Measured output reduction:** in a 21-prompt eval (Haiku proxy, measured on the *shipped* user-prefix delivery channel), the default `full` level produced answers **27% shorter than a plain "Answer concisely." ask** (median) and **34% shorter than an unguided answer**; explanations of a selected snippet compress the most (**~56%**). A bare "Answer concisely." on its own moves the needle only ~2%, so the structured instruction - not brevity-nagging - is doing the work. Output costs ~5x input, so this is the expensive side of the savings. Reproduce with `npm run evals:concise`; methodology and the committed snapshot live in `evals/concise/`.

- **Opt-in by design** - it only activates when you `@`-mention it. There is no global toggle and no effect on ordinary Copilot Chat.
- **It always answers** (calls the model) - mentioning it is the consent. Unlike `@cetoken`, there is no Transform mode; its whole purpose is a terse *answer*.
- **Two intensity levels** via `ceTokenKit.concise.level`:
  - **lite** - cut filler, hedging, pleasantries; keep full sentences. Professional but tight.
  - **full** (default) - drop articles + filler, fragments allowed, short words. Classic terse answer.
  - _(`ultra` is retired: measuring it showed it produced **longer** output than `full`, so it now runs as `full`. The setting value still works, so no config breaks.)_
- **Safety rails on every level** (this is what keeps it usable on real work): code, identifiers, API/CLI names, and error strings are kept **verbatim**, and it switches back to **full prose for security warnings, irreversible-action confirmations, and order-sensitive steps** - terseness never clips a safety- or correctness-critical detail.
- **Reach:** like any participant, it shapes only its own `@`-mentioned turns. To make **all** Copilot answers (incl. agent mode) terse workspace-wide, use the `lean-output.instructions.md` instruction file instead - the two are complementary.

> Under the hood, the terseness ruleset borrows proven best-practices from the open-source [`caveman`](https://github.com/juliusbrussee/caveman) project (MIT) - its instruction drop-list, verbatim-code preservation, and clarity carve-outs - repackaged into a simpler, opt-in chat mode for everyday use.

---

## Agent mode - `#ceCompress`

For Copilot **agent mode**, the kit registers a Language Model tool, `ce_compress`, that the agent can call on its own to shrink large code, diffs, JSON, or test output before it enters the model context - no `@cetoken` needed. When it fires it returns a visible `Compressed <kind>: N -> M tokens` note, and the delta rolls into the status-bar savings counter.

**It is off by default.** Turn it on with the `ceTokenKit.agentTool.enabled` setting. Once on, you control it three ways:

- **Automatic** - leave it ticked in the agent **Configure Tools** picker (the wrench icon in the chat input, agent mode only); the agent calls it when a payload is large.
- **Explicit** - reference it directly in a prompt with `#ceCompress`.
- **Off / default** - untick it in the Configure Tools picker, or set `ceTokenKit.agentTool.enabled` to `false`. The agent then behaves normally, with no auto-compression.

---

## Commands

Run any command via `Cmd+Shift+P` and type `CE:`.

| Command | What it does |
|---|---|
| **CE: Optimize Prompt** | Runs your raw prompt through the optimization pipeline - normalizes, strips conversational filler, extracts constraints, injects file context, infers response shape. Redacts secrets. Also **scores cacheability** and flags volatile run details (IDs, timestamps) to move to the end so the stable prefix stays reusable across runs. Copies result to clipboard. |
| **CE: Review Diff** | Select a git diff -> compresses it using the diff engine -> frames as highest-risk findings first |
| **CE: Debug Stack Trace** | Select a stack trace -> compresses to top 3 source frames -> frames as root cause + smallest fix |
| **CE: Explain Selection** | Use when a code block is too large to paste raw. Compresses it first (strips comments, collapses blank lines), then frames the explanation request. Lower token cost than pasting uncompressed and asking Copilot to explain. |
| **CE: Check Context Readiness** | Audits each open workspace for repo instructions, path instructions, AGENTS.md, content exclusion, MCP config, devcontainer support, and context freshness. Opens a local readiness report with the highest-value missing pieces first. |
| **CE: Redact Clipboard** | Scrubs high-confidence secrets from your **clipboard** in place, then tells you what was masked - so you can copy secret-bearing text, run this, and paste a clean version into *plain* Copilot Chat (or anywhere). The deliberate path to redact before a raw paste, which `@cetoken` can't intercept. |
| **CE: Apply Guardrail Profile** | Drops the token-savings + direct-answer controls into the workspace **non-destructively** - adds `lean-output.instructions.md`, a direct-answer `copilot-instructions.md`, and a content-exclusion reference *only if absent* (never overwrites your files). Emits a report: the content-exclusion checklist (with its agent-mode caveat) and an **MCP advisory** (what's connected, what to prune/defer) - your MCP connections are never changed. |
| **CE: Export Audit Evidence** | Writes a per-developer **audit artifact** (markdown report + `ce-audit-evidence.json`): estimated tokens saved -> **cost saved** (set `ceTokenKit.costPerMillionTokensUSD`), secret-redaction count, context-readiness verdict, MCP summary, and an **enforced-vs-advisory governance matrix** + posture checklist (content-exclusion coverage with its agent-mode gap, `AGENTS.md` policy present, MCP checked). Turns "trust us" into numbers for a security/risk review. Local-only; no content stored. |
| **CE: Scan Workspace for Secrets** | **Risk-aware** secret scan over the files Git can commit (tracked + untracked-not-ignored), using the same patterns as the redactor. Gitignored files (your local `.env`) are intentionally **not** scanned - that's the correct place for secrets. Findings are risk-ranked (🔴 tracked/maybe-pushed vs 🟠 not-yet-committed) and shown by `file:line` + redaction **type** only - never the secret value. Pure regex; local, no AI, **zero tokens**. |
| **CE: Install Pre-commit Secret Scan** | Generates a **self-contained git pre-commit hook** (`.ce-token-kit/secret-scan-hook.cjs`) that scans **staged content** and **blocks the commit** if a secret is detected - the upstream guard that stops a leak before it reaches the repo. The scanner is generated from the same patterns as the redactor (no drift). **Non-destructive:** never overwrites an existing hook or a custom `core.hooksPath` - it writes the scanner and advises how to wire it in. Honest bypass: `git commit --no-verify`. Pure regex; local, no AI, **zero tokens**. |
| **CE: Recommend a Model for This Task** | The **model-selection lever** - model choice is a *multiplier on the whole request*, the single biggest cost dial. Describe the task (or use your selection); it classifies it (economy / standard / premium) **and gives a cost-posture routing** - *local-transform* (may need no model call at all), *completion/base*, *Auto* (with the eligible-plan discount), *premium-justified*, or *batch/offline* - with the "start cheap, escalate only if the answer misses" ladder. **Advisory** - defers to the picker for live multipliers and links to GitHub's billing docs; can't switch the model for you. Local regex, **zero tokens**. |
| **CE: Show Local Stats** | Token savings, warning counts, prompt reuse score, command frequencies |
| **CE: Reset Local Stats** | Resets all local stats to zero |

---

## Secret redaction

Every time you run **CE: Optimize Prompt**, the extension scans your prompt and any attached context for high-confidence secret patterns and redacts them before the optimized output is written to clipboard. This runs automatically - no flag, no setting.

**What gets redacted:**

| Pattern | Example match | Replaced with |
|---|---|---|
| GitHub tokens | `ghp_...`, `github_pat_...` | `[REDACTED_GITHUB_TOKEN]` |
| OpenAI / Anthropic keys | `sk-proj-...`, `sk-...` | `[REDACTED_API_KEY]` |
| AWS access key IDs | `AKIA...`, `ASIA...` | `[REDACTED_AWS_ACCESS_KEY_ID]` |
| Bearer tokens | `Bearer <token>` | `Bearer [REDACTED_BEARER_TOKEN]` |
| JWTs | `eyJ...` three-part format | `[REDACTED_JWT]` |
| Private key blocks | `-----BEGIN PRIVATE KEY-----` | Block replaced |
| Env assignments | `OPENAI_API_KEY=sk-...` | Value replaced |
| Auth headers | `Authorization: <value>` | Value replaced |
| JSON sensitive fields | `"api_key": "..."` | Value replaced |

**Org-specific patterns:** add your own token formats with the `ceTokenKit.secretPatterns` setting (`[{ "name": "CORP_TOKEN", "regex": "corp-[A-Za-z0-9]{32}" }]`) - applied on top of the built-ins on every redaction surface, so an internal key shape is masked to `[REDACTED_CORP_TOKEN]`. Pin it via workspace/org policy for a regulated rollout.

**What it does not do:** It does not scan files on disk. It only redacts content that passes through the prompt optimizer or compression commands. For file-level protection, use the content exclusion layer (`.github/copilot-content-exclusion.yml`).

**When redaction fires,** the result document shows a warning at the top:

```
⚠ High-confidence secret patterns were redacted locally (2 match(es): github-token, openai-anthropic-key).
```

The optimized prompt in your clipboard already has the secrets replaced. The original file is unchanged.

---

## How selection commands work - the compression engine

**CE: Review Diff**, **CE: Debug Stack Trace**, and **CE: Explain Selection** all run a compression pass on your selected text before framing the output. This is what makes them useful for large inputs.

The compression engine strips noise differently depending on what it detects:

**Code selections** (`CE: Explain Selection`)

The engine strips all comment-only lines (single-line `//`, `#`, and block `/* */`) and collapses consecutive blank lines to one. All logic, types, imports, and signatures are preserved. Supported languages: TypeScript, JavaScript, Python, Go, Java, C/C++, Shell.

Use this when a file is large enough that pasting it raw would bloat the context. A 400-line file with heavy JSDoc typically compresses to 200-280 lines. The model sees the same code, minus the noise.

Before:
```typescript
/**
 * Authenticates the user against the database.
 * @param credentials - login payload
 * @returns auth token on success
 */
async function authenticate(credentials: UserCredentials): Promise<string> {
  // look up user record
  const user = await db.findUser(credentials.email);
  // validate hash
  if (!user || !bcrypt.compare(credentials.password, user.hash)) {
    return null; // caller handles null as 401
  }
  return generateToken(user); // short-lived JWT
}
```

After (what goes to Copilot):
```typescript
async function authenticate(credentials: UserCredentials): Promise<string> {
  const user = await db.findUser(credentials.email);
  if (!user || !bcrypt.compare(credentials.password, user.hash)) {
    return null;
  }
  return generateToken(user);
}
```

**Stack trace selections** (`CE: Debug Stack Trace`)

Extracts only the error message, `Expected` / `Received` lines, code context markers (`> 42 |`), and the top 3 source-file stack frames. Strips all passing tests, browser tags, node internals, and `node_modules` frames.

Before: 180-line Playwright failure output
After: ~15 lines - the error, the failing assertion line, and where it came from

**Diff selections** (`CE: Review Diff`)

Passes through the diff as-is (structure must be preserved) and frames the output around changed behavior and regression risk. Use this before sending a large diff to Copilot for review - it directs the model's attention to what changed, not the surrounding context.

---

## First use - Optimize Prompt walkthrough

1. Open any `.ts` or `.js` file in VS Code
2. `Cmd+Shift+P` -> **CE: Optimize Prompt**
3. Enter a raw prompt: `please fix the failing assertion in the login test, don't change the API`
4. The extension runs five stages:
   - Strips `please` and normalizes to imperative: `Fix the failing assertion in the login test.`
   - Extracts `don't change the API` into an explicit `Constraint:` line
   - Injects `[TypeScript]` tag and the active file path
   - Appends `Return the minimal change needed. Keep the explanation to a sentence or two.`
   - Scans for secrets - none found, no redaction warning
5. Result is copied to clipboard. Paste directly into Copilot Chat.

If your prompt had contained `OPENAI_API_KEY=sk-proj-...`, step 5 would have replaced the value before copying and shown a redaction warning in the result doc.

---

## Status bar

`$(graph) CE: 1,240t saved` - net tokens saved across all optimization runs this session.

Click to open the local stats document.

When a workspace readiness scan has run, the status bar also shows a shield badge with the latest readiness score. This is a lightweight summary of repo context quality, not a session-log analytics feed.

The readiness badge refreshes automatically when you save any of these files inside an open workspace:

1. `.github/copilot-instructions.md`
2. `AGENTS.md`
3. `.vscode/mcp.json`
4. `.vscode/mcp.jsonc`

Rapid repeated saves are debounced, so the extension recomputes readiness once after the latest save instead of rescanning on every write.

---

## Cache score and prompt reuse

Every optimized prompt receives a **cache score** (0-100). A low score appears in the stats as a `Low prompt reuse score` warning.

**What the score measures:** whether your prompt is structured so that the stable parts (task description, file path, constraints) come before the volatile parts (timestamps, run IDs, specific error text, stack frames). Copilot's prompt cache works on prefix matching - if the first ~60% of your prompt changes every run, nothing gets cached.

**What a low score means in practice:** you're paying full input token cost on every request even for repetitive work. Restructuring puts stable content first and saves cost over time on repeated tasks.

**The habit:** put the fixed context (file, task, constraints) at the top of your prompt. Put the volatile details (specific error, current diff, run output) at the bottom as a `Focus:` or `Error:` slot. The optimizer does this automatically - a low score means the raw prompt you entered had the structure reversed.

---

## Prompt warnings

| Warning | What it means | What to do |
|---|---|---|
| Secret redacted | A high-confidence secret pattern was found and replaced | Check the result doc - the original file is unchanged |
| Vague referent | `"fix it"` with no file | Add a file path or selection |
| Compound task | `"fix X and also add Y"` | Split into two prompts |
| Broad scope | `@workspace` with no target file | Name the file instead |
| Instruction-like selection | Selection looks like repo instructions | Run `compress.js --mode instructions` on it first |
| Repeated verbosity controls | `"be concise"` in every prompt | Move it to `.github/copilot-instructions.md` |
| Low prompt reuse score | Volatile content is at the top of the prompt | Put stable context first, volatile details last |

---

## Local stats only

All stats are stored in VS Code global state on your machine. Nothing is sent externally. Reset with **CE: Reset Local Stats** at any time.

When prompt patterns repeat, the stats document now includes a `Top Recurring Skeletons` section so you can see which reusable prompt shapes are showing up most often.

---

## Context readiness

**CE: Check Context Readiness** is a lightweight workspace audit, not a session-log analytics system. It checks the high-value repo surfaces that most directly influence Copilot quality in this kit:

1. `.github/copilot-instructions.md`
2. `.github/instructions/*.instructions.md`
3. `AGENTS.md`
4. `.github/copilot-content-exclusion.yml`
5. `.copilotignore`
6. `.vscode/mcp.json` or `.vscode/mcp.jsonc`
7. `.devcontainer/devcontainer.json`
8. Freshness of the context files above

The report gives each workspace a simple readiness score and a short action list. It does not inspect chat logs, prompt history, or model usage.

The MCP portion now looks for quality signals, not just file presence:

1. Whether an MCP config file exists
2. Whether active servers declare `allowed_tools`
3. Whether active servers declare `defer_loading`

The report also includes a small coaching snapshot from the extension's existing local stats, including repeated prompt skeletons and warning-family counts such as volatile-context and MCP warnings.

Below the coaching totals, the report now shows a short `Top Recurring Skeletons` subsection so you can spot repeated prompt patterns that may deserve a reusable instruction, template, or workflow-specific prompt shape.
