# Direct-Answer Validation Workflow

Use this workflow to turn the direct-answer policy from file-level evidence into response-level evidence.

## Goal

Compare three answer styles against the same fixed prompt set:

1. Baseline Copilot response
2. Per-prompt concise request, such as `Answer concisely.`
3. Persistent direct-default style from repo instructions

Accept the direct-default style only if each answer keeps:

1. The main conclusion
2. The key reason
3. The next action
4. Any safety or constraint detail

## Automated completeness gate (catches "short but incomplete")

Length alone is not evidence of quality - a terse answer that drops a decisive
concept (a safety caveat, the actual fix, a required command) is *worse*, not
cheaper. Each prompt in the set therefore declares `requiredElements`: an array
of **synonym groups**, where a complete answer must contain at least one
alternative from every group (case-insensitive, paraphrase-tolerant).

`scripts/validate-direct-answers.js` runs this gate on the **concise** variant and
**fails (exit 1)** if any group is unsatisfied - e.g. a destructive-action answer
that keeps "it deletes data" but drops the *backup / reversible-migration* and
*don't-run-in-production* concepts. The report adds a **Complete** column so a
reviewer sees token savings and retained quality side by side. This makes the
evidence pack show *both* that answers got shorter **and** that they stayed
correct and safe. Pure logic is covered by `scripts/direct-answer-quality.test.js`.

## Files

- `measurement/direct-answer-prompt-set.json`
- `measurement/direct-answer-snapshot.example.json`
- `measurement/direct-answer-captures/`
- `scripts/validate-direct-answers.js`

## Capture steps

1. Open the target repo in Copilot Chat.
2. Pick one prompt from `measurement/direct-answer-prompt-set.json`.
3. Run it three ways:
   - baseline
   - with a plain terse instruction, such as `Answer concisely.`
   - with the repo's direct-default communication-style block enabled
4. Paste the three outputs into either:
   - `output` fields in a JSON snapshot if the text is already JSON-escaped, or
   - plain text files under `measurement/direct-answer-captures/` and reference them with `outputFile`
5. For each output, mark:
   - `keptMainIdea`
   - `keptReason`
   - `keptNextAction`
   - `keptSafety`
6. Run:

```bash
node scripts/validate-direct-answers.js --snapshot measurement/direct-answer-snapshot.example.json
```

Recommended for raw pasted model replies:

```json
{
   "results": [
      {
         "id": "auth-debug",
         "variants": {
            "baseline": {
               "outputFile": "direct-answer-captures/auth-debug.baseline.txt"
            },
            "concise": {
               "outputFile": "direct-answer-captures/auth-debug.concise.txt"
            },
            "directDefault": {
               "outputFile": "direct-answer-captures/auth-debug.direct-default.txt"
            }
         }
      }
   ]
}
```

This avoids JSON syntax errors from raw line breaks, quotes, or backslashes in the model output.

## Interpretation

- `pass` means the signal survived compression.
- `review` means the prompt did not require that field or you have not judged it yet.
- `fail` means the answer got cheaper by dropping substance. Do not broaden rollout until fixed.

## Scope note

This repo does not currently include a tool that can submit a Copilot chat prompt and capture the answer automatically. The current workflow is manual capture plus deterministic comparison.