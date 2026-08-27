# [XENIOS HANDOFF] Client-account FINAL integration RC — 2026-08-27

SESSION: claude-fable-final-integrator-20260827
ROLE: lead release integrator (customer accounts, client demand, catalog activation)
WORKTREE: C:\Users\sboad\projects\xenios-client-account-final-integration-20260826
BRANCH: integration/xenios-client-account-final-rc-20260826
PRODUCTION MUTATED: NO — no deploy, no merge to release branches, no migration
applied anywhere real, no invitation, no email, no real account, no real
customer data in git/logs/output.

## Release lineage (all origin-verified before work began)

| Input | SHA |
|---|---|
| release/early-access-code-session-checkout HEAD (Hino) | 3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212 |
| hotfix/xenios-research-live-ux-performance-20260825 HEAD | b8359eba179fb7a901df58be6b949b3956a43c39 |
| Reconciled base (release + hotfix, both preserved) | 6a2df29837800436f351abacf63b8d3a07939566 |
| claude/xenios-client-accounts-backend-20260826 HEAD | 42a318303ff4dc522eceeadf1cb6f9fa8e634137 |
| codex/xenios-client-portal-catalog-20260826 HEAD | e376f80c75a7a97e53e3f28ec198eca1b7d81283 |
| Codex primary UI commit | f6aa32dee7400af5ac9cdacfcae8e4c6f8972657 |

Merge bases verified: release/hotfix diverge at df16b36; Claude branch is
release-HEAD-based; Codex forked from Claude checkpoint cb5a14c. Both sides of
CORE_SITE_PROTECTION_MANIFEST.json (Hino /hino exemption + hotfix seam-hash
notes) survived the reconciliation; the only merge conflicts were the three
.xenios coordination JSONs, resolved as the union of every lane's records.

## Integration commits (this branch, in order)

1. `6a2df29` reconcile release+hotfix
2. `54cc644` merge Claude backend lane
3. `fff5d70` merge Codex UI lane
4. `a4b88c3` graduate ports onto durable sources (support→research_member_questions,
   documents→research_plan_documents, orders→the ONE decorated member orders
   service, catalog-priority→audited overlay projection + reviewed base config,
   membership→billing_state-aware) + routes for catalog-priority and
   ownership-scoped document bytes
5. `e42825d` protected seams: server/index.ts registrations (id-bound member
   lookup, UUID batch factory), server/research/index.ts SEN-0023 wall
   admissions, manifest hashes moved with chained dated notes, wall pins
6. `37bc3be` client seams: closed returnTo allowlist + exact return,
   review-gate exemption for the six registered portal routes (bare chrome),
   MEMBER_NAV Account entry, overview mounts the audited availability
   projection + 13-item queue
7. `92655bd` disposable-PG migration rehearsal evidence (docs/research/
   CLIENT_ACCOUNT_MIGRATION_REHEARSAL_2026-08-26.md)
8. `a5591ee` integrated preview harness (scripts/preview-account-portal.ts) + guard suite
9. `07fd479` route census made loud: as-const paths + release-control-plane pin 399/408
10. `371bd70` integrated browser QA packet (docs/review/client-account-final-integration-20260826/)
11. (this commit) fleet records + final release report

## Verification headlines

Full detail and the 29-item report:
docs/research-launch/XENIOS_CLIENT_ACCOUNT_FINAL_INTEGRATION_RC_2026-08-27.md
Browser evidence: docs/review/client-account-final-integration-20260826/
Migration rehearsal: docs/research/CLIENT_ACCOUNT_MIGRATION_REHEARSAL_2026-08-26.md

## What the next session must NOT do without founder approval

Deploy, merge to a release branch, apply
supabase/candidates/20260826_research_client_accounts_blitz.sql (rehearsed,
still unapplied, still unregistered in ledger/DAG), create accounts, send
invitations (0 of 109 imported people are eligible — no contact/consent data),
or activate any product (every pharmacy confirmation remains
VERBALLY_CONFIRMED_PENDING_DOCUMENTATION; live requires the 11-field
documented checklist plus a founder activation approval record).
