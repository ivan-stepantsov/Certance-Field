# Security & Data Flow - Certance Token Kit VS Code Extension

This document is written for security and compliance reviewers (e.g. for use in
regulated environments under DORA, FCA/PRA operational resilience, or similar).
It describes exactly what the extension does with your code, where data goes,
and how to verify each claim yourself.

**Bottom line:** the extension is local-first with **no network calls of its
own** and **no runtime dependencies**. The *only* paths that send anything off
the machine are the opt-in **Answer mode** and the opt-in **`@cetoken-concise`**
participant - both use GitHub Copilot's own Language Model API (the same channel
as using Copilot Chat directly) and only after redacting high-confidence
secrets. Both are opt-in, both surface VS Code's consent prompt, and both can be
**hard-disabled by policy** (see "Locking it down").

---

## Two modes, two data-flow profiles

| Feature | Calls a model? | Leaves the machine? | Consent prompt? |
|---|---|---|---|
| `@cetoken` **Transform mode** (default) | No | **No - fully local** | No |
| `/compress`, `/review`, `/debug`, `/explain` | No | **No - fully local** | No |
| Command-palette commands (`CE: ...`) | No | **No - fully local** | No |
| `@cetoken` **Answer mode** (`ceTokenKit.chat.answerMode`, opt-in) | Yes - Copilot LM API | Yes - the **redacted** prompt is sent to your Copilot model | Yes (one-time VS Code LM consent) |
| `@cetoken-concise` (opt-in **per message** - only when you `@`-mention it) | Yes - Copilot LM API | Yes - the **redacted** prompt + a terseness instruction is sent to your Copilot model | Yes (one-time VS Code LM consent) |
| `#ceCompress` **agent tool** (`ceTokenKit.agentTool.enabled`, opt-in) | The tool itself does **no** network I/O; it returns compressed text to the agent | The agent (Copilot) is already a model loop - the tool *reduces* what reaches the model | Governed by the agent session |

### The consent dialog you may have seen
> "The extension 'Certance Token Kit' wants to access the language models provided by GitHub Copilot Chat."

This is **VS Code's built-in Language Model consent prompt**. It appears the
first time the extension calls the Copilot model - i.e. only when **Answer mode
is enabled** or you **`@`-mention `@cetoken-concise`**. It will never appear in
Transform mode or for the slash commands. If your organisation disallows
third-party extensions from using the Copilot LM API, clicking Cancel (or
disabling these by policy) leaves the full Transform-mode feature set working
with **zero model access**.

### Answer mode data flow, precisely
In Answer mode the extension forwards content to Copilot's model - the **same
data path as an engineer using Copilot Chat directly**. So:

- If Copilot Chat is already sanctioned in your environment, Answer mode rides
  the same approved rails, with the bonus that **secrets are redacted before the
  prompt is sent** (see "Secret handling").
- If the Copilot LM API is locked down for third-party extensions (common in
  banks), Answer mode simply does not function - but **Transform mode still
  does, with no model access and no data egress.**

---

## Secret handling

Two independent layers protect against an accidentally-pasted secret, **before**
anything is displayed or sent:

1. **Compression strips it.** Most secrets sit on non-signal lines (an env dump,
   an `Authorization:` header). Those lines do not match the compressor's
   keep-patterns, so they are removed before redaction even runs.
2. **Redaction masks what survives.** Any high-confidence secret pattern on a
   kept line - provider token formats (GitHub, OpenAI/Anthropic, AWS, Google,
   GitLab, Slack, Stripe, npm, SendGrid, Twilio, Shopify, DigitalOcean, Square,
   Postman, Azure/GCP), JWTs, bearer tokens, private-key blocks, credential-bearing
   URIs, sensitive JSON fields - is replaced with a
   `[REDACTED_...]` placeholder **regardless of where it appears**. When this
   fires, the extension shows a visible `⚠ Redacted N high-confidence secret
   value(s)` warning on every command.

   **`.env` assignment scope (precise).** *Blanket* value-masking - replacing
   *every* `KEY=value` value irrespective of the key name - runs **only for real
   `.env*` files** (filename-detected), where by convention every value is a
   secret. Arbitrary pasted `KEY=value` text that is **not** from a `.env*` file
   (config dumps, feature-flag lists, `.properties`) is deliberately **not**
   blanket-scrubbed; it is masked only where (a) the **key names a secret**
   (`TOKEN` / `SECRET` / `PASSWORD` / `API_KEY` / ...) **or** (b) the **value
   itself matches a high-confidence pattern** above (e.g. `ghp_...`, `sk-...`,
   `AKIA...`, a JWT). This preserves legitimate non-secret context the engineer
   wanted the model to see (e.g. `APP_MODE=dev`) instead of destroying it,
   **without weakening protection of any recognized secret** - a `ghp_...` token
   under any key name, in any text, is still redacted by its value pattern.

