# Copilot Token Efficiency - Engineer Playbook

**Certance Token Kit | June 2026**

This playbook is intentionally tool-light. It focuses on the habits that reduce waste regardless of stack.

---

## What this kit is for

This kit is a practical token-efficiency starter for GitHub Copilot users. It does not replace Copilot or force a new workflow. It gives you a safer default way to use Copilot.

The kit combines four things:

1. Short repository and path-specific instruction patterns so Copilot receives less unnecessary background text.
2. Local prompt and selection optimization so you can send smaller, clearer requests before using chat or review features.
3. Guidance for lower-cost habits such as file-scoped prompts, filtered logs, and fresh chats per task.
4. Measurement and rollout assets so teams can verify what is working instead of guessing.

## How it helps reduce token usage

The kit reduces token usage by cutting waste at the main sources:

| Waste source | What usually happens | How the kit helps |
|---|---|---|
| Too much context | Users send broad repo questions, long logs, or large diffs | The playbook pushes file-scoped prompts, filtered inputs, and shorter chats |
| Repeated prompt noise | The same style instructions and background details get repeated in every request | The optimizer detects preference-style repetition and the operating model moves stable content to the right layer |
| Expensive output | Copilot returns long explanations when only code or a short answer is needed | The kit encourages explicit output shapes such as `Code only` or `3 bullets` |
| Unstructured prompts | Volatile details like timestamps, IDs, and stack traces are mixed into the main task ask | The optimizer warns on volatile context and low prompt reuse structure |
| High-cost review paths | Users jump straight to premium review flows for problems that could be narrowed locally first | The extension and playbook encourage local diff preflight before heavier Copilot review paths |

In simple terms: the kit helps you send less, send cleaner, and ask for less unnecessary output.

## What an end user actually does

For a general engineer using Copilot in VS Code, the expected behavior is simple:

1. Ask about one file, error, or snippet at a time.
2. Paste only the failing or relevant part of logs or diffs.
3. Start a new chat when the task changes.
4. Ask for a bounded response shape when you do not need a long explanation.
5. Use the local optimizer or extension commands before sending larger prompts.

You do not need to learn the whole kit to benefit from it. If you follow those five rules, token usage usually drops because the model sees less irrelevant text and produces less unnecessary output.

---

## Why this matters

GitHub Copilot usage has moved to usage-based billing as of June 2026. Every request consumes input tokens (what you send), output tokens (what the model returns), and cached tokens (what the model reuses) - and the costs are not symmetric. Output tokens typically cost 5x more per token than input tokens. The fastest gains come from reducing unnecessary context and capping verbose output before it is generated.

This document avoids fixed savings claims. Use it as an operating baseline, then measure locally.

---

## Highest-value habits

### Workload routing policy (sync vs batch vs flex)

Route requests by latency and compliance needs before optimizing prompt text. This usually saves more than prompt tweaks alone.

| Workload type | Default lane | Why | Typical examples |
|---|---|---|---|
| Interactive, user-waiting | Sync | Lowest latency and easiest turn-by-turn steering | Debugging in chat, live refactors, quick Q&A |
| Async, not user-blocking | Batch | Vendor-documented 50% pricing discount and separate throughput pools | Nightly evaluation runs, large classification jobs, bulk summaries |
| Low-priority interactive or internal back-office | Flex (where available) | Lower cost with accepted latency and occasional capacity fallback | Non-urgent analysis, queued enrichment, offline report generation |

Use a simple decision rule:

1. If a human is waiting, use sync.
2. If the task can finish later, use batch.
3. If urgency is low and platform supports it, use flex with retry/backoff policy.

### Compliance routing policy (retention and residency)

Apply this matrix before enabling batch/flex/caching defaults in regulated teams.

| Constraint profile | Allowed optimization path | Caution |
|---|---|---|
| Standard engineering | Full routing (sync, batch, flex where available), caching enabled | Optimize for blended cost and throughput |
| Strict data residency | Regional or approved in-geo paths only | Verify where inferencing and cached artifacts are processed |
| ZDR or retention-sensitive | Prefer sync and in-memory cache policies; approve batch only when retention policy is acceptable | Some batch paths retain request/response artifacts for a defined period |
| Mixed enterprise portfolio | Team-specific routing profile in rollout docs | Do not enforce one global default across all business units |

