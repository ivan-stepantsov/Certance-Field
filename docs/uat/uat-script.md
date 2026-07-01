# Certance Token Kit - UAT Script

Step-by-step user-acceptance tests for the VS Code extension. Each test has an
**ID** (map your test case to it), a **setup**, the exact **steps** a tester
performs, the **expected** observable result, and a **Result** line to mark.

**Coverage (v0.2.64):** all **13** command-palette commands, both chat participants + **6** slash commands (`/compress` `/focus` `/outline` `/review` `/debug` `/explain`), the `#ceCompress` agent tool, all **7** settings, and **5** cross-cutting behaviours - **47 test cases** across 10 sections (A-I + setup + sign-off).

| Section | Covers | IDs |
|---|---|---|
| 0 · Setup | install + sample repo | ENV-01..02 |
| A · Activation | status bar | ACT-01..02 |
| B · Token optimization | the optimize/compress/debug/explain/readiness commands | OPT-01..06 |
| C · Security & governance | redact, guardrail profile, audit evidence, secret scan + pre-commit, model advisor | SEC-01..06 |
| D · Stats | show / reset | STAT-01..02 |
| E · `@cetoken` | Transform/Answer + 6 slash commands | CHAT-01..08 |
| F · `@cetoken-concise` | terse output, context opt-in, levels, Phare guard, answer-first rail, lockdown | CONC-01..07 |
| G · `#ceCompress` | agent tool off/on | AGENT-01..02 |
| H · Settings | all 7 toggles | SET-01..07 |
| I · Cross-cutting | redaction everywhere, readiness-on-save, accounting, local-only, lockdown | XC-01..05 |

## How to use this script

- Work top to bottom; later sections assume the extension is installed (Section 0).
- "Toast" = the notification that appears bottom-right in VS Code.
- "Scratch file" = a new untitled editor (`Cmd+N`) that you do **not** save into the repo.
- **Fake secrets are given as recipes, never as literals** - type them into a
  *scratch* buffer. This is on purpose: a real-looking token written into this
  committed doc would be flagged by the kit's own scanner (SEC-04) and blocked by
  its pre-commit hook (SEC-05). If you edit this file, keep it that way.
- Mark each test: **☐ Pass ☐ Fail** and add notes.

---

## Section 0 - Environment setup

### ENV-01 - Install the extension
**Steps:**
1. In VS Code: Extensions -> `...` -> **Install from VSIX** -> pick `ce-token-kit-0.2.64.vsix`.
2. Reload / restart VS Code.

**Expected:** No error toast; the status bar shows `$(graph) CE: 0t saved`.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### ENV-02 - Prepare a sample repo
**Steps:**
1. Open a small Git project folder (or `git init` an empty one with a couple of files).
2. Confirm it has a `.github/` folder (create it if missing).

**Expected:** A folder is open; `git status` works in the integrated terminal.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

---

## Section A - Activation & status bar

### ACT-01 - Status bar shows on activation
Covered by ENV-01. Confirm `CE: 0t saved` is visible after a fresh reload.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### ACT-02 - Status bar accumulates savings
**Steps:** Run any optimizing command (e.g. OPT-01) once, then look at the status bar.
**Expected:** The number after `CE:` increases from `0t` and persists after a window reload.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

---

## Section B - Token-optimization commands

### OPT-01 - CE: Optimize Prompt
**Steps:**
1. `Cmd+Shift+P` -> **CE: Optimize Prompt**.
2. In the input box type: `please could you maybe help me fix the failing login test thanks so much`.
3. Press Enter.
4. Open a scratch file and paste (`Cmd+V`).

**Expected:**
- A markdown document opens showing **before -> after token counts** and the optimized prompt.
- Toast: `Prompt optimized and copied to clipboard: N->M tokens`.
- The paste is the optimized (tightened) prompt.
- Status bar savings increased.

**Result:** ☐ Pass ☐ Fail - Notes: ___________

### OPT-02 - CE: Optimize Prompt (cacheability guidance)
The cache-friendliness insight is **folded into Optimize Prompt** - there is no separate Cache-First command.
**Steps:**
1. `Cmd+Shift+P` -> **CE: Optimize Prompt**.
2. Enter: `refactor the auth module; today's run failed on case 7 at 14:32`.

