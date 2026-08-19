# Lane B integration: the affiliate attribution spine, live-capable

Branch `lane/launch-affiliate-spine`. This document carries every wiring line
Lane B could not make itself because the target files are protected seams
(`server/index.ts`, `server/research/early-access/**`,
`docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json`). Everything below is
ready-to-paste and references only code that exists on this branch.

## What Lane B shipped (no wiring required)

| Piece | File |
| --- | --- |
| Referral capture doors (`GET /r/:code`, `GET /api/research/referral/capture?ref=`) as a transport-neutral descriptor table + Express adapter | `server/research/partners/referral-capture-routes.ts` |
| Signed attribution cookie mint/verify (`xr_aff`, HMAC over the partner link secret, constant-time, versioned, expiring) | `server/research/partners/attribution-cookie.ts` |
| Typed affiliate program config with the founder's 2026-08-16 seed (20% first / 7.5% repeat months 2-12 / 21-day hold / $50 minimum / biweekly Friday) and the fail-closed `AFFILIATE_PROGRAM_ENABLED` parser | `shared/research/affiliate-program/config.ts` |
| Assisted-order server-side attribution: submit derives `affiliateAttributionRef` ONLY from the verified cookie; body values are ignored | `server/research/assisted-order/{http,service,ports}.ts` |
| Commission accrual bridge (pure, unmounted): settled-payment fact -> Gen 2 ledger accrual `pending` -> `held` | `server/research/partners/accrual-bridge.ts` |
| System-actor maturation hold on the commission service (`holdForMaturation`, additive) | `server/research/partners/commissions.ts` |

**SQL: none.** The spine writes only to existing tables
(`research_partner_links`, `research_attribution_touches`,
`research_commission_ledger`) and the existing `affiliate_attribution_ref`
column on the assisted-order table (M71). No files were added under
`supabase/candidates/` or `supabase/migrations/`.

## Environment (founder-gated, every flag fails closed)

| Variable | Effect | Gate |
| --- | --- | --- |
| `RESEARCH_PARTNER_LINK_SECRET` | Signs/verifies partner codes AND the attribution cookie. Absent = no capture, no cookie, no verified ref, anywhere. | Founder sets in production only. |
| `AFFILIATE_SYSTEM_ENABLED` + `AFFILIATE_CODES_ENABLED` | Permits the capture doors to MOUNT (`affiliateCodesEnabled`). | Exact string `"true"`, both. |
| `AFFILIATE_SYSTEM_ENABLED` + `AFFILIATE_PORTAL_ENABLED` | Permits the partner portal to MOUNT (`affiliatePortalEnabled`). | Exact string `"true"`, both. |
| `AFFILIATE_PROGRAM_ENABLED` | Activates the ECONOMICS: `resolveAffiliateProgram` returns the founder seed instead of null, which is the only thing that lets the accrual bridge write money. | Exact string `"true"`. **Founder approval required before setting; nothing auto-activates.** |

## (a) server/index.ts — mount lines

> **Core-protection manifest note (must accompany this edit):**
> `server/index.ts` is a protected seam whose content hash is pinned in
> `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json`. The lines below and the
> refreshed manifest hash must land in the SAME commit, by the release
> authority that owns the manifest, or the core-site protection tripwire
> fails. Lane B deliberately did not touch either file.

### Imports (top of `server/index.ts`)

```ts
import {
  affiliateCodesEnabled,
  affiliatePortalEnabled,
} from "./research/affiliates/v2/feature-flags";
import {
  createReferralCaptureRouteTable,
  referralCaptureExpressHandler,
} from "./research/partners/referral-capture-routes";
import {
  createAttributionService,
  createInMemoryAttributionRepository,
} from "./research/partners/attribution";
import { verifiedAttributionRefFromCookieHeader } from "./research/partners/attribution-cookie";
import {
  resolveAttributionTouchStore,
  resolvePartnerLinkStore,
} from "./research/commerce/persistence/partners-store";
import {
  DEFAULT_LAUNCH_PROGRAM,
  resolveAffiliateProgram,
} from "@shared/research/affiliate-program/config";
import { registerPartnerPortalApi } from "./research/partners/portal-routes";
import {
  partnerSubmissionsEnabled,
  resolvePartnerPortalPort,
} from "./research/partners/portal-production";
```