This prevents the common failure mode where cost guidance accidentally recommends non-compliant paths.

### 1. Prefer file-scoped prompts over broad repository prompts

Broad prompts increase context size fast. If the task is local, keep the request local.

| Avoid by default | Prefer instead |
|---|---|
| `@workspace why is login failing?` | `#file:tests/login.spec.ts why is this assertion failing?` |
| `@workspace explain this feature` | Name the file or paste the relevant snippet |
| `search the repo for this bug` | Use IDE search first, then paste the narrowed result |

Use broad workspace context only when the problem genuinely spans multiple unknown files.

---

### 2. Shrink output before sending it to Chat

Raw test output, logs, generated JSON, and long diffs are common waste sources.

Instead of pasting everything:

1. Extract the failing block only.
2. Remove passing tests and duplicate stack frames.
3. Use `scripts/compress.js` when the file is still too large.

The local CLIs now include runtime high-confidence secret redaction by default (`redact` mode). If a pasted block includes common token or key patterns, values are masked before compressed or optimized output is emitted. This includes common enterprise payload shapes such as Azure connection secrets, GCP service-account private key fields, Slack/npm/Stripe tokens, and credential-bearing database URLs. Dotenv payloads are handled with dedicated full-value assignment redaction so key names remain visible while values are removed.

Example:

```bash
npx playwright test 2>&1 | grep -A 15 "FAILED\|Error\|expect("
```

If you only need one error, paste one error.

### Compression modes - what each one does

`scripts/compress.js` and the VS Code selection commands use four modes. Pick the one that matches what you're compressing:

| Mode | Flag | What it strips | Typical reduction |
|---|---|---|---|
| `code` | `--mode code` | Comment-only lines (single-line and block), consecutive blank lines. All logic, types, imports, signatures kept. | 20-40% on heavily commented files |
| `output` | `--mode output` | Passing tests, browser tags, node internals, duplicate stack frames. Keeps: error lines, failing test headers, top 3 source frames, summary. | 80-95% on a full Playwright run |
| `json` | `--mode json` | Null/undefined values, empty arrays and objects. Large homogeneous arrays truncated to 3 items + count. Minified. | 30-60% on sparse API responses |
| `instructions` | `--mode instructions` | Filler words (`really`, `basically`, `just`), pleasantry prefixes, redundant phrases (`in order to` -> `to`). Code blocks, paths, commands protected. | 10-25% on verbose markdown |

**Concrete example - test output (`--mode output`):**

Before (180 lines, ~2,800 tokens):
```
Running 47 tests using 4 workers

  ✓ auth > login with valid credentials (1.2s)
  ✓ auth > redirects to dashboard (0.8s)
  ... 44 more passing tests ...

  1) auth > login with expired token

    Error: expect(locator).toBeVisible()
    Expected: visible
    Received: hidden

    Call log:
      - waiting for locator('#dashboard') ...

      > 42 |     await expect(page.locator('#dashboard')).toBeVisible();
           |                                              ^
        43 |   });

        at LoginPage.verifyDashboard (pages/LoginPage.ts:42:46)
        at Context.<anonymous> (tests/auth.spec.ts:18:5)
        at node:internal/process/task_queues:140:7

  1 failed, 46 passed
```

After (12 lines, ~180 tokens):
```
1) auth > login with expired token

Error: expect(locator).toBeVisible()
Expected: visible
Received: hidden

> 42 |     await expect(page.locator('#dashboard')).toBeVisible();

    at LoginPage.verifyDashboard (pages/LoginPage.ts:42:46)
    at Context.<anonymous> (tests/auth.spec.ts:18:5)

1 failed, 46 passed
```

**Concrete example - code (`--mode code`):**

