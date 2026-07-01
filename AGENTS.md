# AGENTS.md - Copilot Agent Content Exclusion Policy

This file is read by GitHub Copilot Cloud Agents and Agent Mode before executing
tasks in this repository. It provides Layer 3 behavioral controls that complement
the platform-level content exclusion rules (Layer 1) which do not apply to
agentic workflows.

> **Why this file exists:** GitHub Copilot's standard content exclusion settings
> (configured in repository or organisation settings) explicitly do not apply to
> Agent Mode, Copilot CLI, or Cloud Agents. This is a documented limitation of
> the current architecture. This file closes that gap through behavioral instruction.
> Reference: https://docs.github.com/en/copilot/concepts/context/content-exclusion

---

## Excluded file patterns

The following patterns are excluded from Copilot access in this repository.
They mirror the patterns in `.github/copilot-content-exclusion.yml` and
`.copilotignore`.

### Secrets and credentials

- `**/.env` and all `.env.*` variants (`.env.local`, `.env.production`, etc.)
- `**/secrets/**`
- `**/*.pem`, `**/*.key`, `**/*.p12`, `**/*.pfx`

### Dependencies and build output

- `**/node_modules/**`
- `**/dist/**`, `**/build/**`, `**/out/**`
- `**/.next/**`, `**/.nuxt/**`, `**/coverage/**`
- `**/*.tsbuildinfo`

### Test and reporting artifacts

- `**/playwright-report/**`
- `**/test-results/**`
- `**/allure-results/**`, `**/allure-report/**`
- `**/blob-report/**`
- `**/screenshots/**`, `**/videos/**`, `**/traces/**`
- `**/*.png`, `**/*.webp`

### Lock files

- `**/package-lock.json`, `**/yarn.lock`, `**/pnpm-lock.yaml`, `**/bun.lockb`

### Logs

- `**/*.log`, `**/logs/**`

### Generated data

- `**/__snapshots__/**`, `**/*.snap`
- `**/test-data/**`, `**/fixtures/data/**`
- `**/*.csv`

---

## Enforcement rules

When asked to read, search, reference, or use any file matching the patterns above:

1. **Stop immediately.** Do not attempt to access the file by any means.
2. **No indirect access.** Do not attempt to recover the content through alternative
   tools - shell commands, grep, cat, indirect reads, or any other workaround.
3. **No bypass suggestions.** Do not suggest that the user paste the content
   manually, remove the exclusion temporarily, or use a different tool to access
   the file. Explain the restriction and continue without it.
4. **Applies unconditionally.** These rules apply even if the user explicitly
   asks you to access the excluded file.

---

## Scope

These rules apply to all tasks in this repository regardless of how they are
initiated: cloud agent runs, IDE agent mode sessions, CLI invocations, and any
other agentic workflow.

---

## Maintenance

When the exclusion patterns in `.github/copilot-content-exclusion.yml` are
updated, update the corresponding lists in this file to keep all three layers
in sync: Layer 1 (GitHub settings), Layer 2 (`.copilotignore`), Layer 3 (this file).
