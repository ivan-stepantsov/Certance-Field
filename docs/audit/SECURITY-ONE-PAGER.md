# Certance Token Kit - Security One-Pager (for InfoSec review)

*One-page summary for a security/compliance reviewer. Full detail: [vscode-extension/SECURITY.md](../../vscode-extension/SECURITY.md).*

## What it is
A local-first VS Code extension that **compresses oversized context** (test output, diffs, JSON, logs, code) and tightens prompts **before** they reach GitHub Copilot, to cut token usage. It does **not** replace Copilot; it pre-processes what an engineer sends.

## Data flow at a glance
| Capability | Calls a model? | Data leaves the machine? |
|---|---|---|
| Compression & optimization (CLI, `@cetoken` **Transform mode** = default, all slash commands, palette commands) | **No** | **No - fully local** |
| `@cetoken` **Answer mode** (opt-in setting, off by default) | Yes - GitHub Copilot Language Model API | Yes - the **redacted** prompt, *same path as using Copilot Chat directly* |
| `#ceCompress` **agent tool** (opt-in setting, off by default) | Tool does no network I/O; it *reduces* what the agent sends | Via the agent's existing Copilot loop |

The VS Code "wants to access the language models" consent prompt appears **only** for Answer mode - it is VS Code's own gate on the Copilot LM API.

## Security posture
- **No network calls of its own** - no telemetry, analytics, or external services. (Verifiable: see below.)
- **No runtime dependencies** - no third-party npm package executes. Supply-chain surface ~ the kit's own source.
- **No content persisted** - only local token/command **counts** in VS Code `globalState`. No selections, prompts, or secrets are stored; nothing is written to disk.
- **Secret redaction before display/send** - high-confidence patterns (API keys, JWTs, bearer tokens, private keys, credential URIs, sensitive JSON fields) are masked wherever they appear; a `⚠ Redacted N...` warning is shown. Two layers: compression strips secret-bearing noise lines; redaction masks any that survive. *Blanket* `KEY=value` masking is scoped to real `.env*` files; pasted non-`.env` text is masked by secret-named key or secret-shaped value (so a `ghp_...` token is still caught, but `APP_MODE=dev` is preserved). Best-effort (known patterns), not a guarantee.
- **Open & auditable** - pure string transformation; the bundled engine is a CI-verified byte-for-byte copy of the repository source.

## Reviewer verification (~5 minutes)
```bash
# No network/exfiltration calls (expect: no matches; the only model call is the documented LM API)
grep -rniE "fetch\(|https?\.(get|post|request)|axios|XMLHttpRequest|websocket|telemetry|analytics" vscode-extension/src/
# The single model-calling site (Answer mode), VS Code Language Model API:
grep -rn "sendRequest" vscode-extension/src/
# Zero runtime dependencies:
node -e "console.log(require('./vscode-extension/package.json').dependencies || 'none')"
# Persistence is counts only:
grep -rn "globalState.update\|fs.writeFile\|context.secrets" vscode-extension/src/
```
Test evidence: one CI pipeline runs all **91** automated tests plus type-check, lint, and shared-module integrity on every change.

## Recommended posture for a regulated environment
- **Transform-only** - the core value (compression) needs no model access. Enforce via policy:
  ```jsonc
  { "ceTokenKit.chat.answerMode": false, "ceTokenKit.agentTool.enabled": false }
  ```
  With both off, the extension performs only local text transformation - no model contacted, no data egress, no consent dialog.
- **Distribution** - install via an approved/internal extension registry or verified-publisher channel; do not rely on manual `.vsix` sideloading for production rollout.

## Open items for the reviewer to confirm against local policy
1. Is GitHub Copilot (and its Language Model API for extensions) already sanctioned here? If not, run Transform-only.
2. Approved distribution channel for the extension.
3. Ownership/licensing of the extension (see the IP/COI disclosure that accompanies this pack).