Before (a TypeScript function with documentation, ~60 tokens):
```typescript
/**
 * Looks up a user record and validates credentials.
 * @param credentials - login payload from the request body
 * @returns auth token or null on failure
 */
async function authenticate(credentials: UserCredentials): Promise<string | null> {
  // fetch user from database
  const user = await db.findUser(credentials.email);
  // constant-time comparison to prevent timing attacks
  if (!user || !bcrypt.compare(credentials.password, user.hash)) {
    return null; // caller maps null to HTTP 401
  }
  return generateToken(user); // short-lived JWT, 15 min expiry
}
```

After (~35 tokens):
```typescript
async function authenticate(credentials: UserCredentials): Promise<string | null> {
  const user = await db.findUser(credentials.email);
  if (!user || !bcrypt.compare(credentials.password, user.hash)) {
    return null;
  }
  return generateToken(user);
}
```

Use `--copy` with the CLI to review before overwriting: `node scripts/compress.js file.ts --mode code --copy`

---

### 3. End the chat when the task ends

Long conversations accumulate history even when the next question is unrelated.

Open a new chat when:

1. You switch features or files.
2. The discussion changes from debugging to design or implementation.
3. The thread has become repetitive or contradictory.

Treat each chat as a task container, not a permanent notebook.

---

### 4. Use completions for routine code, chat for reasoning

If the task is mechanically clear, start with inline completion before opening a chat.

Typical examples:

1. Filling in a small method body
2. Writing a type or interface
3. Translating a short comment into code
4. Repeating an established local pattern

Use chat when you need explanation, comparison, multi-file reasoning, or a tradeoff decision.

---

### 5. Cap output verbosity at the prompt level

Output tokens cost approximately 5x more than input tokens. Copilot's default behaviour is to explain what it does, summarise what it generated, and add context notes. That is expensive output you rarely need for code tasks.

Two ways to cap it:

| Approach | When to use |
|---|---|
| Add `Code only, no explanation.` to the prompt | Per-request, on any code generation ask |
| Add `Respond with code only, no explanation, unless asked.` to `.github/copilot-instructions.md` | Project-wide default; applies to every engineer on every request |

The instruction-file approach is higher ROI: set it once, save on every call.

Before and after for Playwright context:

```
Before:
"Generate a Page Object for the checkout page"

After:
"Generate a Page Object for the checkout page. Code only, no explanation."
```

For explanations you do want - tradeoff decisions, architecture reviews, debugging - ask for them explicitly with a bounded output shape: `Explain in 3 bullets.`

### Reliability guardrail - direct by default, not shortest at any cost

The goal is not to make every answer as short as possible. The goal is to remove filler while keeping the main idea intact.

Use a persistent direct-answer default in `.github/copilot-instructions.md` when the team wants less ceremony on every response. Keep the rule conservative:

1. Lead with the answer.
2. Remove affirmations, hedging, and trailing recap.
3. Keep the key reason, next action, and any safety warning.
4. Fall back to normal prose for destructive actions, security warnings, multi-step procedures, or ambiguity-sensitive explanations.

This is more trustworthy than aggressive telegraphic compression because it targets waste, not substance.

---

### 6. Treat copilot-instructions.md as the most expensive file in the repo

Every line in `.github/copilot-instructions.md` is included as input tokens on every Copilot request for every engineer. A 200-line file with verbose rationale, repeated reminders, and explained context may cost thousands of tokens per day across a team of 20.

The test for each line: does removing it measurably change the output? If not, remove it.

Prefer:
- One-liners stating the constraint, not explaining why.
- Path-specific instruction files (`.github/instructions/playwright.instructions.md`) for stack-specific rules - they load only when Copilot works in matching files.
- Use-site prompts for task-specific context that does not apply globally.
- `node scripts/compress.js .github/copilot-instructions.md --mode instructions` before standardizing a long instruction file.

If you add a communication-style block, keep it short. A reliable 4-line default is cheaper and safer than a 30-line style manifesto.

---

### 7. For Agent Mode, separate research from implementation

Agent Mode accumulates tool-call results across the session. A session that starts with "explore the codebase" and ends with "generate the test suite" carries the full exploration history into every generation step.

Break agent sessions at phase boundaries:

1. **Research phase** - explore, understand, record answers in a scratch note.
2. **Planning phase** - start a new session with your distilled notes as the only context.
3. **Implementation phase** - start a new session with the specific task and the plan file.

