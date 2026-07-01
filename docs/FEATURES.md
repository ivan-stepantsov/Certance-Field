# Certance Token Kit - Feature Catalogue

A presenter's reference for demos, business reviews, and security walkthroughs.
Every feature has a **what** and a **why it matters** (the business angle).

_Current version: **0.2.64** · 13 palette commands · 2 chat participants · 6 slash commands · 1 agent tool · 7 settings · CLI + governance assets._

---

## The one-line pitch

A **local-first** GitHub Copilot **token-efficiency and guardrail kit**: it cuts token/credit spend, stops secret leaks, and produces audit evidence - with **no cloud dependency, no external calls, and nothing sent anywhere**.

## Lead with these four (the headline talking points)

1. **Cuts the token bill at the source** - compression + output discipline + model routing, the exact levers June/July-2026 research flags as highest-impact under Copilot's usage-based billing.
2. **Defence-in-depth secret protection** - redaction in prompts, a risk-aware repo scan, and a pre-commit hook that blocks a leak before it reaches the repo.
3. **Turns "trust us" into evidence** - an audit pack: tokens -> estimated **cost saved**, redaction counts, and an **enforced-vs-advisory governance matrix** a bank's risk team can read.
4. **Built to pass a regulated review** - local-first, deterministic, honest framing (advisory, best-effort, estimates labelled as estimates), and a hard **Transform-only lockdown** that removes every model-calling surface by policy.

---

## 1 · Token & cost savings - the ROI

- **Compression engine** - shrinks oversized context (long test output, big diffs, large JSON, heavily-commented code) before it reaches Copilot. Invoked via `@cetoken /compress`, the `#ceCompress` agent tool, or the `scripts/compress.js` CLI.
  *Why it matters:* this is the **repeatable** saving - the same noisy artifacts get sent to Copilot every day; compressing them is money back on every request.
- **`@cetoken /focus` - focused context pack** - auto-detects the artifact (test failure / stack / diff / JSON / code) and **extracts only the decisive lines** into labelled sections.
  *Why it matters:* fewer tokens **and better answers** - research (Lost-in-the-Middle / Context Rot) shows focused context improves quality, so this is reliability *and* cost.
- **`/outline`** - keeps a big file's imports, types, and signatures; drops the bodies (often 70-90% smaller).
  *Why it matters:* gives Copilot structural context about a large file for a fraction of the tokens.
- **Output discipline** - `@cetoken-concise` (opt-in terse answers) and the always-on `lean-output.instructions.md`.
  *Why it matters:* targets the **expensive side** - output tokens cost ~5x input; verbose, over-built answers quietly burn the most credit.
- **Prompt optimizer** - a CLI/command pipeline that tightens loose prompts (strips conversational filler, extracts constraints, redacts secrets) and scores cacheability, flagging volatile run details (IDs, timestamps) to move to the end so the stable prefix stays reusable.
  *Why it matters:* structure + cache-friendly prompt shape; a lighter, situational lever on top of compression.
- **Live status-bar savings counter** - net tokens saved, always visible.
  *Why it matters:* makes the value tangible to each engineer, every day.

## 2 · Cost visibility & model economics

- **`CE: Recommend a Model for This Task`** - classifies the task (economy / standard / premium) and gives a **cost-posture routing**: *local-transform* (may need no model call at all), *completion/base*, *Auto* (with the eligible-plan discount), *premium-justified*, or *batch/offline*.
  *Why it matters:* under AI-credit billing, **model choice is a multiplier on the whole request - the single biggest cost dial.** This is the lever most teams don't manage.
- **Cost framing in dollars** - set `ceTokenKit.costPerMillionTokensUSD` and the audit pack converts tokens saved into **estimated $ saved**.
  *Why it matters:* managers believe a bill, not a token count. Speaks credits/$, honestly labelled as an estimate.

## 3 · Secret protection - security (defence in depth)

- **Runtime redaction** - high-confidence secrets are masked **before anything is displayed or sent**, on every surface (commands, chat, agent-tool output).
  *Why it matters:* the model never receives a raw secret - the primary leak path is closed by default.
- **`CE: Redact Clipboard`** - scrubs secrets from the clipboard in place before a manual paste.
  *Why it matters:* covers the "paste straight into Chat" path the participant can't intercept.
- **`CE: Scan Workspace for Secrets`** - **risk-aware** scan over the files Git can commit; a gitignored `.env` is *correctly left alone*; findings are ranked 🔴 tracked vs 🟠 not-yet-committed and shown as `file:line + type`, never the value.
  *Why it matters:* catches secrets that can actually leave the machine, without the false-positive noise that makes scanners get ignored.
- **`CE: Install Pre-commit Secret Scan`** - a self-contained hook that scans **staged** content and **blocks the commit** if a secret is detected.
  *Why it matters:* stops a leak **before it reaches the repo** - the upstream control content-exclusion can't provide.
- **Org-custom patterns** - `ceTokenKit.secretPatterns` adds a team's own token shapes to every redaction/scan surface (incl. the generated hook).
  *Why it matters:* a bank can catch its internal credential formats without forking the extension.

