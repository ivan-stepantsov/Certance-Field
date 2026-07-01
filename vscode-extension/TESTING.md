# Certance Token Kit - Manual Smoke Test

A repeatable acceptance pass for the VS Code extension.

The `@cetoken` chat participant and the `#ceCompress` Language Model tool only run
inside a live VS Code + GitHub Copilot Chat session, so these checks **cannot be
automated in CI** (CI covers the engine and handlers with mocked APIs). Run this
checklist after each VSIX release, or with F5 against source.

## Prerequisites

- VS Code ≥ 1.100
- GitHub Copilot + Copilot Chat installed and signed in
- Any previous build removed first (the publisher id changed from `ce-advisory`
  to `ivan-stepantsov`, so an old build is a *different* extension):
  ```bash
  code --uninstall-extension ce-advisory.ce-token-kit
  code --uninstall-extension ivan-stepantsov.ce-token-kit
  ```

## Install the build under test

```bash
code --install-extension vscode-extension/ce-token-kit-<version>.vsix --force
```

Then `Cmd+Shift+P` -> **Developer: Reload Window**. Confirm exactly one is present
(run this line on its own - don't paste any trailing `#` comment):

```bash
code --list-extensions --show-versions | grep ce-token-kit
```

(For iterating on source instead: open the `vscode-extension/` folder and press
**F5** - test in the spawned `[Extension Development Host]` window. Don't run both
an installed copy and F5 at once.)

## Test fixtures

The scenarios below use ready-made synthetic files in the **gitignored**
`test-fixtures/` directory (local only - the credentials fixtures contain
fake-but-pattern-matching secrets that must not be committed). Each fixture has a
verified expected result. If the directory is missing, any real file of the same
shape works; `test-fixtures/README.md` lists what each one is for.

> **Mental model:** `@cetoken` does **not** do engineering work. It *shrinks and
> cleans* what you send; your normal Copilot/agent does the fixing. The value is
> in the slash commands (`/compress`, `/outline`, `/review`, `/debug`,
> `/explain`); bare `@cetoken <prompt>` only tightens the prompt text.

---

## Checklist

Record version, date, and pass/fail per item. To run a scenario: open the
fixture, **`Cmd+A`** (select all), then type the command in the Copilot Chat box.

### Load
- [ ] Status bar shows `$(graph) CE: 0t saved`
- [ ] Typing `@` in the Copilot Chat box lists **cetoken**

### `/outline` - big file -> API skeleton
- [ ] `test-fixtures/large-service.ts` -> `@cetoken /outline`
  -> imports, types, and **signatures kept**, function bodies collapse to `{ /* ... */ }`; ~50% smaller. **No stray `}` lines.** (Use `/outline`, not `/compress` - the file has `throw new Error(...)` and would auto-detect as a stack trace.)

### `/review` - real diff compression
- [ ] `test-fixtures/changes.diff` -> `@cetoken /review`
  -> shows the **actual changed lines** (`-if (user.password...` / `+if (await bcrypt.compare...`), drops unchanged context, and collapses `package-lock.json` to `(package-lock.json: N changed line(s) omitted...)`. **Not** a `files=N, hunks=M` stats line.

### `/compress` and `/debug` - test output & stack traces
- [ ] `test-fixtures/playwright-failure.log` -> `@cetoken /compress`
  -> keeps both failures' `Expected`/`Received` + the `> NN |` code frames, **drops the 60 passing `✓` tests**, dedups repeated lines; `node_modules`/`node:internal` frames stripped. ~50% smaller.
- [ ] `/debug` on the same selection -> framed "root cause then smallest fix" prompt around the compressed trace.

### `/explain` (size-aware)
- [ ] **Small selection** - select one method from `large-service.ts` (e.g. the `charge` method), `@cetoken /explain` -> compressed code framed with **"Explain this concisely - what it does and why."** No outline note.
- [ ] **Large selection** - `Cmd+A` on all of `large-service.ts` (≥ ~500 tokens), `@cetoken /explain` -> the **outline** (signatures only, bodies dropped) framed with **"Explain what this code does - its responsibilities, the main pieces, and how they fit together."** plus the `_Large selection - explained from its outline_` note. This is the "understand an unfamiliar file cheaply" path.

### `@cetoken-concise` (concise mode)
- [ ] **Terseness:** `@cetoken-concise why is playwright better than selenium?` -> `_Concise mode (full) - answering tersely..._`, then a **short, dense** answer (no preamble, fragments/bullets). Compare its length to the same question via plain Copilot Chat - the concise one should be visibly terser. This is the **output-token** lever.
- [ ] **Selection is the switch:** with a file open but **nothing selected**, ask a general question -> **no** `_Folded in..._` note; the open file is *not* pulled in. Then **select** a function and ask about it -> `_Folded in your selection (N chars) - ... deselect ..._` note appears and the answer addresses the selected code. Deselect (click / arrow-key) and re-ask -> context dropped again.
- [ ] **Attachments:** with nothing selected, attach `#file` / `#selection` and ask -> `_Folded in your attached `#` context_`.
- [ ] **Levels:** set `ceTokenKit.concise.level` to `ultra` -> footer shows `(ultra)`; answers get terser. Code, identifiers, and error strings stay verbatim and in fenced blocks at every level.
- [ ] **Policy lockdown:** set `ceTokenKit.concise.enabled` to `false`, reload -> `@cetoken-concise` no longer resolves (participant un-registered). Confirms the Transform-only kill switch.

### Secret redaction - the two-layer defense
- [ ] **Layer 2 (mask + warn):** `test-fixtures/config-with-secrets.ts` -> `@cetoken /compress`
  -> output shows `⚠ Redacted 7 high-confidence secret value(s)`; every token (`ghp_...`, `sk-proj-...`, `AKIA...`, `sk_live_...`, the DB URL, the JWT) is replaced with `[REDACTED_...]`. **No real value appears.**
- [ ] **Layer 1 (compression strips):** `test-fixtures/server-with-secrets.log` -> `@cetoken /compress`
  -> the secret config lines are **gone** (compression dropped them as noise); no warning, because nothing reached the redactor. Verify no secret value is present.

### Chat references (attached context)
- [ ] **Without** highlighting anything, attach a fixture with `#file` in the chat box, then `@cetoken /compress` -> compresses the **attached** content (does not show the no-selection hint).

### Recurring-prompt nudge
- [ ] Send the **same shape** of prompt 3x (e.g. `@cetoken fix the login bug`, then `@cetoken fix the signup bug`, then `@cetoken fix the logout bug`) -> on the 3rd, a `💡 You've sent this kind of prompt 3x ...` nudge appears suggesting `.github/copilot-instructions.md`.

### `/compress` on JSON
- [ ] `test-fixtures/api-response.json` -> `@cetoken /compress` -> null/empty fields dropped, large array truncated, minified; token delta shown.

### Answer mode (the only model-calling feature)
- [ ] Turn on `ceTokenKit.chat.answerMode` -> `@cetoken explain what OrderService.charge does` -> a one-time "wants to access the language models" consent prompt, then a **streamed model answer** in-pane (consumes a Copilot request). Turn the setting back off to stay fully local.

### Agent tool - `#ceCompress`
- [ ] With `ceTokenKit.agentTool.enabled` **off** (default) -> the tool is **absent** from the agent **Configure Tools** picker.
- [ ] Turn it **on** -> `CE: Compress context` appears in the picker and is tickable.
- [ ] In agent mode, `#ceCompress` on a big payload -> returns `Compressed <kind>: N -> M tokens`.

### Stats
- [ ] **CE: Show Local Stats** lists the per-command run counts (`@cetoken /outline`, `/compress`, ..., `#ceCompress`) and, once a prompt shape recurs, a "promote these recurring prompts" line.
- [ ] The status-bar token total increments after runs.

---

## After the run

- Note any **before/after token numbers** worth keeping - they feed the
  `measurement/` evidence pack and the "prove one number" story.
- File any failures with the chat output or a screenshot; live-only issues
  (registration, message/result format, rendering) are exactly what this pass
  exists to catch.
