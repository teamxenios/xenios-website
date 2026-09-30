# Health launch successor: Care pricing projection

Date: 2026-09-30. Branch: `codex/xenios-health-launch-implementation-20260930`.
Pushed source SHA: `c9d638ae36b5a85bebc1be5c0864685a92da764a`.
Source tree: `2a95fad11ef229e6d0c6e397a5d70ca82b0b0e35`.

## Scope

The Research assisted-order catalog no longer projects a Care-only Product Control price or price version. Care cards say "Ask the Care team about pricing" even if an older cached or synthetic catalog response contains a price. The Care CTA remains `/care`; Care items remain excluded from Research order selection. No Product Control price, clinical eligibility, availability, or Care authority changed.

This closes only the price-presentation part of Claude's existing HL-13 observation on the frozen candidate. Claude has not reviewed this successor. It does not establish that any Care product or price is currently available, nor that the Care workflow is live.

## Local checks

Private Node `v20.19.0`, npm `10.8.2`, worktree dependencies installed under that runtime.

- Focused policy, page, and production-catalog tests: 83 passed across three files with one Vitest worker. A prior default-worker run took about 15 minutes and ended with 17 cascading failures after one 5-second timeout; those results are retained as a separate failed run, not relabeled as a pass.
- Assisted-order service and release-control tests: 101 passed, one skipped.
- Typecheck: pass.
- Production build and source/build no-em-dash gates: pass; 1,332 source files and 224 build files scanned, zero forbidden forms.
- Route uniqueness: pass; 453 API registrations across 444 call sites.

No full suite, managed database, browser journey, migration application, deployment, hosted configuration change, real email, charge, or supplier action occurred for this slice. HL-11 and HL-12 remain open. The local checks are not evidence of live behavior.
