# Install Profiles

This folder defines the kit as reusable bundles.

Your local clone of this kit is the canonical source for these manifests. Consumer repositories should receive copied files from these profiles, not maintain their own independent Token Kit tree.

## Which profile should I use?

1. `core.manifest.json`
Use this first for almost every repo.

## Profiles

| File | Purpose |
|---|---|
| `core.manifest.json` | Generic repository starter bundle |
| `mcp-minimal-tools.jsonc` | Minimal MCP toolset template for token-efficient defaults |
| `vscode-user-settings.jsonc` | Per-engineer VS Code settings template |

## Output discipline (the expensive side)

Everything else in this kit reduces **input** tokens (the context you send).
Output tokens cost roughly **5x more**, and that's where verbose answers and
over-built code quietly burn credit. The core bundle now ships
`.github/instructions/lean-output.instructions.md` - an auto-applied Copilot
instruction file that disciplines the model's *output*:

- **Terseness** - lead with the answer, no filler/preamble/recap, code-first.
- **Don't over-build** - a "stop at the first rung" ladder (does it need to
  exist? reuse? stdlib/native? existing dependency? one-liner? minimum) so the
  model writes the smallest change, not a speculative framework.
- **Guardrails** - brevity never drops validation, error handling, security,
  accessibility, or existing tests.

Illustrative impact on a single response (kit estimator): a typical
preamble-heavy, over-engineered answer ~ **237 tokens**; the same answer under
these rules ~ **52 tokens** - about **78% less, on one reply**. Copy it into a
target repo's `.github/instructions/` so Copilot applies it everywhere.

## Usage

1. Pick the profile that matches the repository or rollout stage.
2. Copy the listed files into the target location.
3. Customize the target repository's local instructions after install.
4. Keep future kit improvements in the standalone Token Kit repo, then reapply them intentionally to consumers.

Fast default:

1. Start with `core.manifest.json`.
2. Install the profile files.
3. Keep the repo-default direct-answer instructions on.

## Minimal MCP defaults

`core.manifest.json` now includes `profiles/mcp-minimal-tools.jsonc` so teams start with explicit MCP minimization guidance.

Use it as a template:

1. Copy to the target repo as `.vscode/mcp.json` (or merge into existing MCP config).
2. Keep only required tools enabled for that repository workflow.
3. Prefer allowlists and deferred loading where your MCP platform supports them.
4. Re-check enabled tools monthly during rollout governance review.

These manifests are intentionally simple so they can later drive a script, template, or packaging workflow.