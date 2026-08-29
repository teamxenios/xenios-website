# Handoff — Xenios Research full-website release candidate (Claude Lead takeover)

Session: `claude-lead-takeover-20260828` (Claude Code, session `01Gjir8i7SgJFxiBHEDXr26v`) · Written 2026-08-29T01:05Z

## Exact state

| Item | Value |
| --- | --- |
| Branch | `claude/xenios-research-full-finish-takeover-20260828` (pushed, origin-verified at every step) |
| Code-frozen SHA | `679564fc8cb29289e2277836eb32e2deac3d8bec` — every runtime gate green on this exact tree (see the RC document) |
| This handoff's commit | the docs/evidence/coordination/evidence-tooling successor of the code freeze; no runtime file changes. Its SHA is the branch head after this commit and is recorded in `CONTROL/HANDOFFS/CLAUDE-FINAL-HANDOFF.md`. |
| Production | `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` (Render `dep-da6vorqfngtc73brb0gg`, auto-deploy off) — unchanged, re-attested read-only |
| Codex checkpoint handed off | `1a065e0cd55eabbee09654c1a4c0a8d73693824f` (preserved, untouched) |
| Rejected ancestry | `ace92fd65ab46213aa5899a1591d4c565099fd0f` is not an ancestor; every lane carrying it was replayed by content |
| Deployed / migrated / activated / invited / priced / messaged | nothing |

## Read these

1. `docs/research-launch/XENIOS_RESEARCH_FULL_WEBSITE_RC_2026-08-28.md` — identity, integration record, exact gate table, evidence, verdict.
2. `docs/research-launch/XENIOS_RESEARCH_RELEASE_RUNBOOK_2026-08-28.md`, `..._ROLLBACK_PLAN_...`, `..._HUMAN_ONLY_BLOCKERS_...`, `..._CAPABILITY_MATRIX_...`, `..._TEBRA_INTEGRATION_...`.
3. `docs/review/xenios-research-full-site-20260828/` — evidence packet (README, manifests, screenshots).
4. `docs/coordination/release-manifests/XENIOS_RESEARCH_FULL_SITE_RC_2026-08-28.json`, `docs/coordination/ACTIVE_RELEASE_GRAPH.json` (`omega-full-finish-candidate` frozen), `docs/coordination/CURRENT_PRODUCTION_STATE.json`.
5. Outside Git: `C:\Users\sboad\projects\XENIOS_RESEARCH_FULL_FINISH_20260828\CONTROL\` — ledgers, decision log, raw gate logs, the complete evidence set, the independent review report and the final handoff.

## What a successor must not do

Do not deploy, merge to production, apply any migration, create accounts, send invitations, activate products, change pricing/payment/refund effects, or contact Tebra/providers/pharmacies/customers. Do not touch the Codex worktree. Do not merge branches carrying `ace92fd6`. The approved PII names corpus lives outside Git and is never printed or copied.

## Open founder items

Nine founder decisions and sixteen external inputs (one provided) are listed in the human-only blockers document — Tebra mode/link/portal/telehealth, indexing (`RESEARCH_INDEXABLE`), storefront publication, per-product activation, price conflicts, catalog artifact regeneration, migration GO, global-shell touch targets, the partner-name Git-history purge, and the deploy decision itself.
