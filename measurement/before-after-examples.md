# Before And After Examples

Capture a small number of real examples from the target team. Three good examples are worth more than broad percentage claims.

Use this file for internal evidence. Do not publish fixed percentage claims from a single repo sample.

## Example 1 - Raw test output versus filtered output

| Aspect | Before | After |
|---|---|---|
| Input style | Raw test output pasted into Chat | Failure block only or compressed output |
| Approximate size | Add local measurement | Add local measurement |
| Outcome | Add observed response quality or speed | Add observed response quality or speed |
| Notes | Add which lines were actually needed | Add which filtering method was used |

### Worked sample (internal)

| Aspect | Before | After |
|---|---|---|
| Input style | 430-line Playwright output pasted into chat | 18-line failure block plus 1 assertion line |
| Approximate size | ~6.8K chars | ~620 chars |
| Outcome | Response included unrelated retry noise | Response focused on root cause in failing assertion |
| Notes | Passing retries and unrelated warnings were included | Used grep filtering and removed duplicate frames |

## Example 2 - Broad prompt versus file-scoped prompt

| Aspect | Before | After |
|---|---|---|
| Prompt style | Broad workspace prompt | File-scoped or snippet-scoped prompt |
| Approximate scope | Add local observation | Add local observation |
| Outcome | Add observed response quality or speed | Add observed response quality or speed |
| Notes | Add why the broad scope was unnecessary | Add why the narrower scope was enough |

### Worked sample (internal)

| Aspect | Before | After |
|---|---|---|
| Prompt style | "@workspace why is checkout failing" | "#file:tests/checkout.spec.ts:47 why does expected visible fail here" |
| Approximate scope | Unknown multi-file retrieval | Single test file and one assertion target |
| Outcome | Response started with repo-wide guesses | Response immediately addressed locator and state precondition |
| Notes | No failing line or file hint provided | Included failing line and expected/actual behavior |

## Example 3 - Large repository instructions versus short layered instructions

| Aspect | Before | After |
|---|---|---|
| Instruction layout | One large repository file | Short repository file plus path-specific rules |
| Approximate size | Add local measurement | Add local measurement |
| Outcome | Add observed clarity or maintenance impact | Add observed clarity or maintenance impact |
| Notes | Add stale or duplicated content removed | Add path-specific files introduced |

### Worked sample (internal)

| Aspect | Before | After |
|---|---|---|
| Instruction layout | One large repository instruction file | Short repo baseline plus two path-specific instruction files |
| Approximate size | ~240 lines in one file | ~70 repo-wide lines + scoped files loaded only when relevant |
| Outcome | Higher chance of conflicting guidance in generic tasks | Clearer behavior in scoped files and less general prompt overhead |
| Notes | Removed duplicated test and doc conventions | Added targeted instructions for test and docs paths |

## Example 4 - Local diff preflight versus immediate paid review path

| Aspect | Before | After |
|---|---|---|
| Review flow | Direct Copilot code review on initial draft PR | Local diff preflight first, then targeted review only on risky hunks |
| Approximate cost surface | Review call plus potential Actions-minute usage | Fewer review calls and fewer unnecessary review job runs |
| Outcome | Review raised mostly style-level comments | Local pass removed low-risk noise before paid review step |
| Notes | No preflight checklist used | Used local diff summary + targeted risk prompt |

## Example 5 - Per-call delta versus amortized weekly view

| Aspect | Before | After |
|---|---|---|
| Measurement style | Reported single-run token savings only | Reported weekly amortized savings with reuse count |
| Approximate method | One before/after comparison | (weekly reuse count x average delta) minus one-time setup cost |
| Outcome | Overstated one-off improvement as steady-state benefit | More realistic estimate for repeat workflows |
| Notes | No reuse factor captured | Reuse and setup cost tracked in worksheet |

## Example 6 - Verbose default versus direct-answer default

| Aspect | Before | After |
|---|---|---|
| Output style | Normal Copilot explanation with preamble and recap | Direct answer with the same conclusion and next action |
| Approximate size | Add local measurement | Add local measurement |
| Outcome | Add whether the main idea was preserved | Add whether the answer stayed reliable |
| Notes | Add any safety or explanation details lost | Confirm whether the direct style still kept them |

### Worked sample (internal)