**Expected:** the result doc has a **## Cacheability** section with a **Reuse score** and guidance to *move run-specific noise (IDs, timestamps) to the END*; a **"Volatile context detected"** warning appears (because of `today` / `case 7` / `14:32`).
**Contrast:** run it again with a clean prompt (`refactor the auth module to use async/await`) -> **Reuse score 100/100**, "stable prefix, no run-specific noise".
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### OPT-03 - CE: Review Diff
**Setup:** In the terminal run `git diff` on a changed file, copy the diff into a scratch file, and **select** it.
**Steps:**
1. With the diff selected, `Cmd+Shift+P` -> **CE: Review Diff**.

**Expected:** A markdown review opens (compressed diff, **highest-risk findings first**); result copied to clipboard; token-delta toast.
**Negative:** Run it with **nothing selected** -> warning toast `Open an editor and select some text first.` (or `Select some text to optimize.`).
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### OPT-04 - CE: Debug Stack Trace
**Setup:** Paste any real stack trace into a scratch file and **select** it.
**Steps:** `Cmd+Shift+P` -> **CE: Debug Stack Trace**.
**Expected:** Markdown framing that leads with **root cause**, then the **smallest fix**; clipboard + token delta.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### OPT-05 - CE: Explain Selection (size-aware)
**Steps:**
1. Open a **large** source file, Select All (`Cmd+A`), run **CE: Explain Selection**.
2. Then select just a **small** function and run it again.

**Expected:** For the large selection the output is an **outline** (signatures/types, bodies dropped) with a structural explanation ask; for the small one it **compresses + explains**. Both copy to clipboard.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### OPT-06 - CE: Check Context Readiness
**Steps:** `Cmd+Shift+P` -> **CE: Check Context Readiness**.
**Expected:** A readiness report opens; toast verdict - *all workspaces look ready* / *N incomplete* / *N need attention*.
**Negative:** With no folder open -> warning `Open a workspace folder before running Context Readiness.`
**Result:** ☐ Pass ☐ Fail - Notes: ___________

---

## Section C - Security & governance commands

### SEC-01 - CE: Redact Clipboard
**Steps:**
1. In a **scratch** file type a fake GitHub token: the prefix `ghp_` immediately followed by 36 letters (no spaces). Select it and copy (`Cmd+C`).
2. `Cmd+Shift+P` -> **CE: Redact Clipboard**.
3. Paste into a scratch file.

**Expected:**
- Warning toast: `Redacted 1 secret value(s) in the clipboard - safe to paste. (github-token)`.
- The paste shows `[REDACTED_GITHUB_TOKEN]` - the original token is gone.

**Variants:**
- Copy ordinary text, run -> info toast `No high-confidence secrets found`.
- Empty clipboard, run -> info toast `Clipboard is empty`.

**Result:** ☐ Pass ☐ Fail - Notes: ___________

### SEC-02 - CE: Apply Guardrail Profile (non-destructive)
**Steps:**
1. `Cmd+Shift+P` -> **CE: Apply Guardrail Profile**.
2. Note which files it reports as added.
3. **Run it a second time.**

**Expected:**
- First run: adds the missing assets (`lean-output.instructions.md`, `copilot-instructions.md`, content-exclusion reference) **only if absent**; a report opens with the content-exclusion checklist + an **MCP advisory**; toast `added N file(s); ...`.
- Second run: toast `all files already present` - **nothing overwritten** (idempotent).
- If you have a `.vscode/mcp.json`, confirm it is **unchanged**.

**Result:** ☐ Pass ☐ Fail - Notes: ___________

### SEC-03 - CE: Export Audit Evidence
**Steps:**
1. `Cmd+Shift+P` -> **CE: Export Audit Evidence**.
2. Open the new `ce-audit-evidence.json` at the repo root.
3. Set `ceTokenKit.costPerMillionTokensUSD` to e.g. `10` in Settings, then run the command again.

**Expected:**
- A markdown pack opens **and** `ce-audit-evidence.json` is written.
- Sections: token savings, secret redactions, a **Governance & enforcement boundaries** matrix (each control marked platform-enforced / behavioural-advisory / locally-enforced) with a **posture checklist** (content-exclusion present, `AGENTS.md` present, MCP checked, redactions this period), context readiness, content exclusion with its agent-mode caveat, MCP, activity.
- If you ran the model advisor (SEC-06) this session, a **Model cost posture** section also appears (recommendation count + how many were answerable locally).
- With the rate `0` (default): "set `ceTokenKit.costPerMillionTokensUSD`...". With rate `10`: an **estimated $ saved** appears.

