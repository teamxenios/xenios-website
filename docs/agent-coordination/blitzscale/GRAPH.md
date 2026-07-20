# Xenios Research — Supreme Build Graph

Owner: CLAUDE_INTEGRATION_COORDINATOR. Input SHA: origin/main **87150f4**
(post-PR-#25). Build-first / keys-later: every external capability ships as a
provider-neutral interface + disabled + test provider + default-false flag; a
node is `DONE_BEHIND_DISABLED_PROVIDER` when its full path is complete and
safely off. No node weakens the merged PR #25 auth/recovery/outbox/member work.

## Terminal states

`DONE` · `DONE_BEHIND_DISABLED_PROVIDER` · `BLOCKED_BY_CREDENTIAL` ·
`BLOCKED_BY_EXTERNAL_APPROVAL` · `BLOCKED_BY_SUPPLIER_DATA` ·
`BLOCKED_BY_DEPENDENCY` · `NEEDS_SAMUEL_DECISION` · `FAILED_WITH_EVIDENCE`

## Groups and nodes

| Group | Node | Owner (window) | Depends on | Key external gate |
|---|---|---|---|---|
| G0 foundation | contracts+capability registry+env validator | PowerShell (coordinator) | — | — |
| G1 private access | gateway, application intake, status, recovery (MERGED) | — (in main) | G0 | — |
| G2 application/activation | identity, agreements, activation, MFA | Website 2 | G0,G1 | identity provider, MFA config, Stripe |
| G3 profile/assessment | member profile, assessment, responses | Website 2 | G2 | — |
| G4 Blueprint/plans | Blueprint, Xenios 30, Xenios 90, plan docs | Website 2 | G3 | — |
| G5 tracker/docs/support | tracker, private media, questions, Telegram | Website 2 | G3 | private storage, Telegram token |
| G6 catalog/Guides | products, availability, Guides, content | Website 3 | G0 | — |
| G7 commerce/fulfillment | cart, orders, subscriptions, shipping, fulfillment | Website 3 | G6,G2 | Stripe, carriers, Mitch |
| G8 referrals/affiliate | referral ledger, partners, commissions, payouts | Website 3 | G2 | payout processor |
| G9 frontend | all Research presentation + member/admin UI | Website | G1-G8 contracts | — |
| G10 Samuel admin | admin queues, diagnostics, capability status | Website 2 + coordinator | G0 | — |
| G11 integration | integrate reviewed heads on integration branch | PowerShell | all lanes | — |
| G12 security/a11y/release | authz matrix, a11y evidence, secret/PII scans | PowerShell | G11 | — |
| G13 deploy/rollback | preflight, migration order, Render, smoke, rollback | PowerShell | G12 | Render access (Samuel) |

## Per-node loop

DISCOVER → DEFINE ACCEPTANCE TESTS → IMPLEMENT → RUN TESTS → ADVERSARIAL
REVIEW → REPAIR → RUNTIME/VISUAL PROOF → COMMIT → UPDATE HANDOFF → STOP.
After two same-cause failures change hypothesis; after three distinct failed
approaches stop the node `FAILED_WITH_EVIDENCE` and continue independent nodes.
The implementer is never the sole verifier (separate review subagents).

## Current node states

See STATUS.md (authoritative, updated as lanes push). At this input SHA: G0
in progress (this PR seeds contracts + capability plan); G1 DONE (merged);
all others OPEN, owned, unblocked to start against 87150f4.
