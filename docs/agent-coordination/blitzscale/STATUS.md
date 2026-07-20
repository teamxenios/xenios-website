# Node status (authoritative)

Input SHA 87150f4. Updated by the coordinator as lanes push milestones.

| Node | Owner | State | Evidence |
|---|---|---|---|
| G0 contracts + capability registry + env validator | coordinator | IN_PROGRESS | this PR seeds GRAPH/CONTRACTS/CAPABILITIES; capability route code pending |
| G1 private access (gateway/application/status/recovery) | main | DONE | PR #25 merged @ 87150f4; 161 tests; boot smoke green |
| G2 application/activation/identity/MFA | Website 2 | OPEN | branch research-paperwork-factory-now @ pushed head (review pending) |
| G3 profile/assessment | Website 2 | OPEN | — |
| G4 Blueprint/plans | Website 2 | OPEN | — |
| G5 tracker/media/support | Website 2 | OPEN | — |
| G6 catalog/Guides/content | Website 3 | OPEN | branch research-product-guide-content-now @ pushed head (review pending) |
| G7 commerce/fulfillment | Website 3 | OPEN | — |
| G8 referrals/affiliate | Website 3 | OPEN | referral ledger already in main |
| G9 frontend | Website | OPEN | branch research-access-ui-rebuild (local, not pushed) |
| G10 Samuel admin | Website 2 + coordinator | OPEN | admin queue in main; capability diagnostics pending |
| G11 integration | coordinator | OPEN | integration branch created when reviewed heads exist |
| G12 security/a11y/release | coordinator | OPEN | — |
| G13 deploy/rollback | coordinator | OPEN | Render access = Samuel |

## Review protocol (per pushed milestone)

fetch branch → compare head to declared base (must be 87150f4 or later) →
inspect changed paths against file-claims → run targeted tests → read handoff
→ verify disabled-provider behavior → verify a test proves the founder decision
→ ACCEPT or return an exact repair prompt. Contract incompatibilities are
caught continuously, not at the end.
