# IP & Conflict-of-Interest Disclosure - Template

> **This is a template, not legal advice.** It is a starting point to disclose
> an externally-owned tool to your employer *before* evaluating or deploying it
> internally. Adapt it to your situation and confirm the wording and process
> with your line manager, Compliance, and Legal. Square-bracketed fields are
> placeholders.

---

**To:** [Line manager], [Information Security], [Compliance / Legal as applicable]
**From:** [Your name], [Team / role]
**Date:** [Date]
**Subject:** Disclosure and request to evaluate an externally-owned developer tool - "Certance Token Kit" (VS Code extension)

## 1. What this is
"Certance Token Kit" is a local-first VS Code extension that compresses oversized
context (test output, diffs, logs, large files) and tightens prompts before they
are sent to GitHub Copilot, to reduce token/credit usage. It does not replace
Copilot; it pre-processes what a developer sends. A security one-pager and
data-flow diagram are attached.

## 2. Ownership (the disclosure)
This tool was developed by me and is owned by **[Owning entity - e.g. my own
company / consultancy, or me personally]**. It is **not** a [Employer] work
product. I am disclosing this because:
- I would like to evaluate it on [Employer]'s environment, and potentially make
  it available to my team; and
- because I both own it and would be introducing it internally, this is a
  potential **conflict of interest** that I want on the record and reviewed
  before I proceed.

I am **not** seeking to sell or license it commercially to [Employer] through
this request. [State the actual intent - e.g. "evaluation only", "internal use
at no charge", or as advised.]

## 3. What I am requesting
1. Guidance on whether internal evaluation is permitted, and through which
   process (software/tooling governance, extension approval, etc.).
2. A review of any IP-assignment / moonlighting / outside-activity clauses in my
   contract that bear on owning this tool and using it here.
3. If evaluation is approved: the approved distribution channel (internal
   registry / signed package) rather than manual sideloading.

## 4. Data-handling summary (for the security review)
- **Local-first.** Compression, optimization, and secret redaction run on the
  machine. The extension makes no network calls of its own; it has no runtime
  dependencies and persists no content (only local counts).
- **The only model-contacting features are opt-in and off by default:** an
  "Answer mode" that sends the *redacted* prompt to Copilot's Language Model API
  (the same path as using Copilot Chat directly), and an agent-mode compression
  tool. Both can be disabled by policy so the tool is **Transform-only** - no
  model access at all.
- High-confidence secrets are redacted before anything is displayed or sent.
- Full detail, audit evidence, and reviewer verification steps are in the
  attached security one-pager and `vscode-extension/SECURITY.md`.

## 5. Proposed safeguards
- Run **Transform-only** (model features disabled by policy) unless/until Copilot
  LM-API use by extensions is separately approved.
- No production rollout until the tool clears the standard review and is
  distributed through an approved channel.
- I will abstain from any approval decision regarding my own tool and defer to
  [Employer]'s governance.

## 6. Acknowledgement
I confirm I am raising this proactively, before installing it on [Employer]'s
environment or sharing it with colleagues, and I will follow whatever process
[Employer] requires.

[Your name] - [Date]

---

### Notes for the author (delete before sending)
- Do **not** install on the corporate environment or share with the team until
  you have written approval - "testing it as the developer" can itself breach
  unapproved-software policy at a regulated institution.
- Be precise and honest in §2 about ownership and how/when/where it was built;
  that is the crux of the IP question.
- Have Legal confirm the IP-assignment position before you rely on owning it.
