# Certance Token Kit - Setup Guide

Use this guide if you want the shortest correct install path.

## Install in 5 steps

1. Choose a profile from `profiles/`.
2. Copy the profile files into the target repo.
3. Apply GitHub Copilot content exclusions.
4. Keep the default repository instruction file active.
5. Verify the repo with `npm run validate` and `npm run validate:direct-answers`.


This kit is split into two layers:

1. A reusable repository-level core for any GitHub Copilot project.
2. An optional internal Certance QE overlay plus organization rollout assets.

## Source of truth

Your local clone of this kit is the canonical Token Kit source. Shippable instructions, measurement assets, scripts, profiles, and extension code should be edited here first.

Consumer repositories may install copied or adapted kit files, but those copies are not the master version. If you also have a nested `certance-token-kit/` folder inside another repository, treat it as a temporary consumer copy and not as the place for ongoing kit development.

Every file here is plain text, Markdown, JSON, or a small local Node.js script. The runtime helper has no external runtime dependencies. Local dev dependencies are only needed for package typechecking.

## What to install first

For most teams, this is the right order:

1. `profiles/core.manifest.json`

---

## Package layout

| Path | Purpose | Use when |
|---|---|---|
| `.github/copilot-content-exclusion.yml` | **Layer 1** - canonical exclusion patterns for GitHub UI / REST API | Always. This is the primary enforcement mechanism. |
| `.copilotignore` | **Layer 2** - version-controlled convention; pairs with agent hooks | You want exclusions visible in code review and aligned with AGENTS.md |
| `AGENTS.md` | **Layer 3** - behavioral instructions for Agent Mode and Cloud Agents | You use Agent Mode, Copilot CLI, or Cloud Agents (exclusions don't apply there by default) |
| `.github/copilot-instructions.md` | Short repository-wide starter instructions | You need a compact default prompt layer |
| `.vscode/settings.json` | VS Code language-level Copilot and search defaults | Your team uses VS Code |
| `playbook.md` | Engineer behavior guide | You want immediate usage discipline without tooling |
| `measurement/` | Evidence pack for before-and-after validation | You want defensible internal claims and rollout proof |
| `profiles/` | Install manifests for reusable bundles | You want a repeatable copy plan across repositories |
| `scripts/compress.js` | Local pre-paste compression helper | You want to shrink JSON, code, or test output before sending to Chat |
| `scripts/optimize-prompt.js` | Local prompt-tightening helper with runtime high-confidence secret redaction | You want a lower-noise Copilot prompt before sending it |
| `vscode-extension/` | VS Code extension scaffold for stage-1 local optimization | You want command-driven prompt optimization, selection optimization, and local token stats |

Runtime secret redaction defaults to `redact` mode in both local CLIs. High-confidence secret patterns are masked before optimized or compressed output is emitted to stdout or clipboard-oriented workflows.
Covered classes include common API keys and tokens (GitHub, OpenAI/Anthropic, Slack, npm, Stripe), Azure and GCP secret-bearing fields, auth headers, JWTs, private key blocks, and credential-bearing database URIs.
For dotenv payloads (`.env` and `.env.*`, or dotenv-shaped input), the sanitizer applies dedicated full-value assignment redaction and keeps key names, comments, and blank lines.

---

## Step 1 - Install the generic core

Deploy the core files into the target repository. The fastest, non-destructive path is the **CE: Apply Guardrail Profile** command (`Cmd+Shift+P`), which adds only what's missing and reports content-exclusion + MCP advice. To copy them manually:

```bash
cp /path/to/certance-token-kit/AGENTS.md .
cp /path/to/certance-token-kit/.github/copilot-instructions.md .github/
mkdir -p .github/instructions
cp /path/to/certance-token-kit/.github/instructions/lean-output.instructions.md .github/instructions/
cp /path/to/certance-token-kit/.github/copilot-content-exclusion.yml .github/
```

MCP is advisory in this kit. If you keep a `.vscode/mcp.json`, review it and remove any tools the repository does not use (`profiles/mcp-minimal-tools.jsonc` is a minimal reference) - the kit never edits your MCP connections.

If the target repo does not use VS Code, skip `.vscode/settings.json` and use the IntelliJ guidance in `playbook.md` plus the rollout checklist in `org/`.

Minimum practical install:

1. `.github/copilot-instructions.md`
2. `.github/copilot-content-exclusion.yml`
3. `.github/instructions/lean-output.instructions.md`
4. `AGENTS.md`
5. `.vscode/settings.json` if the team uses VS Code
6. `.vscode/mcp.json` if the team uses MCP-enabled workflows

> `.copilotignore` is **not** in this list: GitHub Copilot does not read it natively (see Step 1a). Some teams still add it as a version-controlled *convention* for visibility - that's optional and never a substitute for the GitHub settings step below.

---

## Step 1a - Apply content exclusions through GitHub (required for enforcement)

**The `.copilotignore` file alone does not enforce exclusions.** It is a version-controlled convention - GitHub Copilot does not read it natively for IDE completions, Chat, or code review. The authoritative exclusion mechanism requires a one-time admin action in GitHub settings.

### How content exclusion actually works

GitHub Copilot content exclusion is configured through the GitHub web UI or REST API, not through a file in the repository. It is a first-class platform feature available on Copilot Business and Enterprise plans.

**What it covers:** IDE completions, Copilot Chat in IDEs, code review, and Copilot on GitHub.com.

**What it does not cover:** Agent Mode in IDEs, Copilot CLI, and Cloud Agents. These require Layer 3 (`AGENTS.md`) described below.

### Option A - GitHub UI (manual, per repository)

1. Go to the repository on GitHub.
2. Click **Settings > Copilot > Content exclusion**.
3. Paste the patterns from the repository-level section in `.github/copilot-content-exclusion.yml`.
4. Save. Changes propagate to IDEs within 30 minutes.

### Option B - GitHub UI (organisation-wide, recommended for teams)

1. Go to the organisation on GitHub.
2. Click **Settings > Copilot > Content exclusion**.
3. Paste the organisation-level YAML block from `.github/copilot-content-exclusion.yml`.
4. Save. Rules apply to all repositories in the organisation.

Requires: org owner access, Copilot Business or Enterprise plan.

### Option C - REST API (automatable, recommended for enterprise at scale)

The Content Exclusion REST API entered public preview in February 2026. Use it to manage exclusions programmatically across many repositories or as part of a repository provisioning pipeline.

```bash
# Set organisation-level exclusions
curl -X PUT https://api.github.com/orgs/YOUR-ORG/copilot/content_exclusion \
  -H "Authorization: Bearer YOUR-TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  -d '{
    "*": [
      "**/.env", "**/.env.*", "**/secrets/**", "**/node_modules/**",
      "**/dist/**", "**/build/**", "**/playwright-report/**",
      "**/test-results/**", "**/allure-results/**", "**/allure-report/**",
      "**/screenshots/**", "**/videos/**", "**/traces/**",
      "**/package-lock.json", "**/yarn.lock", "**/pnpm-lock.yaml",
      "**/*.log", "**/logs/**", "**/__snapshots__/**", "**/*.snap",
      "**/test-data/**", "**/fixtures/data/**", "**/*.csv"
    ]
  }'
```

Required scopes: `admin:enterprise` or `copilot`. The API accepts JSON only - the YAML comments in `.github/copilot-content-exclusion.yml` are for human readability and are stripped when submitted via the API.

API reference: [REST API endpoints for Copilot content exclusion management](https://docs.github.com/en/enterprise-cloud@latest/rest/copilot/copilot-content-exclusion-management)

---

## Step 1b - Protect Agent Mode and Cloud Agents (Layer 3)

GitHub's standard content exclusion does not apply to Agent Mode in IDEs, Copilot CLI, or Cloud Agents. This is a documented architectural limitation - agents run in isolated execution environments that do not inherit repository exclusion filters.

The `AGENTS.md` file committed in Step 1 addresses this gap. Copilot Cloud Agents and Agent Mode read this file before executing tasks and follow its exclusion rules as behavioral instructions. The rules include:

- Do not read, search, or reference files matching the excluded patterns.
- Do not attempt indirect access through shell commands or alternative tools.
- Do not suggest bypasses. Explain the restriction and continue.

These rules apply even if the user explicitly asks the agent to access an excluded file.

Keep `AGENTS.md` in sync with `.github/copilot-content-exclusion.yml` and `.copilotignore` whenever exclusion patterns are updated.

---

## Step 1c - Protect the exclusion configuration itself (Layer 4)

For enterprise deployments, prevent engineers from accidentally or deliberately weakening exclusion policy by adding a `CODEOWNERS` entry that requires a security or platform team review on changes to these files:

```
# Require security/platform review for all content exclusion configuration
.copilotignore                              @your-org/platform-security
AGENTS.md                                   @your-org/platform-security
.github/copilot-content-exclusion.yml       @your-org/platform-security
```

Pair this with a branch protection rule requiring `CODEOWNERS` approval on the default branch. This prevents the exclusion layer from being eroded through unreviewed pull requests.

Reference: [Copilot Content Exclusions: Four Layers of Defense (Anton Sizikov, March 2026)](https://blog.cloud-eng.nl/2026/03/13/copilot-content-exclusions-four-layers/)

---

## Step 2 - Customize the repository instructions

Open `.github/copilot-instructions.md` and replace the placeholder sections:

1. Repository summary
2. Folder structure
3. Build and validation commands
4. Stack-specific rules that truly apply to most requests

Keep repository-wide instructions short and broadly applicable. GitHub now supports path-specific instruction files in `.github/instructions/`, so do not overload the repository-wide file with details that only matter for one part of the tree.

Practical rule:

1. Put global facts in `.github/copilot-instructions.md`.
2. Put narrow rules in `.github/instructions/*.instructions.md`.
3. Keep both concise enough that engineers can still reason about what is being injected into every request.

### Step 2a - Add a reliability-first communication style block

If you want lower output-token usage without turning responses into fragments everywhere, add a short communication-style section to `.github/copilot-instructions.md`.

Recommended default:

1. Lead with the answer.
2. Skip affirmations, filler, and trailing recap.
3. Keep technical terms, commands, paths, errors, and constraints exact.
4. Expand to normal prose for security warnings, destructive actions, multi-step procedures, ambiguous explanations, or when the user asks for depth.

This keeps the model more direct without trading away trust.

Current recommended default:

1. Keep the repo-default direct-answer style on.
2. Do not repeat `Answer concisely.` in every prompt.
3. Use one-off shaping only for specific outputs such as `code only`, `3 bullets`, or `top risk first`.

---

## Step 4 - Roll out at team level

When this is more than a single-repo cleanup, define team-level rollout:

1. Implementation order - which repos adopt first, and in what sequence.
2. Team rules, budget controls, and review cadence.

This is the point where you decide which practices are mandatory and which stay advisory.

Optional companion layer:

AI Engineering Coach can sit beside this kit as a retrospective analytics tool when policy allows it. The Token Kit remains the preventive, local-first layer for prompt shaping, context control, MCP minimization, and lightweight readiness checks. Use AI Engineering Coach only when a team explicitly wants session-log analytics, trend reporting, or post-hoc coaching and has approved the data handling, retention, and rollout controls for that extra layer.

### Step 4b - Add policy controls for Memory and sandboxes

Before broader agentic rollout in regulated environments, define these controls explicitly:

1. Copilot Memory policy by business unit: enabled or disabled, owner, and allowed usage.
2. Sandbox policy for agent workflows: local-first default, approved cloud usage, and restricted data classes.
3. Budget controls: user/team limits and overage notification workflow.
4. Review-path controls: when local diff preflight is required before paid Copilot code review.

Document these decisions in your team's operating model and gate rollout accordingly.

---

## Step 4a - Use install manifests for repeatability

The `profiles/` folder defines the package as named bundles instead of a one-off file list:

1. `profiles/core.manifest.json` for the generic repository starter

Use these manifests as the source of truth when copying the kit into another repository or when turning this into a template later.

---

## Step 5 - Use the compression helper selectively

The local compression script is most useful before pasting large inputs into Copilot Chat.

Examples:

```bash
node scripts/compress.js package.json --mode json
node scripts/compress.js pages/LoginPage.ts --mode code
node scripts/compress.js failing-output.txt --mode output
node scripts/compress.js .github/copilot-instructions.md --mode instructions
```

Use it for:

1. Large JSON blobs
2. Long test output
3. Big code files when you only need the structural signal
4. Long instruction or markdown files that will be loaded repeatedly by Copilot

Do not use it blindly. If the original detail matters to the task, keep the original.

For instruction files, use `--copy` first and review the result before overwriting the source. The goal is to remove filler, not to remove policy meaning.

## Step 5a - Tighten prompts before sending them

Use `scripts/optimize-prompt.js` (or the VS Code **CE: Optimize Prompt** command) to turn a raw request into a tighter, structured prompt. The optimizer runs a five-stage heuristic pipeline - no LLM call, no external service, deterministic output.

```bash
node scripts/optimize-prompt.js "fix the failing test" --file tests/auth.spec.ts --error "Expected visible, received hidden"
node scripts/optimize-prompt.js "please fixing the login flow, don't change the API" --file src/pages/LoginPage.ts
printf "review this diff" | node scripts/optimize-prompt.js --file src/app.ts --output "List the top 3 risks first."
node scripts/optimize-prompt.js "fix the auth test. Don't add dependencies." --xml
```

## Short usage guidance for engineers

After install, engineers should not need to reread this whole file.

The practical defaults are:

1. Keep prompts scoped to one file, error, or diff.
2. Let the repo instruction file handle directness.
3. Use the extension or prompt optimizer before sending large prompts.
4. Start a new chat when the task changes.
5. Use explicit output shaping only when the task needs it.

---

### How the optimizer works - five-stage pipeline

Deterministic, heuristic-only (no LLM call). Each stage and its supporting research are documented in code comments; this is the summary.

| Stage | Function | What it does |
|---|---|---|
| **1. Normalize** | `normalizePrompt` | Strips polite prefixes and `I need to...` openers, rewrites gerund openers to imperative, removes hedge words (`maybe`, `ideally`, `try to`, `just`...), collapses sentences with ≥65% content-word overlap. |
| **2. Extract constraints** | `extractConstraints` | Lifts constraint clauses (sentence-form `. Don't add deps.` and clause-form `, but don't change the API`) into explicit `Constraint:` entries, wrapped in `<constraints>` under `--xml`. |
| **3. Annotate context** | `optimizePrompt` | Promotes inline file paths to a `File:` slot, derives a `[Framework]` tag from the file extension, and (under `--xml`) wraps each slot in named tags. |
| **4. Infer response shape** | `inferResponseShape` | Appends a compact format directive by intent - e.g. fix/refactor -> "minimal change, stop after the code block"; review -> "highest-risk findings first"; short scoped prompt -> "≤150 tokens". |
| **5. Generate warnings** | `buildWarnings` | Emits stderr warnings for vague referents, compound tasks (`and also`, `and then`), instruction-like selections, repeated verbosity controls, broad workspace scope, and context/intent mismatches. |

Techniques draw on LLMLingua-2, the Prompt Compression Survey (NAACL 2025), Anthropic's Claude prompting best practices (constraint/XML structuring, verbosity control), and Automatic Prompt Optimization. Neural methods (perplexity pruning, abstractive summarization, embedding dedup) are deliberately out of scope.

Action guidance:

1. If you see `Instruction-like selection detected`, run `node scripts/compress.js <file> --mode instructions --copy` or split repo-wide rules from path-specific rules.
2. If you see `Repeated verbosity controls detected`, move the stable default into `.github/copilot-instructions.md` and keep per-prompt shaping for exceptions only.

### Step 5b - MCP minimization and cache diagnostics checklist

Run this checklist before broad rollout. It turns warning signals into enforceable setup defaults.

| Check | Required action | Verification |
|---|---|---|
| MCP toolset minimization | Keep only required toolsets enabled by default. Use explicit allowlists where supported (`allowed_tools`). | Optimizer warnings do not repeatedly show `MCP/tool-bloat risk detected` during normal workflows. |
| Deferred loading | Enable deferred loading (`defer_loading`) for low-frequency tools when platform supports it. | Optimizer warnings for `Large MCP tool catalog detected without deferred loading` trend toward zero. |
| Cache-shape baseline | Use stable-prefix prompt structure for repeated workflows. Keep IDs/timestamps/log fragments in trailing `Error:`/`Details:` slots. | Prompt output shows higher cacheability score and fewer unstable-prefix warnings across reruns. |
| Routing policy fit | Classify workload lanes: sync for user-waiting tasks, batch for async jobs, flex for low-priority jobs where available. | Savings worksheet has non-empty routing fields and lane shares sum to 100%. |
| Compliance branch | For residency/retention-sensitive teams, document where batch/flex/caching are restricted. | Your team operating model documents approved lane policy by business unit. |

Implementation note:

1. Start with warning reduction goals, not perfect zero on day one.
2. Track warning counts in extension local stats weekly.
3. Update profile defaults only after two consecutive weeks of stable warning trends.

---

### CLI flag reference

| Flag | Type | Description |
|---|---|---|
| `--file <path>` | string | Attach a target file path. Enables lang tag injection and scoped token budget. |
| `--error <message>` | string | Attach an error or observed failure to the prompt. |
| `--selection <text>` | string | Pre-compressed context to attach as a `Focus:` slot. |
| `--output <instruction>` | string | Override the inferred response shape. |
| `--xml` | boolean | Emit XML-tagged output for Claude - recommended when the prompt will be sent to Claude rather than Copilot. |

Stats (before/after token counts and delta) always go to stderr; the optimized prompt goes to stdout, making the output pipeable:

```bash
node scripts/optimize-prompt.js "fix the test" --file src/auth.spec.ts | pbcopy
```

---

## VS Code guidance

The workspace `.vscode/settings.json` disables Copilot completions for low-signal file types (XML, YAML, TOML, properties, dotenv, log, CSV, diff, lock files) and configures search and file-tree exclusions for generated output. It applies to all engineers on the team when they open the workspace.

### Engineer personal setup - apply once, covers all projects

The workspace settings only apply in repos that have `.vscode/settings.json`. Engineers should also apply the personal user settings template so the same language toggles apply globally across every project they open - no admin access needed.

**Step:** Open VS Code -> `Cmd+Shift+P` -> **Open User Settings (JSON)** -> merge `profiles/vscode-user-settings.jsonc` into the file -> save.

The template is annotated with comments explaining each language ID and which ones depend on VS Code extensions being installed (e.g. `"dotenv"` requires the DotENV extension).

### What workspace settings do vs what they don't

| Setting | Effect |
|---|---|
| `github.copilot.enable` toggles | Suppresses IDE completions for listed language types |
| `files.exclude` | Hides build/test artifact folders from the VS Code Explorer |
| `search.exclude` | Excludes those folders from Ctrl+Shift+F workspace search |
| `renameSuggestions.triggerAutomatically: false` | Stops Copilot from auto-suggesting symbol renames on every edit |

None of these settings affect Copilot Chat context. For Chat, configure content exclusion in GitHub repository or organisation settings - see Step 1a above.

Recommended practice:

1. Disable Copilot completions for noisy formats such as lock files and logs.
2. Keep search exclusions aligned with `.github/copilot-content-exclusion.yml` where practical.
3. Prefer repository-wide plus path-specific instructions over repeating stack context in every chat.

---

## IntelliJ guidance

The most defensible IntelliJ efficiency control is folder exclusion. JetBrains documents that excluded folders are ignored by code completion, navigation, and inspections.

Recommended baseline:

1. Mark generated and artifact-heavy folders as excluded.
2. Use exclusion patterns for repeated noise where folder-by-folder exclusion is too coarse.
3. For content exclusion on JetBrains, use the same GitHub organisation/enterprise settings as VS Code - content exclusion is a server-side platform control, not an IDE-specific file. `.copilotignore` has no documented effect in JetBrains either.

---

## Evidence posture

This package no longer states fixed percentage savings as a universal guarantee. Savings vary by repository size, team behavior, model mix, and how often engineers send large contexts to Chat.

What is evidence-backed today:

1. Repository and path-specific instructions are first-class GitHub Copilot features.
2. Content exclusion via GitHub repository/organisation settings is a first-class feature on Copilot Business and Enterprise plans. The REST API for programmatic management entered public preview in February 2026. Reference: [GitHub Docs - Excluding content from GitHub Copilot](https://docs.github.com/en/copilot/how-tos/configure-content-exclusion/exclude-content-from-copilot).
3. Auto model selection is a current cost-control lever in GitHub Copilot.
4. VS Code supports language-level Copilot enablement settings.
5. IntelliJ excluded folders reduce IDE noise and indexing surface.
6. `AGENTS.md` is read by Copilot Cloud Agents and Agent Mode as behavioral instructions. It is the documented workaround for the gap where standard content exclusion does not apply to agentic workflows.

What is explicitly **not** a first-class platform feature:

- `.copilotignore` - GitHub Copilot does not read this file natively. It is a community convention with no official platform support as of June 2026. A community request has been open since January 2022 with no GitHub acknowledgement. Reference: [GitHub Community Discussion #10305](https://github.com/orgs/community/discussions/10305). Use Layer 1 (GitHub settings/API) for guaranteed exclusion.

What should be measured locally:

1. Net AI credit reduction after rollout
2. Impact of output filtering on average prompt size
3. Whether teams are actually replacing broad workspace queries with file-scoped prompts

Use the files in `measurement/` to capture these consistently.

---

## Recommended adoption order

1. Install the generic core.
2. Share `playbook.md` with the team.
3. Add the Certance QE overlay only for internal Certance Playwright repos.
4. Roll out org guidance if the team uses Copilot Business or Enterprise.
5. Capture one week of before-and-after usage examples before making stronger claims.
6. Use `profiles/` as the reusable distribution map for future repos.

---

## Questions

Contact: Ivan Stepantsov - Quality Engineering Team Lead, Certance Advisory