In this repo: run the Planner agent first, save the plan to `docs/plan-<feature>.md`, then start a fresh Generator session with that file as `#file:` context.

---

### 8. For Playwright batch test generation, prefer CLI over MCP

The Playwright MCP sends the full accessibility tree and console state on every response. That makes it accurate for interactive locator exploration, but expensive for generating multiple tests.

| Mode | Approx. tokens per session | Best for |
|---|---|---|
| Playwright MCP | ~114 K | Interactive debugging, locator hunting, single-test fixes |
| CLI / Chat with `#file:` | ~27 K | Generating multiple tests, BDD step generation, bulk healing |

In this repo:

- Use `npm run bdd:gen` for bulk BDD generation from `.feature` files.
- Use Playwright MCP for the surgical locator exploration that informs it.
- Use `node scripts/optimize-prompt.js` to tighten the prompt before any batch generation run.

---

### 9. Prune unused MCP tools from your MCP configuration

LLM APIs are stateless - the runtime includes the full JSON schema for every configured MCP tool on every request. The GitHub MCP server exposes 43 tools; if your workflow only uses 3 of them, the remaining 40 schemas are pure overhead added to every call (~10-15 KB per turn, several thousand tokens per run).

Audit `.vscode/mcp.json` or `~/.copilot/mcp.json`: which tools does your team actually invoke? Remove the rest.

Rule of thumb: each unused tool definition costs roughly the same as including it in a long comment in every prompt you send. For a server with 40 unused tools, you are paying for a short essay you never read, on every request.

---

## Prompt patterns that cost less and return more

| Weak prompt | Better prompt |
|---|---|
| `fix the tests` | `Fix the failing assertion in tests/checkout.spec.ts:47. Expected visible, received hidden. Code only.` |
| `improve this code` | `Refactor utils/env.ts to remove duplicated parsing logic. Keep API unchanged. Code only.` |
| `explain this` | `Explain the control flow in 3 bullets for this function.` |
| `review this feature` | `List the top 3 behavioral risks in this diff. Focus on regressions.` |
| `generate a page object` | `Generate a POM for pages/checkout.ts following the pattern in pages/login.ts. Code only.` |
| `write BDD steps for login` | `Write step definitions for features/login.feature. Match the fixture pattern in fixtures/auth.ts. Code only.` |

Good prompts usually include:

1. File name
2. Exact error or observed behavior
3. Desired outcome
4. Output shape, such as `3 bullets` or `code only`

If you are unsure whether your prompt is tight enough, run it through the optimizer first:

```bash
node scripts/optimize-prompt.js "your raw prompt" --file path/to/file.ts
```

The optimizer applies a deterministic five-stage pipeline - polite prefix removal, gerund-to-imperative normalization, hedge word stripping, constraint extraction, and response-shape inference - and warns when the prompt contains patterns that reliably reduce output quality, such as vague referents (`"fix it"` with no file) or compound tasks (`"fix X and also add Y"`). See `SETUP.md` Step 5a for the full pipeline reference.

---

## Prompt cache score - what it is and why it matters

Every time you run **CE: Optimize Prompt** or use the CLI optimizer, your prompt receives a **cache score** (0-100). A low score is surfaced as a `Low prompt reuse score` warning in the result and tracked in the extension's local stats.

**What the score measures:** how much of your prompt is stable (same across repeated runs) versus volatile (timestamps, run IDs, error text, stack frames, generated hashes). Copilot's prompt cache works on prefix matching - the model can reuse cached computation only when the beginning of the prompt is identical to a previous request. If your volatile details are at the top, nothing caches.

**High score (80-100):** The stable context - file path, task description, constraints - appears first. Volatile details are at the end as a labelled slot (`Error:`, `Focus:`). This structure lets Copilot reuse the prefix on repeated work.

**Low score (below 50):** A timestamp, a specific error string, or a stack frame appears near the top of the prompt. Every run looks different to the cache even if you're doing the same task repeatedly. You're paying full input token cost each time.

**The habit this drives:**

