# Copilot Instructions

This repository packages the Certance Token Kit: a local-first starter for reducing GitHub Copilot token and credit waste with deterministic scripts, measurement assets, install profiles, and a VS Code extension. The main stack is Node.js ESM plus Markdown and JSON, and the output is a reusable kit that other repositories can adopt.

## Project Layout
- `scripts/` contains the reusable compression, prompt-optimization, and validation logic.
- `vscode-extension/` contains the extension implementation and its focused tests.
- `measurement/` holds evidence capture files, before-and-after examples, and the direct-answer harness.
- `profiles/` defines installable bundles.

## Build And Validation
- `npm install`
- `npm run validate`
- `npm run validate:direct-answers`
- `npm run check`
- `cd vscode-extension && node --test test/renderers.test.cjs test/prompt-optimizer.test.cjs test/module-parity.test.cjs`

## Coding Conventions
- Keep kit behavior deterministic and local-first; do not add LLM-dependent rewrite steps to the core scripts.
- Prefer small, evidence-backed changes that improve existing kit layers over new standalone subsystems.
- Keep measurement claims conservative and tied to checked examples or research artifacts.
- When core prompt logic changes, keep the mirrored extension copy aligned and validate parity.

## Communication Style
- Default to direct answers: lead with the conclusion, skip affirmations and filler, keep wording tight.
- Preserve the main idea, key reason, next action, and any safety or constraint detail.
- When the user asks for an answer, do not narrate search or work process in the answer text with lines such as `I'm locating...`, `I'm tracing...`, or `I'm doing a narrow search...`.
- Use process narration only when the user explicitly asks for reasoning steps or live progress updates.
- For debugging, review, and setup questions: state the diagnosis, top risk, or install path first, then the smallest fix or next step.
- Do not include investigation logs, search summaries, or running commentary about what you are checking.
- Include brief reasoning when it materially supports trust, but do not narrate the work process unless the user explicitly asks for it.
- Avoid work-log phrasing such as `I checked`, `I searched`, `I read`, `I traced`, or `next I'm going to` unless the user explicitly asked for that running commentary.
- Keep technical terms, file paths, commands, errors, and code exact.
- Expand to normal prose for security warnings, destructive actions, multi-step procedures, ambiguity-sensitive explanations, or when the user asks for depth.

## Instruction Hygiene
- This standalone repository is the canonical source of truth for Token Kit instructions and packaging assets.
- Consumer repositories may install adapted copies, but ongoing kit changes belong here first.
- Keep repository-wide instructions broadly applicable and move narrow rules into `.github/instructions/*.instructions.md` when the repo grows enough to need them.
- Remove duplicated prose and compress long instruction text before standardizing it repo-wide.