## 4 · Governance & compliance - the regulated story

- **`CE: Export Audit Evidence`** - a per-developer pack (markdown + `ce-audit-evidence.json`): tokens -> cost saved, redaction counts, context-readiness, MCP summary, and an **enforced-vs-advisory governance matrix** + posture checklist. Local-only; no content stored.
  *Why it matters:* the artifact a risk/security team reads - turns the whole kit into defensible numbers.
- **Enforced-vs-advisory boundaries** - the audit pack and `docs/audit/DATA-FLOW.md` state exactly which controls are **platform-enforced** vs **behavioural/advisory** (e.g. content exclusion covers Chat/completions/review but **not** Edit/Agent/CLI).
  *Why it matters:* honesty about gaps is what earns trust in a regulated review - no overselling.
- **Content exclusion + `AGENTS.md`** - a version-controlled exclusion reference (applied via GitHub settings) plus a Layer-3 behavioural policy that closes the agent-mode gap.
  *Why it matters:* layered coverage across the surfaces Copilot actually uses.
- **`CE: Apply Guardrail Profile`** - one-command, **non-destructive** deploy of the instruction + exclusion assets (adds only what's missing, never overwrites), with an **advise-only MCP report** (connections never changed).
  *Why it matters:* safe, repeatable rollout across many repos.
- **`CE: Check Context Readiness`** - scores whether a workspace has the guardrail assets in place; auto-recomputes on save.
  *Why it matters:* a readiness signal for rollout governance.
- **Transform-only lockdown** - set `chat.answerMode`, `concise.enabled`, and `agentTool.enabled` all `false` -> **zero model-calling surfaces**.
  *Why it matters:* a policy switch that makes the kit fully local - decisive for the strictest environments.

## 5 · Measurement & evidence - proof for the review

- **Measurement pack** - before/after examples, a savings worksheet, and an evidence matrix (`measurement/`).
  *Why it matters:* lets a customer measure their **own** baseline instead of trusting a vendor number.
- **Concise quality gate** - the direct-answer eval now checks **task-completion**, not just length: a terse answer that drops a decisive concept (a safety caveat, the real fix, a required command) **fails**.
  *Why it matters:* proves the savings don't cost correctness or safety - the objection a reviewer will raise.
- **Tokenizer evals + UAT script** - a committed tokenizer-accuracy eval and a step-by-step UAT script (`docs/uat/`) covering every user feature.
  *Why it matters:* demonstrates the estimates are honest and the product is verifiable.

## 6 · Developer experience & adoption

- **`@cetoken` chat participant** - the fastest path: folds in the active file/selection, optimizes, redacts, and answers in the chat pane. **Transform mode** (default, no request spent) vs **Answer mode** (opt-in).
- **Slash commands** - `/compress`, `/focus`, `/outline`, `/review` (diff), `/debug` (stack trace), `/explain` (size-aware).
- **`#ceCompress` agent tool** - lets Copilot **agent mode** auto-compress large context (off by default).
- **13 command-palette commands**, **profiles** (installable bundles), and **two editions** (personal default + Certance branding) from one codebase.
  *Why it matters:* meets engineers where they already work - no new workflow to learn.

---

## What makes it defensible (positioning)

- **Local-first** - no network calls of its own, no runtime dependencies, no content persisted (only local token/command counts). The only egress is the two **opt-in** model paths, over Copilot's own API.
- **Deterministic** - regex/AST-style compression, not opaque AI summarization - inspectable and safe for regulated teams.
- **Honest by construction** - advisory (it never silently switches your model), best-effort (redaction/estimates are labelled as such), and explicit about what it does **not** cover.
- **Zero extra tokens** for the security/governance features - the scans, redaction, and audit are pure local regex.

---

## Appendix - full surface reference

| Surface | Items |
|---|---|
| **Palette commands (13)** | Optimize Prompt · Review Diff · Debug Stack Trace · Explain Selection · Check Context Readiness · Redact Clipboard · Apply Guardrail Profile · Export Audit Evidence · Scan Workspace for Secrets · Install Pre-commit Secret Scan · Recommend a Model for This Task · Show Local Stats · Reset Local Stats |
| **Chat participants (2)** | `@cetoken` (Transform/Answer) · `@cetoken-concise` (terse output) |
| **Slash commands (6)** | `/compress` · `/focus` · `/outline` · `/review` · `/debug` · `/explain` |
| **Agent tool (1)** | `#ceCompress` |
| **Settings (7)** | chat.answerMode · agentTool.enabled · concise.enabled · concise.level · concise.debugReferences · costPerMillionTokensUSD · secretPatterns |
| **CLI (2)** | `scripts/compress.js` · `scripts/optimize-prompt.js` |
| **Governance assets** | `AGENTS.md` · `.github/copilot-content-exclusion.yml` · `.github/instructions/lean-output.instructions.md` · `.github/copilot-instructions.md` · profiles · measurement pack · `docs/audit/` · `docs/uat/` |
