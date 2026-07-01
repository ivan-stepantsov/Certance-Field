# Certance Token Kit - Quick Start

Five steps to get value in under 10 minutes. For the full reference, see [SETUP.md](SETUP.md).

---

## Step 1 - Install the VS Code extension

```bash
code --install-extension ce-token-kit-0.2.73.vsix
```

Restart VS Code. Look for `$(graph) CE: 0t saved` in the status bar - that's the extension running.

**First thing to try:** in the Copilot Chat box, select a long test failure or big diff and run `@cetoken /compress` - it shrinks the selection before it costs tokens (a 180-line failure becomes ~15). For a loosely-phrased prompt, `@cetoken fix the failing test` tightens it and folds in your active file.

**Situational extra:** **CE: Optimize Prompt** also scores cacheability and flags volatile run details (IDs, timestamps) to move to the end - useful for repeated work, though Copilot Chat exposes no cache-hit control to steer, so treat it as structure discipline rather than a guaranteed savings lever.

**Secret redaction runs automatically.** If your prompt or any pasted content contains an API token, JWT, private key, or auth header, the optimizer replaces the value with a labelled placeholder before writing to clipboard. The original file is not touched. You'll see a warning in the result document listing what was caught.

---

## Step 2 - Deploy the core files into your repository

**Easiest:** `Cmd+Shift+P` -> **CE: Apply Guardrail Profile** - adds the files below only if they're missing (never overwrites), and reports content-exclusion + MCP advice.

**Or copy them manually:**

```bash
cp <path-to-kit>/AGENTS.md .
cp <path-to-kit>/.github/copilot-instructions.md   .github/
mkdir -p .github/instructions
cp <path-to-kit>/.github/instructions/lean-output.instructions.md .github/instructions/
cp <path-to-kit>/.github/copilot-content-exclusion.yml .github/
```

These files are the minimum effective install. MCP is advisory - if you keep a `.vscode/mcp.json`, trim unused tools (`profiles/mcp-minimal-tools.jsonc` is a reference); the kit never edits your connections.

After copying `.vscode/mcp.json`, trim it to the smallest useful toolset for that repo. Keep allowlists and deferred loading on where supported.

---

## Step 3 - Apply personal VS Code settings (one-time, per engineer)

1. `Cmd+Shift+P` -> **Open User Settings (JSON)**
2. Merge `profiles/vscode-user-settings.jsonc` into the file
3. Save

This suppresses Copilot completions for lock files, logs, and generated output across all your projects - not just this repo.

---

## Step 4 - Set up content exclusion in GitHub

The `.copilotignore` file alone does not enforce exclusions. You need a one-time GitHub settings step.

1. Go to your repo on GitHub -> **Settings -> Copilot -> Content exclusion**
2. Paste the patterns from `.github/copilot-content-exclusion.yml`
3. Save - active in IDEs within 30 minutes

For organisation-wide setup: do the same at **Org Settings -> Copilot -> Content exclusion** and it applies to all repos.

---

## Step 5 - Share the playbook with your team

Send `playbook.md` to your team. It covers the highest-value habits - file-scoped prompts, filtered log pastes, fresh chats per task, output shaping - in plain language with no tooling prerequisite.

---

## Day-to-day: how to actually use it

Steps 1-5 are one-time setup. This is the everyday habit loop - in order of value.

> **The one habit that matters most: compress big context *before* it reaches the model.** That is where the repeatable savings are. Everything else is a smaller add-on.

| When you're about to... | Reach for | Why it helps |
|---|---|---|
| Paste a **long test failure, big diff, large JSON, or heavily-commented file** into chat | Select it, then **`@cetoken /compress`** (or **`/focus`** for just the decisive lines, **`/outline`** for a big file) | The #1 lever - a 180-line failure collapses to ~15; the model sees signal, not noise |
| **Ask a question** (no code change needed) | **`@cetoken-concise <question>`** | Answer-first, terse replies - cuts the expensive *output* side (~5x input). Stays full for false-premise / safety questions |
| **Review a diff, debug a trace, or explain code** | **`@cetoken /review`** · **`/debug`** · **`/explain`** | Compresses *and* frames each for the model, highest-risk first |
| **Paste anything that might hold a secret** | Nothing - **redaction runs automatically** before it leaves your machine (or **`CE: Redact Clipboard`** for arbitrary clipboard text) | Tokens, keys, JWTs, auth headers masked locally; the model never sees the value |
| **Not sure which model to pick** | **`CE: Recommend a Model for This Task`** | Model choice is the biggest cost dial - start cheap, escalate only if the answer misses |
| **Work in Copilot agent mode** | Turn on `ceTokenKit.agentTool.enabled`, then the agent auto-compresses via **`#ceCompress`** | Shrinks the large context the agent pulls in, without you asking |
| **Have a loosely-phrased prompt** | **`@cetoken <your prompt>`** (no slash) | Tightens it and folds in your active file/selection. Situational - modern models handle loose prompts fine |

**Two habits that need no tooling** (from `playbook.md`): start a **fresh chat per task** (avoid context rot), and **paste only the relevant lines** - a filtered log beats the whole file.

**Every so often, to prove and protect it:** **`CE: Check Context Readiness`** (score your repo's setup), **`CE: Scan Workspace for Secrets`** + **`CE: Install Pre-commit Secret Scan`** (stop leaks before they commit), **`CE: Export Audit Evidence`** (turn savings into numbers for a review), **`CE: Show Local Stats`** (see what you've saved).

---

## What to do next

| Goal | Where to look |
|---|---|
| Customize Copilot instructions for your repo | Edit `.github/copilot-instructions.md` - keep it short |
| Add path-specific rules | Create `.github/instructions/*.instructions.md` |
| Measure before/after savings | `measurement/savings-worksheet.md` |
| Validate direct-answer behavior | `measurement/direct-answer-validation.md` |

---

## Support

Contact: Ivan Stepantsov - Quality Engineering Team Lead, Certance Advisory
