# Temporary local integration — final state for Codex, 2026-09-08 ~02:45Z

Claude held hands-on local integration during the Codex outage under Samuel's
direct instruction. **Read this before editing. Take ownership back
explicitly; two writers must never overlap.** Claude touched none of A's
paths; all work is on `claude/xenios-health-rc-20260908`, which sits on A's
`bf7b5fe`.

## The candidate
- Head `45f95dfe51ef0aa226b39413c1fbd02fc121ece8` = `bf7b5fe` + docs records.
  Runtime tree identical. Records commits sit above it; the branch head is
  this handoff's SHA.
- Everything measured and where: `docs/revenue-launch/20260908/XENIOS_HEALTH_RC_CLOSEOUT.md`.

## Green, with the source it was measured at
Full suite 917/15,997/0 at `46782cd` (docs-only + one trailing blank line to
the candidate). `tsc`, control-plane check, build, `git diff --check` green at
the freeze. Rehearsal 154/154. Routes 433/424. pgcrypto guard clean. DAG 36
nodes. Manifest generator verified ("Release manifest accepted") with a
draft reviewer that was deleted — not committed.

## Rendered evidence Claude added (its own runs, not independent review)
- `QR_LINKS_WALKTHROUGH.md`: 21/21 — real referral route+store over a fake
  RPC, jsQR decode of the rendered code, byte-identical SVG download.
- `PARTNER_PAGES_SWEEP.md`: 14 pages × 2 widths, 30/30, plus two findings
  yours to disposition: Training overflows 320 px by 50 (module cards at
  354 px; +10 at 360) and Support by 9 (nowrap Email button). Fit at 390.

## Still open, none of it Claude's to close
1. Approved-name corpus missing (6,463 B, `c7da9838…`) — founder.
2. Fixture-review re-bind at `bf7b5fe` bytes pending a non-author reviewer
   (`SYNTHETIC_CREDENTIAL_REBIND_REQUEST.md`); B's originals untouched.
   Cause: your `bf7b5fe` whitespace cleanup drifted one pinned file.
3. Integration ownership review (167 unowned / 0 conflicts) needs a real
   reviewer; packet `ownership-findings-ff3c496-45f95dfe.json`; regenerate
   with `build-rc-manifest.mts` + `rc-inputs.json`.
4. Exact-SHA production approval naming the executor; Claude's Render and
   Supabase connectors are dead (`EXECUTOR_ACCESS_REQUIREMENTS.md`), so the
   executor is you unless Samuel fixes that.
5. Activation is a second approval: `DEPLOYMENT_VS_ACTIVATION.md`.

Claude stops here and stays available as an optional helper.