**Result:** ☐ Pass ☐ Fail - Notes: ___________

### SEC-04 - CE: Scan Workspace for Secrets
**Setup:** In the repo, create `leak-test.txt` (a **tracked or untracked, NOT gitignored** file) and inside it type a fake AWS key: `AKIA` immediately followed by 16 uppercase letters/digits. Save it.
**Steps:**
1. `Cmd+Shift+P` -> **CE: Scan Workspace for Secrets**.

**Expected:**
- A report opens listing `leak-test.txt:<line>` with type `aws-access-key-id`, ranked 🟠 (untracked) or 🔴 (if you `git add`ed it). The **secret value is not shown**.
- Warning toast with the count.

**Risk-aware check (important):**
2. Add a `.env` file containing the same fake key, and add `.env` to `.gitignore`. Re-run the scan.
**Expected:** The gitignored `.env` is **not** flagged (only `leak-test.txt` is). Delete `leak-test.txt` and re-run -> report shows `✅ No secrets found`.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### SEC-05 - CE: Install Pre-commit Secret Scan (end-to-end)
**Steps:**
1. `Cmd+Shift+P` -> **CE: Install Pre-commit Secret Scan**.
2. Confirm a report opens and `.ce-token-kit/secret-scan-hook.cjs` exists; toast `installed`.
3. In a scratch file in the repo, type a fake GitHub token (`ghp_` + 36 letters), save it as `secret-demo.js`, then `git add secret-demo.js` and `git commit -m test` in the terminal.
4. Then retry with `git commit -m test --no-verify`.
5. Delete `secret-demo.js`. Put the same token in a gitignored file and try to commit something else.

**Expected:**
- Step 3 commit is **blocked**, printing `secret-demo.js:<line>  (github-token)` - no value shown.
- Step 4 commit **succeeds** (honest bypass).
- Step 5: the gitignored file does **not** block the commit (only staged content is scanned).

**Non-destructive check:** If you already had a `.git/hooks/pre-commit` you didn't create, confirm it was **not** overwritten and the report advised how to wire CE in instead.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### SEC-06 - CE: Recommend a Model for This Task
**Steps:**
1. `Cmd+Shift+P` -> **CE: Recommend a Model for This Task**.
2. Type: `rename a variable and tidy the imports`. Enter.
3. Run again, type: `debug a race condition in the auth refactor`. Enter.
4. Run again, type: `compress this large test output`. Enter.