```
# Low cache score - volatile content at the top
"The test run at 2026-06-06T09:14:22Z failed with error 8f3a9d:
 fix auth.spec.ts"

# High cache score - stable content first, volatile last
"[TypeScript] Fix the failing assertion in tests/auth.spec.ts.
 Constraint: do not change the API surface.
 Return the minimal change needed. Stop after the code block.
 Error: Expected: visible, Received: hidden (run 2026-06-06T09:14:22Z)"
```

The optimizer restructures prompts toward the high-score pattern automatically. If you still get a low score after optimization, the raw prompt had volatile details so deeply embedded that heuristic reordering couldn't fully separate them - consider splitting the task context from the volatile error detail manually.

---

## VS Code guidance

Recommended baseline:

1. Disable Copilot completions for noisy languages and generated file types you rarely author directly.
2. Keep search exclusions aligned with generated and artifact-heavy folders.
3. Use repository-wide instructions for shared facts and path-specific instructions for narrow rules.
4. Prefer Auto model selection when available and allowed by policy.

### Apply the personal settings template (one-time, per engineer)

The kit ships a ready-to-merge user settings template at `profiles/vscode-user-settings.jsonc`. This is the fastest way to suppress completions on config files, logs, lock files, diff files, and `.env` files across every project you open - not just repos that have a `.vscode/settings.json`.

```
1. Cmd+Shift+P -> "Open User Settings (JSON)"
2. Merge the contents of profiles/vscode-user-settings.jsonc into the file
3. Save - takes effect immediately, no restart needed
```

This does not require admin access, does not affect teammates, and persists across all projects.

### What user settings cover vs what they don't

| | User settings | Repo content exclusion |
|---|---|---|
| IDE completions | ✅ | ✅ |
| Copilot Chat context | ❌ | ✅ |
| Agent Mode | ❌ | ❌ (use AGENTS.md) |

For Chat context exclusion, the engineer or repo admin must configure it in **Repository -> Settings -> Copilot -> Content exclusion**. See `.github/copilot-content-exclusion.yml` for the full pattern list to paste in.

---

## IntelliJ guidance

Recommended baseline:

1. Mark high-noise directories as excluded.
2. Use exclusion patterns when full-folder exclusion is too broad.
3. Validate plugin-specific Copilot behavior in your actual JetBrains environment before setting policy around it.

JetBrains documents that excluded folders are ignored by code completion, navigation, and inspections. That makes exclusion the strongest default control.

---

## Model routing guidance

Use the cheapest mode that can realistically solve the task.

Policy note: treat Gemini routing as optional and disabled by default unless your Copilot admin explicitly enables and approves it for your team.

| Task shape | Default choice |
|---|---|
| Routine coding and small fixes | Auto or low-cost default model |
| Focused bug fix or small refactor | Auto first |
| Complex multi-file reasoning | Standard reasoning model or Auto |
| Deep design, security, or high-risk review | Higher-cost reasoning model only when justified |

If Auto model selection is enabled, prefer it unless there is a clear reason to force a specific model. Defaulting to a premium model for every task increases cost without improving output on routine work.

---

## Local Model Lane (experimental, opt-in)

**Status: experimental add-on, not part of the default kit.** Running a local model adds a dependency (a local model runtime). The rest of this kit has zero external dependencies by design - keep it that way unless you deliberately opt in here.

