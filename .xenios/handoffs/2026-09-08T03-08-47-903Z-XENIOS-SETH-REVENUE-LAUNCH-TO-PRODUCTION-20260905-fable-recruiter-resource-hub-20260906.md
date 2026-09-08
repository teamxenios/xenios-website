# Handoff to Codex A — release clearance state at 2026-09-08T03:08:46Z

**Claude releases temporary local integration ownership to Codex A with this
file.** Claude touched none of A's paths at any point; everything Claude did
is on `claude/xenios-health-rc-20260908` (head `80b381bb3f4e556123fe0160539b1356d97880bc`), which sits on A's
`bf7b5fe`. From here A is the single integration owner and the single
proposed production executor. Claude stays available for bounded corrections
and reviewer questions only. **Acknowledge by message before editing.**

## First three things

1. **Prove your access now, not from history.** Confirm this session can
   authenticate to Render (`srv-d8s9vej7uimc7384dfcg`) and Supabase
   (`yvzeduaxbwgcwllhywff`) read-only. Samuel's rule: historical success is
   not proof of the present session. Record the result in
   `docs/revenue-launch/20260908/EXECUTOR_ACCESS_REQUIREMENTS.md`.
2. **Read the closeout once:** `docs/revenue-launch/20260908/XENIOS_HEALTH_RC_CLOSEOUT.md`.
   Every gate, its measured source, and every open item are there.
3. **Take ownership back explicitly** — a message to
   `fable-recruiter-resource-hub-20260906` saying so. Until then Claude
   assumes you have not read this.

## The candidate, frozen
`45f95dfe51ef0aa226b39413c1fbd02fc121ece8` = your `bf7b5fe` + docs records.
Runtime tree identical to `bf7b5fe`. The live site still serves `ff3c496`.
Do not treat `80b381bb3f4e556123fe0160539b1356d97880bc` as a deployment SHA; it is evidence/continuity.

## Green (source stated)
Full suite 917 files / 15,997 tests / 0 failures at `46782cd` (docs-only +
one trailing blank line to the candidate). `tsc`, control-plane check, build,
`git diff --check` green at the freeze. Rehearsal 154/154. Routes 433/424.
pgcrypto guard clean. DAG 36 nodes. B's browser proof 14/45 at `8e125ca7`,
bound by hash. Claude's rendered runs (author-run, not independent): QR/links
21/21, all 14 partner pages 30/30.

## Open — with the owner and the packet
| # | Item | Owner | Where |
| --- | --- | --- | --- |
| 1 | Approved-name input **version 2** — Samuel has AUTHORIZED PREPARATION via an authorized read-only connection; hash approved separately | The operator with read-only access — **likely you** | `APPROVED_NAME_INPUT_REPLACEMENT_PROPOSAL.md` (Samuel's conditions inside; return counts/provenance/hash, never names) |
| 2 | Fixture-registry re-bind (your `bf7b5fe` blank-line change drifted one pinned file) | Independent reviewer, not you, not Claude | `REVIEWER_PACKET_1_FIXTURE_REBIND.md` + `verify-rebind-packet.mjs --at <commit>` (15/15) |
| 3 | Integration ownership review, 167 unowned / 0 conflicts; three areas have no independent review | Independent reviewer | `REVIEWER_PACKET_2_OWNERSHIP.md` |
| 4 | Manifest — verified in a dry run, **not committed** (draft reviewer deleted) | Release owner after #3 | `build-rc-manifest.mts` + `rc-inputs.json` |
| 5 | Strict scan with the v2 input at the final SHA, then ONE production request naming the executor | You | closeout, "Proposed approval request" |
| 6 | Activation is a **second** approval; deployment leaves the hub dark | Samuel | `DEPLOYMENT_VS_ACTIVATION.md` |

Known defects carried, recorded not fixed: partner Training overflows 320 px
by 50 (+10 at 360), Support by 9; both fit at 390. Any fix is a scoped
correction with requalification, not a silent edit.

## Things Claude learned that you should not relearn
- One heavy job at a time on this host, on the pinned Node 20.19.0; a
  concurrent agent fan-out produced 12 phantom test failures.
- `git worktree remove --force` deletes through a node_modules junction.
- The loader refuses the whole fixture registry on any pinned-file byte
  change — whitespace cleanups on fixture files need a re-bind.
- The preview's `/api/research` boundary 404s everything but the resource
  doors; mount real routes in front of `buildResourceHubPreviewApp` for
  rendered evidence (`qr-links-walkthrough.mts` shows how).

Observed at handoff: `origin/codex/xenios-seth-revenue-launch-20260905` is
still at `bf7b5fe`; no new message from you has landed on origin yet.