### Referral capture doors (place directly after `registerCommerceApi(...)`)

```ts
// The affiliate attribution capture doors. Double-gated by env exactly like
// the portal below; with the flags off, no route exists at all. The secret is
// the fail-closed core: without RESEARCH_PARTNER_LINK_SECRET the doors still
// answer (302 / 204) but capture nothing.
const partnerLinkSecret = process.env.RESEARCH_PARTNER_LINK_SECRET ?? null;
if (affiliateCodesEnabled(process.env)) {
  // verifyCode and deriveSubjectKey are pure over the secret; this service
  // instance never touches its repository, so the in-memory one is only a
  // constructor requirement. Durable state lives in the two stores below.
  const referralAttribution = createAttributionService({
    repository: createInMemoryAttributionRepository(),
    linkSecret: partnerLinkSecret,
    linkBaseUrl:
      process.env.RESEARCH_PARTNER_LINK_BASE_URL ?? "https://xeniostechnology.com",
  });
  const referralRoutes = createReferralCaptureRouteTable({
    linkSecret: partnerLinkSecret,
    attribution: referralAttribution,
    links: resolvePartnerLinkStore(),
    touches: resolveAttributionTouchStore(),
    // Cookie lifetime and attribution window only. Money stays behind
    // AFFILIATE_PROGRAM_ENABLED inside the accrual bridge; an inactive
    // program still captures honest touches under the seed's window.
    program: resolveAffiliateProgram(process.env) ?? DEFAULT_LAUNCH_PROGRAM,
  });
  for (const referralDescriptor of referralRoutes) {
    app.get(referralDescriptor.path, referralCaptureExpressHandler(referralDescriptor));
  }
  log("affiliate referral capture doors mounted", "affiliates");
}
```

### Partner portal (place directly after the block above)

```ts
// The Gen 2 partner portal read surface: 16 authenticated, member-guarded
// read paths. Mount-gated twice (system AND portal flags); the guard is the
// SAME merged member guard the commerce lane injects — no parallel auth.
if (affiliatePortalEnabled(process.env)) {
  registerPartnerPortalApi(
    app,
    { port: resolvePartnerPortalPort(), submissionsEnabled: partnerSubmissionsEnabled() },
    { requireMember: adaptGuard(requireMember) },
  );
  log("partner portal mounted", "affiliates");
}
```

### Assisted-order attribution (edit the existing call at ~line 686)

The route table now takes an optional third argument. Change:

```ts
  const assistedOrderRoutes = createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(
    assistedOrderComposition.service,
    assistedOrderViewers,
  );
```

to:

```ts
  const assistedOrderRoutes = createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(
    assistedOrderComposition.service,
    assistedOrderViewers,
    // Server-derived affiliate attribution: the verified xr_aff cookie is the
    // ONLY source of affiliateAttributionRef. No secret configured -> always
    // null. The body never participates; the service ignores it outright.
    {
      resolve: (cookieHeader) =>
        verifiedAttributionRefFromCookieHeader(partnerLinkSecret, cookieHeader, new Date()),
    },
  );
```

(If the assisted-order block sits above the capture block, hoist the
`partnerLinkSecret` const so both read the same value.)

## (b) Early Access customer-bind adapter (EA lane implements; snippet only)

At the moment the Early Access flow binds a session to a durable customer
identity, the EA lane can translate the verified attribution cookie into its
referral-grant write. Lane B provides the verified claims; the grant write and
its placement belong to the EA lane.