VS Code exposes `chat.utilityModel` and `chat.utilitySmallModel` for short, repetitive flows: commit messages, branch names, title generation, rename suggestions, prompt categorization. These rarely benefit from a frontier model and are reasonable candidates for a small model running locally via [Ollama](https://ollama.com).

### Try this if

- You're willing to install and run Ollama, and your machine has enough headroom for an 8B-class model (16 GB+ RAM recommended) alongside your IDE.
- Your team wants certain prompt classes (utility tasks, or large logs/diffs before they're pasted into chat) to never leave the device.
- Your org has approved running local model runtimes on this device.

### Skip this if

- You're on a constrained laptop where a local model competes with your IDE and test runs for memory.
- The task involves multi-file reasoning, design tradeoffs, or high-stakes review - keep that on the cloud/frontier lane.
- Your org has not cleared local model runtimes for use - check with IT/security first.

### Suggested starting point

1. Install Ollama and pull a small, tool-calling-capable model:
   ```bash
   ollama pull qwen3:8b
   ```
2. Set a conservative context window to avoid memory-driven retries - small local models default poorly here. See the commented example in `profiles/vscode-user-settings.jsonc`.
3. Point `chat.utilityModel` / `chat.utilitySmallModel` at the local endpoint (same file, commented block).
4. Run it for one week on utility tasks only, then compare against your default cloud model using `measurement/savings-worksheet.md`.

### What this lane is not

- Not a replacement for the deterministic optimizer (`scripts/optimize-prompt.js`, `scripts/compress.js`) - those stay the zero-dependency default.
- Not a frontier-model replacement. Treat it strictly as a utility/filter/preprocessor lane.
- Not enabled by default. Nothing changes for engineers who don't opt in.

Source: 2026-06-15 research run.

---

## Team rules worth standardizing

1. No raw large logs in Chat unless the task explicitly requires them.
2. No default use of broad workspace prompts for single-file problems.
3. New task, new chat.
4. Repository instructions stay short and broad - treat every line as a recurring cost.
5. Stack-specific rules live in path-specific instructions or project docs.
6. Code generation prompts end with `Code only, no explanation.` unless you need the explanation.
7. Agent Mode sessions reset between research, planning, and implementation phases.
8. Batch test generation uses CLI, not MCP.

---

## Local measurement ideas

If you want stronger claims later, measure these for one week before and after rollout:

1. Average prompt size for debugging tasks
2. Number of broad workspace prompts versus file-scoped prompts
3. Number of chats longer than 15 messages
4. Number of raw log pastes replaced by filtered output
5. Output token ratio: requests that received explanation vs code-only responses
6. Length of `.github/copilot-instructions.md` over time (a rising line is a cost signal)
7. Number of local diff preflights that avoided paid review calls
8. Estimated GitHub Actions minutes avoided from skipped review-path runs
9. Amortized weekly savings for reused prompt structures (not only per-call deltas)

That gives you a defensible baseline for internal reporting without guessing.

Note: Copilot does not expose a universal cache-hit control in standard IDE chat flows. Treat cache-friendly prompt structure as quality discipline unless your environment provides measurable cache-hit evidence.

---

## Research basis

The additions in this revision are sourced from:

- [Improving token efficiency in GitHub Agentic Workflows](https://github.blog/ai-and-ml/github-copilot/improving-token-efficiency-in-github-agentic-workflows/) - GitHub Engineering Blog, 2026
- [Improving agent quality to optimize AI usage](https://docs.github.com/en/copilot/tutorials/optimize-ai-usage) - GitHub Docs
- [GitHub Copilot Token Optimization Guide](https://medium.com/@haseeb-dev/github-copilot-token-optimization-guide-5a32ec9465ea) - Muhammad Haseeb Akram, April 2026
- [GitHub Slashes Agent Workflow Token Spend up to 62%](https://www.infoq.com/news/2026/05/github-agentic-token-savings/) - InfoQ, May 2026
- [GitHub MCP Token Cost: A 2026 Autopsy and 4 Fixes](https://getunblocked.com/blog/github-mcp-token-cost/) - Unblocked, 2026
- [GitHub Copilot Token Usage Explained with Practical Cost Control](https://medium.com/simform-engineering/github-copilot-token-usage-explained-with-practical-cost-control-03062b15ecb0) - Simform Engineering, May 2026
- [GitHub Copilot with Playwright: Setup, MCP & Test Guide (2026)](https://testdino.com/blog/playwright-tests-with-copilot) - TestDino, 2026
- [MCP vs CLI: Benchmarking AI Agent Cost & Reliability](https://www.scalekit.com/blog/mcp-vs-cli-use) - Scalekit, 2026
- [Prompt engineering for GitHub Copilot Chat](https://docs.github.com/en/copilot/concepts/prompting/prompt-engineering) - GitHub Docs
- [awesome-copilot-for-testers](https://github.com/jaktestowac/awesome-copilot-for-testers) - jaktestowac, GitHub

---

*Certance Token Kit - Quality Engineering*
