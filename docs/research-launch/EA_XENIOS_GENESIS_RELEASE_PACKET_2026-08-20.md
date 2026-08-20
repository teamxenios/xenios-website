# Early Access "Xenios Genesis" Release Packet — 2026-08-20 (DRAFT until SHAs frozen)

> **SUPERSEDED 2026-08-20 by a founder decision: there is no customer-facing
> Early Access password at all.** The Xenios Genesis code is retired before it
> was ever set in production. `/research/early-access` now opens straight into
> the ordering journey, gated by `RESEARCH_EARLY_ACCESS_OPEN_ACCESS=true`.
>
> The hash mechanism below is NOT deleted — the password mode still exists for
> any deployment that wants it, and is still tested — but it is no longer part
> of this journey, and `RESEARCH_EARLY_ACCESS_PASSWORD_HASH` is no longer
> required for Early Access to run. Do not set a Xenios Genesis hash: under open
> access it would gate nothing, and a MALFORMED value is still reported as a
> configuration problem.
>
> Kept for the record of what was decided and why, and because the scrypt format
> and the Render deploy-trigger hazard remain accurate.

Lead-owned. Executes only after the P0 lanes land and gates pass. Founder
approval for the build and this release path was given 2026-08-20; each
production mutation below still executes only as this exact reviewed packet.

## Verified pre-state (probed read-only 2026-08-20)

- `/research/early-access` serves HTTP 200 in production with NO outer research
  password: the narrow route exemption is ALREADY LIVE structurally (SPA route
  bypasses Gateway; every EA customer API door individually wall-admitted;
  67-test wall suite green at c5f866c).
- `/api/research/early-access/session` answers (gate configured+enabled).
- `/api/research/early-access/assisted-orders/config` → `enabled:true`
  (XRR bridge LIVE; required agreement early_access_terms v1).
- Admin order email recipient env already set by the executed Release A packet:
  `RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL=research@xeniostechnology.com`.
- Outbox worker VERIFIED RUNNING in production logs (60s interval, started
  2026-08-19T20:43Z on the live deploy). No send has been attempted this deploy
  epoch, so the Resend transport is UNPROVEN in production. Proof path at
  release: (1) `GET /api/admin/research/system-status` (admin JWT; safe
  booleans report email configuration without sending), then (2) one
  founder-approved `POST /api/admin/research/test-email` to a configured admin
  address (door restricts recipients to that set), then (3) the smoke order's
  two real notifications. Each real send needs the founder's per-send approval.
- Production SHA a66434d9; rollback 458e7284 (flags off first).

## The one-code swap (the only gate change production needs)

Env var: `RESEARCH_EARLY_ACCESS_PASSWORD_HASH`
Format (private-access-password.ts, exact): `scrypt$32768$8$1$<salt b64url>$<digest b64url>`
(N=32768, r=8, p=1, 16-byte salt, 64-byte digest, explicit maxmem).

Procedure at release time (NOT before):
1. Freeze the release SHA; confirm the Render service's canonical branch HEAD
   IS that SHA. HAZARD: a Render env update auto-triggers a deploy of the
   branch HEAD — the swap must never run while the head is ahead of the
   reviewed SHA.
2. Mint the hash LOCALLY from the founder-supplied code (never committed,
   never logged, never echoed into shell history — read via prompt/env):
   scryptSync(code, salt, 64, {N:32768, r:8, p:1, maxmem: 64*1024*1024}).
3. Set `RESEARCH_EARLY_ACCESS_PASSWORD_HASH` via Render env (merge update);
   the triggered deploy IS the activation deploy.
4. Smoke: old code refused; new code unlocks; session cookie minted; lockout
   intact (RESEARCH_EARLY_ACCESS_MAX_ATTEMPTS / LOCKOUT_MINUTES unchanged).
5. Display copy "Xenios Genesis" ships in the release SHA itself (S2 lane).

## Release actions — status at integration head `8b5251e`

DONE:

- [x] **Quantity 100** in the live order lane. Authority row moved from
      `maximumQuantity: null` (no ceiling at all) to 100; M71 makes it durable
      per line with no migration. 11 conformance tests.
- [x] **426-row catalog reconciled against LIVE Product Control** (not the stale
      snapshot). 415 rows already matched; Kisspeptin 10 mg $70.00 → $65.00
      applied through the canonical RPCs and verified superseded/active. See
      `RETAIL_RECONCILIATION_426_2026-08-20.md`.
- [x] **Six worker lanes integrated**, typecheck clean: assisted-order customer
      flow (incl. two P0 defect fixes — form acknowledgments were never sent so
      every real submit was refused 400, and the confirmation route was
      unreachable), canonical order + history, payment lifecycle, fulfillment +
      tracking, affiliate attribution core, public storefront.
- [x] **Landing-page commercialization reverted** (`e05f807`) pending founder
      confirmation; storefront itself stays merged.

PENDING:

- [ ] Manual affiliate code (lane4 + S3) — the last unbuilt P0 link.
- [ ] Email template v2 enrichment (Codex 4).
- [ ] **Mounting**: canonical order, payment, and fulfillment are merged but
      UNMOUNTED by design. Each needs a durable repository and a lead seam
      registration; canonical order additionally needs the same M62 legal-binding
      directory instance the EA order history uses. Their migration candidates
      are founder-gated.
- [ ] Cart-lane quantity chain M65 → M66 → successor (production is still at the
      ORIGINAL 1..3 band; both predecessors PENDING in the ledger).
- [ ] Composed E2E + mobile viewports (Codex 7).
- [ ] Freeze SHA, full gate suite, dark deploy, progressive activation, founder
      smoke.

## Founder decisions required

1. Landing-page commercial CTA: confirm the reversal of the recorded
   nonnegotiable, or leave reverted.
2. Four catalog rows with no canonical variant: Retatrutide 60 mg ($249),
   MOTS-C 40 mg ($129), Glutathione 600 mg ($69) need variant creation;
   CJC-1295 WITH DAC + Ipamorelin ($99) stays non-direct per the founder's own
   ruling until the formulation is confirmed. GRP-0364 "FedEx Standard
   Overnight" is a shipping charge, not a catalog product.

Nothing in this packet may run out of order, and no step invents a missing
secret.