`protectSecrets()` runs **before** the optimized/compressed text is shown or
sent - so in Answer mode the model receives the redacted prompt, never the raw
one. Redaction is **best-effort** (known patterns); it reduces but does not
guarantee elimination of every possible custom secret format. The strongest
control remains keeping secrets out of files (gitignored `.env`, GitHub content
exclusion).

**Org-specific formats.** A regulated team can extend redaction to its own token
shapes via the `ceTokenKit.secretPatterns` setting (`[{ "name", "regex" }]`).
Each pattern is applied on top of the built-ins on **every** redaction surface,
so an internal key format (e.g. `corp-...`) is masked to `[REDACTED_CORP_TOKEN]`
without modifying the extension. Patterns can be pinned via workspace or org
policy; invalid regexes are skipped rather than failing.

**Scope reminder + mitigation.** Redaction only sees content **routed through the
kit** - it does **not** intercept a raw paste typed straight into Copilot Chat
(VS Code exposes no hook for that). The deliberate mitigation is the **`CE: Redact
Clipboard`** command: it scrubs secrets from the clipboard in place (same engine,
local only), so an engineer can copy -> run it -> paste a clean version. It is the
sanctioned path to redact before a manual paste; the primary control remains
content exclusion and not pasting secrets at all.

---

## What the extension does **not** do

- It makes **no network calls of its own** (no telemetry, analytics, or
  external services).
- It **persists no content** - only token/command **counts** are written to VS
  Code `globalState`. No selections, prompts, or secrets are stored; nothing is
  written to disk.
- It has **no runtime dependencies** (no third-party npm package executes).
- It does not scan or transmit files you did not explicitly act on.

---

## Verify it yourself

A reviewer can confirm every claim above from the source in minutes:

```bash
# 1. No network / exfiltration calls anywhere in the extension source.
#    (Expect: no matches. The only model call is the documented LM API below.)
grep -rniE "fetch\(|https?\.(get|post|request)|axios|XMLHttpRequest|websocket|net\.connect|telemetry|analytics" vscode-extension/src/

# 2. The ONE and only model-calling site - VS Code's Language Model API, used in Answer mode.
grep -rn "sendRequest" vscode-extension/src/
#   -> vscode-extension/src/chat-participant.cjs: request.model.sendRequest(messages, {}, token)

# 3. Zero runtime dependencies.
node -e "console.log('dependencies =', require('./vscode-extension/package.json').dependencies || 'none')"

# 4. Persistence is counts only (STATS_KEY), no content, no disk writes.
grep -rn "globalState.update\|fs.writeFile\|context.secrets" vscode-extension/src/

# 5. Redaction runs before the text is shown or sent (protectSecrets precedes streamOrAnswer).
grep -n "protectSecrets\|streamOrAnswer\|sendRequest" vscode-extension/src/chat-participant.cjs
```

The redaction patterns themselves are in `src/shared/lib/secret-protection.js`
(pure string replacement, no I/O). The compressors are in
`src/shared/compressors/`. The bundled `src/shared/` is a generated, byte-for-byte
copy of the repository's `scripts/lib/` + `scripts/compressors/` (verified in CI
by `npm run sync:check`).

---

## Locking it down (regulated rollout)

For a regulated environment, the recommended posture is **Transform-only** - the
compression engine, the kit's primary value, needs no model access. To enforce
that so none of the three model-calling surfaces (Answer mode, `@cetoken-concise`,
the agent tool) can engage - and the LM consent dialog never appears - pin the
settings via VS Code policy or workspace `configurationDefaults`:

```jsonc
// .vscode/settings.json (workspace) or org policy
{
  "ceTokenKit.chat.answerMode": false,
  "ceTokenKit.concise.enabled": false,
  "ceTokenKit.agentTool.enabled": false
}
```

With all three off, the extension performs only local, in-process text
transformation - no model is contacted and nothing leaves the machine.
(`concise.enabled: false` un-registers the `@cetoken-concise` participant
entirely, so it cannot be invoked.)

### Distribution note
Installing a sideloaded, unsigned `.vsix` via `--install-extension` will not
pass most regulated extension policies. For production rollout, distribute
through your organisation's approved/internal extension registry or a
verified-publisher channel rather than manual sideloading.
