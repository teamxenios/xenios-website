TASK: XENIOS-CLARITY-SPEC-20260926 — clarity program step 1 (discovery, strategy, IA, copy, practice model, implementation spec)
ROLE: Claude Code — strategy/specification lane (session `claude-clarity-spec-20260926`)
BASE SHA: 049dfd9d387893623771b8a76b90df6a8bc444d7 (audit evidence / documentation tip)
BASE TREE: 9b0ab4eb82779f5556c0c1d6c8aa96b5e59e7a52
BRANCH: claude/xenios-clarity-spec-20260926
HEAD SHA: see final handoff commit (this file is committed in the same docs-only series)
HEAD TREE: see final handoff
REMOTE VERIFIED: recorded in final handoff
WORKTREE CLEAN: recorded in final handoff
RUNTIME FILES CHANGED: NONE
TEST-ONLY FILES CHANGED: NONE
DOCS-ONLY FILES CHANGED: docs/ux/xenios-clarity-program/** and this lane's own .xenios session/lease records
PRODUCTION MUTATED: NO

# 01 — Current source identity

## Three identities that must never be confused

| Role | SHA | Tree | What it is | What it is NOT |
| --- | --- | --- | --- | --- |
| Observed production runtime | `79414143d4355d5d3d14cd5fe6e5a536dc68d99d` | `ca9d77ce95bede22b40315fa4cbcdee91de2312c` | Live on Render deploy `dep-daqft3vf3r2c73b7e88g`; independently re-read (read-only) 2026-09-26 by the audit lane (`docs/ux/xenios-adversarial-audit-20260924/production-health-20260926.json`). Health 200, `commerceEnabled=false`. | Not the source this spec analyzes line-by-line. |
| Runtime under analysis | `c4ea8a9111fcdf7b66cff7db42347e7d38a3fefa` | `e79b5eef9da677a783e2b928597ead86593c74ce` | Application successor from the adversarial audit (contact-delivery repair on top of the 2026-09-24 UX/account/notification candidate). | **Not deployed. Not release-accepted.** Release packet: "NOT ACCEPTED". Protected-fingerprint review, production/schema binding and a qualified manifest remain open (integrator-owned). |
| Audit evidence / docs tip (this lane's base) | `049dfd9d387893623771b8a76b90df6a8bc444d7` | `9b0ab4eb82779f5556c0c1d6c8aa96b5e59e7a52` | Documentation, evidence and canonical-record successors of `c4ea8a9`. Application source identical to `c4ea8a9`. | Not a deployable runtime "because it is newer". |

Implication for this program: the Codex implementation (`CODEX_01`) requires "one exact qualified base SHA/tree". **No qualified base exists yet.** Codex must start from whichever SHA the audit/release-control lane qualifies (expected: `c4ea8a9` or a reconciled successor). This spec is written against `c4ea8a9` source; if the qualified base differs, Codex must diff the public-site files listed in `12_IMPLEMENTATION_PLAN.md` before implementing.

Consequence for users today: screenshots of xeniostechnology.com (Stephen's and Seth's experience) come from `79414143`, which lacks the candidate's sign-in/access chooser (audit AUD-003). The findings below are made against `c4ea8a9`; where production differs and it matters, it is called out.

## What was inspected, and at what evidence level

| Surface | Evidence level (protocol §7) | Notes |
| --- | --- | --- |
| Client routes, page components, nav/footer, copy | Source inspection @ `c4ea8a9` (via `049dfd9`) | Three read-only audits (public pages/CTAs; product/pricing/Care/Research authority; practice/partner/account/admin/notification flows). |
| Contact/Care/assisted-order endpoints and receipts | Source inspection + audit lane's browser fixture / SQL rehearsal (their evidence, not re-run here) | See `docs/ux/xenios-adversarial-audit-20260924/`. Not re-executed by this lane. |
| Production | Production read-only observation — by the audit lane, 2026-09-26 | This lane made no production calls. |
| Stephen / Compass meeting | Stakeholder input (machine-generated notes + transcript) | Checked against transcript where it matters; see `STEPHEN_COMPASS_CASE_STUDY.md`. |
| System Labs | External reference — public homepage/treatments observed read-only 2026-09-26 | No intake, account, or payment. |

## Worktree and ownership

- Worktree: `C:/xenios-wt/clarity-spec` (separate from shared `C:/xenios-wt/general-platform`, whose uncommitted fleet files were not touched).
- Lease: `docs/ux/xenios-clarity-program/**` under task `XENIOS-CLARITY-SPEC-20260926`. No overlap with any active lease (checked 2026-09-26: active leases cover master-offerings/catalog, assisted-order comms, account-identity, ordering-readiness payment paths, `client/src/care/**`).
- Parallel lanes known: `codex/xenios-adversarial-audit-20260924` (release control, continuing). A Codex desktop session was also handed these same prompts on 2026-09-26; `LANE_CLAIM.md` records that step 1 is owned here and `CODEX_01` is blocked on owner approval.