```ts
// Somewhere the EA lane owns, at customer-bind time.
import { verifiedAttributionFromCookieHeader } from "../partners/attribution-cookie";
import type { AffiliateProgramConfig } from "@shared/research/affiliate-program/config";

export type ReferralGrantInput = Readonly<{
  partnerId: string;
  /** The opaque subject key the capture touch was written under. */
  subjectKey: string;
  /** The link code that was clicked, for audit continuity. */
  capturedVia: string;
  capturedAt: string;
}>;

/**
 * Verified cookie -> referral-grant input, or null. Fails closed on a missing
 * secret, a forged or expired cookie, and a self-referral when the program
 * denies one. `boundPartnerIdOfCustomer` is the partner id owned by the
 * customer being bound, when the EA lane knows it (self-referral check).
 */
export function referralGrantFromAttributionCookie(
  linkSecret: string | null,
  cookieHeader: string | undefined,
  program: AffiliateProgramConfig,
  boundPartnerIdOfCustomer: string | null,
  now: Date,
): ReferralGrantInput | null {
  const claims = verifiedAttributionFromCookieHeader(linkSecret, cookieHeader, now);
  if (!claims) return null;
  if (
    program.selfReferralPolicy === "denied" &&
    boundPartnerIdOfCustomer !== null &&
    boundPartnerIdOfCustomer === claims.partnerId
  ) {
    return null;
  }
  return {
    partnerId: claims.partnerId,
    subjectKey: claims.subjectKey,
    capturedVia: claims.code,
    capturedAt: claims.issuedAt,
  };
}
```

The EA lane then persists its grant from `ReferralGrantInput` in its own
storage. Nothing in this adapter writes; a null return means "bind with no
referral", never an error.

## (c) Commission accrual bridge — the settlement seam

`createAffiliateAccrualBridge` (`server/research/partners/accrual-bridge.ts`)
is pure and unmounted: it exports one factory and no HTTP surface. The ONLY
intended caller is the Early Access / assisted-order settlement seam, at the
moment an order reaches `paid` with canonical payment-verification evidence
(the same evidence gate `evidenceRequired` enforces for the `paid` status).

```ts
// At the settlement seam (EA lane / admin status transition to "paid"),
// AFTER payment verification evidence is recorded. Server-side only.
import { createAffiliateAccrualBridge } from "../partners/accrual-bridge";
import { resolveCommissionLedgerStore } from "../commerce/persistence/commissions-store";
import { resolveAffiliateProgram } from "@shared/research/affiliate-program/config";

const affiliateAccruals = createAffiliateAccrualBridge({
  // Null while AFFILIATE_PROGRAM_ENABLED !== "true": every fact is refused
  // with commissions_disabled. This is the founder's activation gate.
  program: resolveAffiliateProgram(process.env),
  ledger: resolveCommissionLedgerStore(),
  // The canonical partner lifecycle state, by partner id. The composition
  // root already holds a PartnerRepository (portal-production wiring):
  loadPartnerState: async (partnerId) =>
    (await partnerRepository.get(partnerId))?.state ?? null,
  newId: () => randomUUID(),
});

// For an order whose stored affiliateAttributionRef is non-null:
const outcome = await affiliateAccruals.onSettledPayment({
  orderRef: requestId,                          // the canonical order/request id
  partnerId: storedAffiliateAttributionRef,     // from the durable column, M71
  basisCents: eligibleNetCents,                 // integer cents, computed via
                                                // eligibleNetRevenueCents upstream
  ordinal: isFirstAttributedOrder ? "first" : "repeat",
  monthsSinceFirstOrder,                        // required for "repeat"
  paymentSettled: true,
  paymentReference: paymentVerificationId,      // the provider's own reference
  laneCommissionEnabled,                        // honest per-lane answer;
                                                // peptides/Quantum stay false
  settledAt: new Date(),
});
// outcome.ok === false carries named denials; a replayed webhook returns the
// original accrual (`replayed: true`) and appends nothing.
```

Guarantees the bridge's tests pin: unpaid never accrues (the fact type cannot
express it, and an empty reference is refused); duplicates are idempotent; a
zero-rate repeat (outside months 2-12) refuses rather than writing a 0-cent
entry; an inactive/unknown partner refuses; a disabled lane refuses; and the
module exposes no route a browser could reach.

## Verification gates run on this branch

- `npx vitest run server/research/partners server/research/assisted-order server/research/commerce/persistence shared/research`
- `npm run check` (tsc, clean)