| Aspect | Before | After |
|---|---|---|
| Output style | "Sure, I'd be happy to help. The likely issue is..." plus recap | "Auth token expiry check is off by one. Change `<` to `<=`. Then rerun auth tests." |
| Approximate size | ~95 tokens | ~34 tokens |
| Outcome | Same bug identified, but more filler | Same conclusion, reason, and next action with less filler |
| Notes | No safety nuance involved | Good candidate for persistent direct-default style |

### Pilot note - framework repo

Observed in a Playwright framework repo: a 4-line communication-style block was added to `.github/copilot-instructions.md` without changing the existing test or documentation rules. This is a file-level pilot only. Live answer-quality validation still needs a fixed prompt-set run in Copilot or another supported chat surface.

### Response-level evidence - auth-debug prompt

| Aspect | Baseline | Concise | Direct default |
|---|---|---|---|
| Prompt | `auth-debug` | `auth-debug` + `Answer concisely.` | `auth-debug` with repo communication-style block |
| Approximate size | ~924 tokens | ~578 tokens | ~818 tokens |
| Outcome | Preserved main idea, reason, and next action | Preserved main idea, reason, and next action | Preserved main idea, reason, and next action |
| Notes | Very verbose and process-heavy | Lowest-cost version that still preserved the signal | Reliable, but still included too much search/process narration |

In this internal sample, we observed that the direct-default policy preserved meaning for `auth-debug`, but it did not become as lean as the plain concise variant. The next improvement target is not reliability; it is suppressing unnecessary work-log narration in answer text.

### Policy-tightening rerun - auth-debug direct-default

| Aspect | Initial direct default | Tightened-policy rerun 1 | Tightened-policy rerun 2 |
|---|---|---|---|
| Prompt | `auth-debug` with initial repo communication-style block | Same prompt after first anti-work-log tightening | Same prompt after reasoning-preserving anti-work-log tightening |
| Approximate size | ~818 tokens | ~682 tokens | ~505 tokens |
| Outcome | Preserved main idea, reason, and next action | Preserved main idea, reason, and next action | Preserved main idea, reason, and next action |
| Notes | Heavy search/process narration | Less process narration, but still visible | Best result so far: answer-first reasoning with materially less work-log leakage |

In this internal sample, we observed that tightening the communication-style block reduced the `auth-debug` direct-default answer from ~818 to ~505 tokens while preserving the same core signal. That is roughly a 38% reduction across the two policy iterations.

### Response-level evidence - destructive-warning prompt

| Aspect | Baseline | Concise | Direct default |
|---|---|---|---|
| Prompt | `destructive-warning` | `destructive-warning` + `Answer concisely.` | `destructive-warning` with repo communication-style block |
| Approximate size | ~84 tokens | ~88 tokens | ~53 tokens |
| Outcome | Preserved stop recommendation, risk, safe next step, and safety language | Preserved stop recommendation, risk, safe next step, and safety language | Preserved stop recommendation, risk, safe next step, and safety language |
| Notes | Safe, but more procedural | Still safe, but not cheaper than the baseline sample | Best balance in this sample: direct without dropping the safety signal |

In this internal sample, we observed that the direct-default style stayed trustworthy on a destructive-action prompt. Unlike `auth-debug`, the direct-default variant also came in as the leanest of the three while preserving the explicit safety stop.

### Response-level evidence - review-risk prompt

| Aspect | Baseline | Concise | Direct default |
|---|---|---|---|
| Prompt | `review-risk` | `review-risk` + `Answer concisely.` | `review-risk` with repo communication-style block |
| Approximate size | Add local measurement from validator | Add local measurement from validator | Add local measurement from validator |
| Outcome | Preserved the top behavioral risk and smallest fix | Preserved the top behavioral risk and smallest fix | Preserved the top behavioral risk and smallest fix |
| Notes | Correct risk, but cluttered with work-log narration | Better prioritized and tighter than the baseline | Reliable, but still not as lean as the concise variant |

In this internal sample, we observed that direct-default behavior preserved prioritization quality on a review prompt, but process narration still leaks into the answer. The next improvement target remains the same: keep the top risk first and the smallest fix second, while suppressing investigation chatter unless the user asked for it.

### Response-level evidence - setup-guidance prompt

| Aspect | Baseline | Concise | Direct default |
|---|---|---|---|
| Prompt | `setup-guidance` | `setup-guidance` + `Answer concisely.` | `setup-guidance` with repo communication-style block |
| Approximate size | Add local measurement from validator | Add local measurement from validator | Add local measurement from validator |
| Outcome | Preserved the install path and verification steps | Preserved the install path and verification steps | Preserved the install path and verification steps |
| Notes | Accurate, but more procedural than necessary | Best balance when the user wants the shortest reliable steps | Correct, but still framed with visible investigation/process wording |

