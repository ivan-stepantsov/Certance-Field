# Measurement Pack

Use this folder to validate the token-efficiency rollout with examples instead of assumptions.

## Files

| File | Purpose |
|---|---|
| `evidence-matrix.md` | Separates documented facts from internal measurements and directional estimates |
| `before-after-examples.md` | Captures concrete examples of prompt, output, and instruction changes |
| `savings-worksheet.md` | Gives a lightweight way to estimate impact using team-specific observations |
| `direct-answer-validation.md` | Documents how to capture real Copilot outputs and score the direct-answer policy |

## Recommended usage

1. Fill out the evidence matrix before publishing any savings statement.
2. Capture 3 to 5 before-and-after examples from real team work.
3. Use the worksheet for internal planning, not as a public guarantee.
4. For communication-style changes, verify that the main conclusion, key reason, next action, and safety details remain intact.
5. Use `node scripts/validate-direct-answers.js` with the prompt set and a captured snapshot before treating direct-answer defaults as proven.

Store direct-answer snapshots in this standalone repository, not in consumer-repo copies of the kit. The measurement record belongs with the canonical kit evidence pack.

## Additional evidence to capture in 2026+

1. Chronicle session evidence: record repeated context, thread sprawl, and chat reset discipline from session insights.
2. Cacheability evidence: record whether prompts used a stable reusable prefix and whether cache-hit fields were observed.
3. Review-path evidence: record avoided Copilot code review calls and avoided GitHub Actions minutes when local diff preflight prevented unnecessary review runs.
4. Amortized savings evidence: separate one-off per-call savings from repeated-prefix and reusable-context savings over a week.
5. Reuse diagnostics evidence: capture local counts for volatile-context warnings, low-reuse warnings, and repeated prompt skeletons from the VS Code extension stats view.
6. Direct-answer reliability evidence: compare normal output, `Answer concisely`, and persistent communication-style injection on the same prompt set.
7. Instruction-compression evidence: capture before/after token counts for `.github/copilot-instructions.md` or similar recurring markdown surfaces.