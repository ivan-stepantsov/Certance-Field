# Evidence Matrix

Use this table to keep public claims conservative and defensible.

| Claim | Status | Evidence type | Source or method | Notes |
|---|---|---|---|---|
| Repository-wide instructions are supported by GitHub Copilot | Documented | Vendor documentation | GitHub Copilot customization docs | Safe for public guidance |
| Path-specific instructions are supported by GitHub Copilot | Documented | Vendor documentation | GitHub Copilot customization docs | Safe for public guidance |
| VS Code supports language-level Copilot enablement | Documented | Vendor documentation | GitHub Copilot IDE configuration docs | Safe for public guidance |
| IntelliJ excluded folders reduce IDE noise | Documented | Vendor documentation | JetBrains content roots docs | Safe for public guidance |
| Auto model selection can improve cost efficiency | Documented | Vendor documentation | GitHub Copilot auto model selection docs | Phrase as capability, not guarantee |
| Copilot code review can consume AI credits and GitHub Actions minutes | Documented | Vendor documentation | GitHub Copilot billing and premium requests docs | Track review-path efficiency separately from prompt compression |
| Copilot Memory controls exist for Business and Enterprise | Documented | Vendor documentation | GitHub Copilot Memory docs | Capture policy constraints before rollout |
| Layered memory model (L1 repo, L2 path, L3 personal, L4 session) reduces repeated preference/context payload | Internal measurement | Local example | Compare warning mix and prompt repetition before/after rollout | Use as directional evidence until repeated across teams |
| Chronicle session history can support token-efficiency evidence | Documented | Vendor documentation | GitHub /chronicle docs | Use as evidence for session sprawl and repeated-context patterns |
| This kit reduced prompt size in one pilot repository | Internal measurement | Local example | Add the repo, date, and sample set | Good for internal reporting |
| Local diff preflight reduced paid review-path usage | Internal measurement | Local example | Track avoided review calls and avoided Actions minutes | Strong internal operating signal when measured over time |
| Stable-prefix prompt structure improved cache-hit outcomes | Internal measurement | Local example | Track repeated prefix patterns and cache-hit fields when available | Report as directional unless repeated across repos |
| MCP tool allowlists and deferred loading reduce tool-schema context overhead | Documented + internal measurement | Vendor documentation + local example | OpenAI MCP/connectors docs and local warning-rate trend after rollout | Report as directional until measured across multiple repos |
| Workload routing (sync interactive, batch async, flex low-priority) reduces blended token cost | Documented + internal measurement | Vendor documentation + local example | Compare monthly workload mix before/after routing policy | Keep savings as a range until repeated across teams |
| Compliance routing matrix prevents non-compliant optimization paths in retention/residency-constrained environments | Documented | Vendor documentation | Vendor docs for batch retention and data residency constraints | Required for regulated rollout guidance |
| Memory-policy rollout reduced preference-style prompt repetition | Internal measurement | Local example | Track preference-style warning counts and repeated prompt skeleton rates | Pair with business-unit policy status |
| Reliability-first communication-style injection reduced filler without losing the main idea | Internal measurement | Prompt-set comparison | Compare default output, `Answer concisely`, and persistent style injection on the same tasks | Accept only if conclusion, reason, next action, and safety details remain intact |
| Deterministic instruction compression reduced recurring instruction-file input size | Internal measurement | Local example | Run `scripts/compress.js --mode instructions` on high-reuse markdown files and compare before/after token counts | Preserve headings, code, links, paths, and commands exactly |
| Runtime high-confidence secret redaction masks common keys, tokens, cloud secret fields, DB URI credentials, and full dotenv assignment values before local CLI output | Internal measurement | Local example | Run `scripts/optimize-prompt.js` and `scripts/compress.js` with seeded secret fixtures and verify redaction markers | Defense in depth with content exclusion; does not sanitize files on disk |
| This kit reduced AI credit spend by a fixed percentage across all repos | Not yet supported | None | Remove or qualify | Do not publish without repeated measurement |

## Rules

1. Public docs should only use `Documented` or clearly labeled `Internal measurement` claims.
2. Directional estimates must be labeled as estimates and tied to a method.
3. Unsupported claims should be removed or downgraded until measured.