**Expected:** each report shows a **tier** (economy / standard / premium) **and** a **Cost posture - how to route this** line:
- Step 2 -> **Economy** tier, routing **inline completion or a base model** (signals: rename, imports).
- Step 3 -> **Premium** tier, routing **premium model justified** (signals: refactor, debugging, race condition).
- Step 4 -> routing **local-transform - you may not need a model call at all** (points you to `@cetoken /compress`/`/focus`).
- Every report includes the "start cheap, escalate only if the answer misses" rule, links to GitHub's usage-based-billing docs, and states it's local / zero-token / advisory (it can't switch your model).

**Result:** ☐ Pass ☐ Fail - Notes: ___________

---

## Section D - Stats commands

### STAT-01 - CE: Show Local Stats
**Steps:** `Cmd+Shift+P` -> **CE: Show Local Stats**.
**Expected:** A markdown report opens with token savings, warning counts, prompt-reuse score, and per-command frequencies.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### STAT-02 - CE: Reset Local Stats
**Steps:** `Cmd+Shift+P` -> **CE: Reset Local Stats**.
**Expected:** Toast `Certance Token Kit local stats reset`; status bar returns to `CE: 0t saved`; readiness verdict is preserved.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

---

## Section E - `@cetoken` chat participant

### CHAT-01 - Transform mode (default)
**Setup:** Ensure `ceTokenKit.chat.answerMode` is **off** (default). Open a file; optionally select code.
**Steps:** In Copilot Chat type: `@cetoken fix the failing login test` and send.
**Expected:** It returns a **tightened prompt** (with your file/selection folded in) and a **token-delta** footer; **no** model answer is generated (no request spent); status bar updates.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CHAT-02 - Answer mode
**Steps:** Turn **on** `ceTokenKit.chat.answerMode`. Repeat CHAT-01.
**Expected:** It now **sends to your selected model and streams an answer** in-pane. The first time, VS Code shows a one-time "wants to access the language models" consent prompt.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CHAT-03 - /compress (always local)
**Setup:** Select a long block (e.g. a 100+ line test failure or big JSON).
**Steps:** In chat: `@cetoken /compress`.
**Expected:** Returns a compressed version (auto-detected kind) with before/after tokens; **never calls the model** even in Answer mode.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CHAT-04 - /outline
**Setup:** Select a large source file.
**Steps:** `@cetoken /outline`.
**Expected:** Output keeps imports/types/signatures and drops bodies (markedly smaller).
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CHAT-05 - /review
**Setup:** Select a diff. **Steps:** `@cetoken /review`.
**Expected:** Compressed diff framed with **highest-risk findings first**.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CHAT-06 - /debug
**Setup:** Select a stack trace. **Steps:** `@cetoken /debug`.
**Expected:** Framing leading with root cause, then smallest fix.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CHAT-07 - /explain
**Setup:** Select code. **Steps:** `@cetoken /explain`.
**Expected:** Outlines a large selection; compresses + explains a small one.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CHAT-08 - /focus (focused context pack)
**Setup:** Select a noisy artifact - a failing test output, a stack trace, or a diff.
**Steps:** In chat: `@cetoken /focus`.
**Expected:** Returns a **focused context pack** - it auto-detects the kind (test / stack / diff / JSON / code) and keeps only the **decisive lines** in labelled sections (e.g. the failing assertion + expected/actual, the top app frame, the changed hunks); passing-test noise, framework/`node_modules` frames, and lockfile churn are dropped. Shows a before/after token delta. Local utility - **never calls the model** (a smarter, auto-detecting take on `/review` + `/debug`).
**Result:** ☐ Pass ☐ Fail - Notes: ___________

---

## Section F - `@cetoken-concise` chat participant

### CONC-01 - Terse answer
**Steps:** In chat: `@cetoken-concise why might a login test be flaky?`
**Expected:** A short, dense answer (it **always** calls the model); a footer naming what context was folded in.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CONC-02 - Context is opt-in
**Steps:**
1. With **nothing** selected and a file merely **open**, ask a question -> confirm the open file is **not** referenced.
2. **Select** code, ask about it -> confirm the selection **is** used (named in the footer).
3. Attach a file with `#file:...`, ask -> confirm that file is used.

**Expected:** Only selection/attachment is folded in; a merely-open file is never pulled in.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CONC-03 - Intensity levels (lite / full; ultra retired)
**Steps:** Set `ceTokenKit.concise.level` to `lite`, ask a question; repeat with `full`; then set it to `ultra`.
**Expected:** `lite` is professional-but-tight (full sentences); `full` is terser (fragments, dropped articles). `ultra` is **retired** - it now runs exactly as `full`, and the footer reads **`Concise mode (ultra → full)`**. Code, identifiers, and error strings stay **verbatim** at every level; security/irreversible/ordered-step content stays in full prose.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CONC-04 - Policy off switch
**Steps:** Set `ceTokenKit.concise.enabled` to `false`, **reload the window**, type `@` in chat.
**Expected:** `@cetoken-concise` is **no longer offered** (this is the regulated lockdown for the concise surface).
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CONC-05 - Reference diagnostics
**Steps:** Set `ceTokenKit.concise.debugReferences` to `true`, ask a question with a `#file` attached.
**Expected:** The answer is prefaced with the raw `#`-reference diagnostic list.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CONC-06 - Brevity stands down on false-premise / risky questions (Phare guard)
**Steps:** Ask `@cetoken-concise` a **false-premise** question, e.g. `Isn't it true that JavaScript passes objects by value?` (also try `Are you sure HTTP is stateful by default?`, and a risky one like `Is it safe to force-push to main on prod?`).
**Expected:** The deterministic guard fires - the answer is **not** clipped to a terse one-liner. It **leads with the correction** ("No - JavaScript passes objects by reference…") and answers **completely**. Brevity is deliberately OFF here; a wrong-but-short answer is exactly what this prevents. (This is the ② Phare guard.)
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### CONC-07 - Answer-first shape, no boilerplate, no trailing offer
**Steps:** Ask a plain question, e.g. `@cetoken-concise what is database connection pooling?`
**Expected:** Leads with the answer (a soft "aim for ≤3 sentences" nudge - a hint, not an enforced cap); **no** preamble, **no** closing recap/summary, **no** disclaimers, and **no** trailing "want me to…?" / "let me know if…" offer. (This is the ② answer-first length hint + the ③ anti-boilerplate rail.)
**Result:** ☐ Pass ☐ Fail - Notes: ___________

---

## Section G - Agent tool `#ceCompress`

### AGENT-01 - Off by default
**Steps:** Ensure `ceTokenKit.agentTool.enabled` is `false`. Open agent mode -> **Configure Tools** (wrench).
**Expected:** `CE: Compress context` / `#ceCompress` is **not** offered.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### AGENT-02 - Enabled and firing
**Steps:**
1. Set `ceTokenKit.agentTool.enabled` to `true`.
2. In agent mode, give a task that pulls in a large file/diff/test output (or reference `#ceCompress` explicitly).

**Expected:** The agent can call the tool; a visible `Compressed <kind>: N -> M tokens` note appears; status-bar savings increase.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

---

## Section H - Settings (behavioral)

Most settings are exercised by the tests they affect; this section is the explicit toggle check.

| ID | Setting | How to verify | Result |
|---|---|---|---|
| SET-01 | `chat.answerMode` | CHAT-01 (off) vs CHAT-02 (on) | ☐ |
| SET-02 | `agentTool.enabled` | AGENT-01 (off) vs AGENT-02 (on) | ☐ |
| SET-03 | `concise.enabled` | CONC-04 (off, after reload) | ☐ |
| SET-04 | `concise.level` | CONC-03 (lite / full; ultra → full) | ☐ |
| SET-05 | `concise.debugReferences` | CONC-05 | ☐ |
| SET-06 | `costPerMillionTokensUSD` | SEC-03 (0 -> no $, 10 -> $ shown) | ☐ |
| SET-07 | `secretPatterns` | Add `{ "name": "CORP", "regex": "corp-[0-9]{6}" }`; in a scratch file type `corp-123456`, run **CE: Redact Clipboard** (after copying) -> masked as `[REDACTED_CORP]`. Re-run **Install Pre-commit Secret Scan** and confirm the generated hook also catches it. | ☐ |

---

## Section I - Cross-cutting behaviors

### XC-01 - Secrets are redacted on every surface
**Steps:** Repeat a redaction with a fake token (recipe as in SEC-01) through each surface: **CE: Optimize Prompt** (paste the token into the prompt), `@cetoken` (Answer mode), `@cetoken-concise`, and **CE: Redact Clipboard**.
**Expected:** In **every** case the raw token never appears in the output/answer; a `⚠ Redacted N...` receipt is shown **before** anything is displayed or sent.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### XC-02 - Readiness auto-recomputes on save
**Steps:** Edit and **save** `.github/copilot-instructions.md` (or `AGENTS.md`, or `.vscode/mcp.json`).
**Expected:** Readiness/status refreshes shortly after save (no manual command needed).
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### XC-03 - Status-bar accounting
**Steps:** Note the counter, run two optimizing actions, then run **CE: Reset Local Stats**.
**Expected:** Counter rises with each action, survives a reload, and returns to `0t` after reset.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### XC-04 - Local-only data flow
**Steps:** With Answer mode **off**, concise **off**, agent tool **off**, exercise OPT/SEC/STAT commands while watching for any network/consent prompt.
**Expected:** **No** "access the language models" consent prompt and no network activity - everything is local.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

### XC-05 - Transform-only lockdown
**Steps:** Set `chat.answerMode=false`, `concise.enabled=false`, `agentTool.enabled=false`, reload.
**Expected:** No model-calling surface remains: `@cetoken` only transforms, `@cetoken-concise` is gone, `#ceCompress` is not offered.
**Result:** ☐ Pass ☐ Fail - Notes: ___________

---

## Sign-off

| Tester | Date | Build (VSIX) | Overall result |
|---|---|---|---|
| | | `ce-token-kit-0.2.64.vsix` | ☐ Pass ☐ Pass-with-notes ☐ Fail |
