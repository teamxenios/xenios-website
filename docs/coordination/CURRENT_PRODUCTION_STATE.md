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
were removed from the current snapshot rather than silently carried forward.
Per-migration historical evidence remains in `MIGRATION_DAG.json`, clearly
scoped to its own dated observations; it was not re-attested here.

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