In this internal sample, we observed that all three variants kept the practical setup instructions intact. The remaining optimization target is the same as in `auth-debug` and `review-risk`: suppress work-log narration in answer mode without dropping exact commands or verification checks.

## Example 7 - Unstable prompt prefix versus stable-prefix rewrite

| Aspect | Before | After |
|---|---|---|
| Prompt structure | Volatile run metadata appears first | Stable task instructions appear first, volatile details moved to tail |
| Approximate cacheability signal | Low reuse score with unstable prefix warning | Higher reuse score with no unstable-prefix warning |
| Outcome | Cache-unfriendly shape across repeated runs | More reusable prefix across repeated runs |
| Notes | Timestamps, trace IDs, and temp paths changed every run | Volatile details placed in final `Error:` or `Details:` slot |

### Worked sample (internal)

| Aspect | Before | After |
|---|---|---|
| Prompt structure | `Run 987654321234 at 2026-06-04T10:12:00Z failed in /tmp/build/... Fix auth test.` | `Fix the failing assertion in tests/auth.spec.ts. Constraint: keep API unchanged. Error: Expected visible, received hidden. Run: 987654321234.` |
| Approximate cacheability signal | Score: 41/100, unstable-prefix warning present | Score: 84/100, unstable-prefix warning cleared |
| Outcome | Prompt changed at the beginning every run | Prompt starts with stable intent and scope, then run-specific details |
| Notes | Earliest volatile index near start of prompt | Earliest volatile index shifted to tail section |

In this internal sample, we observed better reuse-oriented prompt shape after moving volatile context out of the prefix. Treat this as directional unless repeated across multiple repos.

## Example 8 - Raw instruction file versus compressed instruction file

| Aspect | Before | After |
|---|---|---|
| Instruction source | Verbose repository or path-specific instruction file | Same file after `--mode instructions` compression |
| Approximate size | Add local measurement | Add local measurement |
| Outcome | Add whether the behavior changed | Add whether the meaning stayed intact |
| Notes | Note repeated rationale and filler removed | Confirm headings, code, links, paths, and commands were preserved |

### Worked sample (internal)

| Aspect | Before | After |
|---|---|---|
| Instruction source | `other-workspace/.github/copilot-instructions.md` | Same file compressed with `node scripts/compress.js --mode instructions --copy` |
| Approximate size | ~966 tokens | ~963 tokens |
| Outcome | No meaningful token reduction | Strong signal that this file is already concise and near the target shape |
| Notes | Mostly dense bullets, headings, paths, and code-adjacent terms | Compression is more valuable on verbose prose-heavy instruction files than already-tight rule files |

| Aspect | Before | After |
|---|---|---|
| Instruction source | a large agent instruction file | Same file compressed with `node scripts/compress.js --mode instructions --copy` |
| Approximate size | ~3,181 tokens | ~3,171 tokens |
| Outcome | Small reduction after heuristic tightening | Current deterministic compressor trims some prose, but not enough to treat agent files as solved |
| Notes | High density of structured bullets and literal file references limited safe edits | Good candidate for future heuristic work, but not for aggressive rewriting |

| Aspect | Before | After |
|---|---|---|
| Instruction source | `other-workspace/docs/DEVELOPER_GUIDE.md` | Same file compressed with `node scripts/compress.js --mode instructions` |
| Approximate size | ~2,998 tokens | ~2,923 tokens |
| Outcome | Meaning preserved with moderate savings | Better target than already-tight rule files because it contains more explanatory prose |
| Notes | Long-form guidance mixed with code-adjacent examples | Good review-set candidate for future heuristic tuning |

| Aspect | Before | After |
|---|---|---|
| Instruction source | `other-workspace/docs/TEMPLATE-PACKAGING.md` | Same file compressed with `node scripts/compress.js --mode instructions` |
| Approximate size | ~1,766 tokens | ~1,764 tokens |
| Outcome | Nearly flat | Dense procedural bullets and literal file references leave little safe compression headroom |
| Notes | Better treated as already-tight operational guidance | Not a strong target for further heuristic tuning |

## Reporting language guardrails

1. Prefer: "In this internal sample, we observed..."
2. Avoid: "This kit reduces cost by X% everywhere."
3. If cache-hit fields are unavailable in Copilot surfaces, describe improvements as prompt-quality discipline, not guaranteed cache savings.