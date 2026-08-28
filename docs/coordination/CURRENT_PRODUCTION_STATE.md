# Current production state

This document records a read-only production identity reconciliation. It does
not authorize a deployment, migration, data write, account or invitation,
product activation, payment, provider change, or external message.

## Attested deployment identity

| Fact | Read-only observation |
| --- | --- |
| Verified window | Around `2026-08-28T04:01:00Z` |
| Render workspace | `tea-d8nhh6a8qa3s73f4ocj0` |
| Render service | `srv-d8s9vej7uimc7384dfcg` (`xenios-website`) |
| Render deployment | `dep-da6vorqfngtc73brb0gg` |
| Deployment status | `live` |
| Exact deployed commit | `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` |
| Configured branch | `release/early-access-code-session-checkout` |
| Auto-deploy | `false` |
| Public origin | `https://xeniostechnology.com` |

The Render service/deployment read and repository identity agree on the exact
commit above. The source controls therefore use `3daa…` as the one trusted
production baseline. They no longer assume that production must track `main`.
The validator accepts a syntactically safe branch name and can require an exact
externally supplied branch with `XENIOS_EXPECTED_PRODUCTION_BRANCH`.

## Runtime evidence

Fresh, unauthenticated `GET` requests to the public health endpoint and the
Render service origin returned HTTP 200. Runtime configuration reported
`commerceEnabled: false`. Those HTTP observations corroborate the separately
attested deployment's availability and commerce flag; the HTTP payloads did not
themselves cryptographically attest a Git SHA.

## Database posture is unavailable

No database aggregate or managed-migration evidence was refreshed during this
reconciliation. Consequently every database-derived `dataPosture` value in the
JSON snapshot is `null` with `availability: "unavailable"`.

`null` means not observed. It must never be rendered or validated as zero,
disabled, empty, complete, or safe. Older production counts and Care assertions
were retired from current fields rather than silently carried forward. Their
exact dated source is preserved at
`docs/coordination/history/CURRENT_PRODUCTION_STATE_2026-07-30.json` (original
Git blob `322df6d9feb008acc834df2ec0e87e008993e3dc`) and is classified historical,
not current. Per-migration historical evidence remains in `MIGRATION_DAG.json`,
clearly scoped to its own dated observations; it was not re-attested here.

## Preserved historical controls

The exact 2026-07-30 release graph is preserved at
`docs/coordination/history/ACTIVE_RELEASE_GRAPH_2026-07-30.json` (original Git
blob `3915f85c82ed05fcdfc7d43232364c4c0ca7d990`). That archive preserves the
founder authority, safety gates, prior acceptance vocabulary, and supporting
evidence without converting those observations into 2026-08-28 facts.

The current graph carries the founder decision lock, workaround addendum, and
final full-website directive forward as locked authority. Immutable paid-order
evidence and commission/payout activation remain blocked. PR117 (`821bf169…`)
and PR106 (`40d697c7…`) are unresolved historical lineage: their earlier
accepted/pending dispositions are not current acceptance against `3daa…`.
PR144 (`410e6878…`) remains frozen pending founder-locked pricing reconciliation
and independent exact-SHA review.

`FILE_OWNERSHIP.json` and `MIGRATION_DAG.json` retain their original
whole-document `generatedAt` timestamps. Their separate
`productionBaselineReconciledAt` fields scope the 2026-08-28 change only to the
production-baseline reconciliation; no lane assignment, migration application,
or database evidence was re-attested.

## Release gates

- `a1bbc2a186ebbf96cead429a78dc30ffdc811005` is a failed composite RC. It is
  development source only, prohibited from deployment.

- `8e8933cee58af2750edf69d672a463884df29634` contains the separate warm-silver
  editorial homepage work and is not in the failed RC ancestry. Lane 02 and
  Lead must reconcile it deliberately and provide public visual, responsive,
  accessibility, and catalog-guard evidence before a release can pass.

- Candidate integration remains exact-SHA, tested, pushed, and Lead-controlled.
  Nothing in this reconciliation changes production.

## Evidence boundaries

This snapshot proves only the recorded Git, Render, and HTTP facts. It does not
prove current database row counts, migration application state, member/account
continuity, Care readiness, payment readiness, product or variant activation,
fulfillment state, or any other fact that was not observed in the verification
window.
