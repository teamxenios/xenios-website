# Production deploy record — Early Access repair, 2026-08-20

Executed by: claude-fable-desktop (lead / release owner), on the founder's
explicit GO for this exact reviewed candidate.

## Identity

| | |
|---|---|
| **Deployed SHA** | `0aba72675297f5d8fadeb91af4acbaff7026d30c` |
| **Deploy ID** | `dep-da3jslflk1mc7383pae0` |
| **Service** | `srv-d8s9vej7uimc7384dfcg` (xenios-website) |
| **Branch** | `release/early-access-code-session-checkout` |
| **Previous SHA / ROLLBACK** | `a66434d980c909303d3595382e5df77342fbc127` |
| **Prior rollback target** | `458e7284c12cfbd95bd91371afb88cb8a6201454` |
| Started / finished | 2026-08-20T17:50:13Z → 17:51:08Z, status `live` |

## Pre-flight, all verified before the push

1. Production predecessor was still exactly `a66434d9`. ✓
2. `0aba726` was still the exact frozen RC. ✓
3. Clean fast-forward: predecessor is an ancestor, 61 commits gained. ✓
4. Full suite green at that SHA: 682 files passed, 4 skipped, **0 failed**;
   `tsc --noEmit` clean. ✓
5. **No migration in range** — `git diff a66434d9..0aba726 -- supabase/migrations/`
   is empty. Nothing to reverse on rollback. ✓

## Flags and environment

**None changed.** No flag was flipped and no environment variable was set as
part of this deploy. Everything new in the range is unmounted or already
enabled; the repair takes effect through code alone. `RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED`
was already true, and remains true.

## Post-deploy smoke — existing surfaces

| Surface | Result |
|---|---|
| `/api/health`, `/`, `/research`, `/research/early-access` | 200 |
| `/api/research/early-access/session` | 200 |
| `/api/research/early-access/assisted-orders/config` | 200, `enabled:true` |
| `/api/admin/research/outbox`, `/api/admin/research/assisted-orders` | 401 |
| `/api/research/member/me`, `/cart`, `/orders` | 401 |
| Boot logs | assisted order bridge mounted; outbox worker started (60s); **zero errors or warnings** |

## Post-deploy proof of the repairs

- **Wall admission (claims/subscriptions).** `/api/research/subscriptions` and
  `/api/research/claims` now answer `"Sign in required."` — their own member
  guard — instead of the wall's `"Access required."`. `POST` to both still
  answers `"Access required."`, so the reads-only admission held exactly.
- **Confirmation route fix** is present in the deployed
  `AssistedOrderPage` chunk (`order-request/confirmation/` path form).
- **Form-acknowledgment fix** is present in the deployed `assisted-order`
  chunk (`formAcknowledgments`).
- **Agreement configuration resolves live**: the config door serves
  `early_access_terms v1` plus all four form acknowledgments (accuracy,
  contact_consent, request_notice always; research_use_only conditional) — the
  exact set the server enforces and the client now sends.

## Rollback

Flags first (none to turn off here), then redeploy `a66434d9`. No migration is
involved, so no database state has to be reversed. The Kisspeptin price
($70.00 → $65.00) is a separate, superseded-and-auditable Product Control change
and would be reverted only on request.

## Named missing production setting

`RESEARCH_EARLY_ACCESS_LEGAL_PACKAGE` is **not set**. The boot log states it
plainly: *"no Early Access legal package is designated. Every agreement
checkpoint, including payment-proof submission, refuses until a named human
designates one."*

This gates the **Early Access CART / payment-proof** lane (Release B), not
today's XRR assisted-order journey, whose own legal set resolves — the config
door proves it by reporting `enabled:true` with its exact required agreement
version rather than reporting itself disabled. Recorded here because it is the
one named setting a human must designate before the cart-side agreement and
payment-proof checkpoints can accept anything.
