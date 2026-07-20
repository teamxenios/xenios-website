# Shared API contracts (freeze target)

Rule: inspect existing repo patterns and extend ADDITIVELY. The canonical
types already live in `shared/research/*` (membership-types, referral-types,
types, recovery, paths). New lanes import and extend these; contract-level
changes to the barrels go through the coordinator.

## Frozen envelope conventions (match merged code)

- Success: handlers return `{ ok: true, ... }` (research) / `{ success: true }`
  (legacy admin). New research endpoints use `{ ok: true, <payload> }`.
- Denials carry a machine code: `requireActiveMember` returns
  `{ ok:false, code:"activation_required"|"billing_past_due"|"billing_*"|
  "membership_inactive" }`; recovery-purpose sessions return
  `{ ok:false, code:"recovery_session" }`. UI routes on `code`.
- No-store + no-referrer on member/admin/sensitive JSON (already enforced).

## Entities to freeze (extend shared/research/*)

`ApiResponse<T>`, `CapabilityStatus`, `ResearchFeatureFlags`, `ApplicationState`
(the 12-status machine — already in membership-types), `MembershipState`
(`MEMBER_STATUSES`/`MEMBER_BILLING_STATES` — already added by PR #25),
`AgreementDefinition`/`AgreementAcceptance`, `MemberProfile`,
`AssessmentDefinition`/`AssessmentResponse`, `Blueprint`, `Xenios30Plan`,
`Xenios90Plan`, `PlanDocument`, `TrackerObservation`, `PrivateMediaRecord`,
`Product`/`ProductAvailability` (Product exists in shared/research/types),
`Guide`/`GuideStatus`, `InventoryLot`, `Cart`/`Order`/`ProductSubscription`,
`ShippingQuote`, `FulfillmentOrder`, `ReferralLedgerEntry`/`Partner`/
`CommissionLedgerEntry` (referral-types exists), `AdminQueueItem`, `AuditEvent`.

## Capability contract (G0, to implement)

```ts
type CapabilityStatus = { enabled: boolean };            // member-safe: boolean only
type CapabilitiesResponse = { ok: true; capabilities: Record<string, CapabilityStatus> };
// admin diagnostics may add { missingEnv: string[]; approval: string } — NAMES ONLY, no values
```

## Freeze protocol

Detailed request/response payloads for each PLANNED route (ROUTE_MANIFEST.md)
are frozen HERE with an example payload BEFORE any UI or cross-lane consumer
builds against it. Freeze happens as each backend lane pushes its first
milestone, so contracts match reality rather than being invented up front.
Until frozen, a payload is marked `DRAFT` and consumers must not depend on it.
