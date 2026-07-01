# Savings Worksheet

This worksheet is for internal estimation and rollout planning. It is not a public pricing claim.

## Inputs

| Input | Your value | Notes |
|---|---|---|
| Team size |  | Number of active Copilot users |
| Target repositories |  | Number of repos receiving the kit |
| Average debugging chats per engineer per week |  | Use a rough but honest estimate |
| Average large raw output pastes per engineer per week |  | Count only obviously heavy cases |
| Average broad workspace prompts per engineer per week |  | Count broad repo searches and similar prompts |
| Prompts benefiting from persistent direct-answer style per week |  | Count scoped tasks where filler can be removed without losing meaning |
| Reusable-prefix prompt reuse rate (%) |  | Share of prompts that keep stable instructions first and volatile context last |
| Observed cache-hit field rate (%) |  | Use provider-visible cache-hit fields when available; leave blank if unavailable |
| Interactive sync share (%) |  | Share of requests that must return immediately |
| Async batch share (%) |  | Share routed to batch-capable async lanes |
| Low-priority flex share (%) |  | Share routed to flex lanes where available |
| Batch discount assumption (%) | 50 | Keep as assumption unless your vendor statement differs |
| Flex discount assumption (%) |  | Set from current vendor docs and plan constraints |
| Compliance-routed exceptions (%) |  | Share forced to sync due to residency or retention policy |
| Avoided Copilot code-review calls per week |  | Count cases where local diff preflight removed the need for paid review |
| Avoided GitHub Actions minutes from skipped review runs |  | Estimate from workflow history where review jobs were avoided |
| High-reuse instruction files compressed |  | Count repo or path-specific markdown files compressed with `--mode instructions` |

## Operational questions

1. How many of those raw pastes can be replaced with filtered or compressed output?
2. How many broad prompts can be replaced with file-scoped prompts?
3. How many large repository instruction files can be split into short repository plus path-specific instructions?
4. How much of your weekly throughput benefits from reusable prompt prefixes and cacheable structure?
5. How many review requests can be preflighted locally before using paid Copilot review paths?
6. How many recurring prompts could rely on a short direct-default style block instead of repeating `code only` or `be concise` in every chat?
7. What share of weekly workload can be routed to async batch without violating SLA or compliance constraints?
8. What share can use flex tiers when latency or temporary unavailability is acceptable?

## Amortized savings check

Do not report only per-call deltas. Capture reuse over time.

| Metric | Your value | Notes |
|---|---|---|
| One-time setup cost (tokens) |  | For creating reusable prompt structures or templates |
| Weekly reuse count |  | How often the reusable structure was used |
| Average per-run token delta |  | Raw before/after delta per run |
| Amortized weekly delta |  | Compute: (weekly reuse count x per-run delta) minus one-time setup cost |

## Workload routing estimator

Use this table to model blended savings from sync, batch, and flex routing.

| Lane | Volume share (%) | Relative cost multiplier | Estimated blended contribution |
|---|---|---|---|
| Sync interactive |  | 1.0 | share x 1.0 |
| Async batch |  | 0.5 (default assumption) | share x 0.5 |
| Flex low-priority |  |  | share x flex multiplier |

Notes:

1. Keep lane shares summing to 100%.
2. Use documented vendor multipliers, then update with observed billing exports.
3. If compliance-routed exceptions are high, reduce planned batch/flex shares before forecasting savings.

## Example scoring model

Use a simple red, amber, green scale if precise telemetry is unavailable.

| Area | Current state | Target state | Notes |
|---|---|---|---|
| Raw log pastes |  |  |  |
| Broad workspace prompts |  |  |  |
| Long multi-task chats |  |  |  |
| Stale repository instructions |  |  |  |
| Verbose default answers |  |  |  |

## Reporting guidance

1. Report examples and behavior changes first.
2. Report cost effects only when you have a measured baseline and at least one amortized view.
3. Keep public wording conservative unless the same pattern has been reproduced across multiple repos.

## Current internal observations

| Observation | Current value | Notes |
|---|---|---|
| `auth-debug` direct-default, initial | ~818 tokens | First direct-default sample after initial policy rollout |
| `auth-debug` direct-default, tightened rerun 1 | ~682 tokens | First work-log suppression pass |
| `auth-debug` direct-default, tightened rerun 2 | ~505 tokens | Second work-log suppression pass that preserved concise reasoning |
| Policy-tightening delta on `auth-debug` | ~313 tokens saved | Roughly 38% lower than the initial direct-default sample |