# Token-estimate calibration

The kit reports token counts with a deliberately zero-dependency heuristic -
`estimateTokens(text) = ceil(text.length / 4)` ([scripts/lib/tokens.js](../../scripts/lib/tokens.js)).
No tokenizer ships at runtime. This eval quantifies the heuristic's error against
a real BPE tokenizer (`gpt-tokenizer`, `cl100k_base` - the GPT-3.5/4 encoding) so
the "tokens saved" figures carry honest error bars.

```bash
npm run evals:tokenizer
```

`gpt-tokenizer` is a **devDependency** - it is used only here and never ships.
The runtime estimate stays `ceil(len/4)`.

## What it measures

For representative payloads (code, JSON, prose, diff, test output) it reports:

- **est err** - how far `ceil(len/4)` is from the real token count.
- **bias** - the kit's reported compression ratio minus the *real* compression
  ratio, in percentage points. This is the number that matters: the status bar
  and stats report a savings **ratio**, not an absolute count.

## Result (representative run, cl100k_base)

| metric | mean | median | max |
|---|---|---|---|
| Raw token-estimate error | ~19% | ~23% | ~28% |
| **Compression-ratio bias** | **~4pp** | **~4pp** | **~7pp** |

**Reading it:** absolute token counts from `ceil(len/4)` can be off by 20-30% -
punctuation-dense JSON/diffs/logs tokenize into more, shorter tokens (the
estimate under-counts), while English prose averages more than 4 chars/token
(the estimate over-counts). **But the before/after *ratio* - the headline
"X% smaller" - stays within a few percentage points of the truth**, because the
per-character bias lands on both sides of the division and largely cancels.

**Takeaway for the savings claim:** quote the kit's **percentage reduction** as
the reliable figure (±~5pp), and treat the absolute "N tokens saved" counter as
an order-of-magnitude indicator, not an exact ledger. Customers who need exact
billing numbers should reconcile against their provider's own token accounting.
