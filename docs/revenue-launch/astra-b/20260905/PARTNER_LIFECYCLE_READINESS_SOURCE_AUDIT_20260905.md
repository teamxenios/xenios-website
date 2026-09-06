# Partner Lifecycle Readiness — Corrected Source Audit

Date: 2026-09-05 (America/Chicago)

This is a read-only source audit for the paired revenue-launch review. It
records confirmed boundaries and corrects an earlier tentative finding.

## Corrected finding

The earlier UUID concern is **not current**. In
`server/research/commerce/production-deps.ts`, `applyForMember` now passes
`randomUUID()` to the durable partner-member store. The store maps that value
to `research_partners.id`, whose production type is UUID. No code change is
requested for this item.

## Confirmed application-data gap

`client/src/research/pages/partners/Apply.tsx` collects `audience` and
`channels` and includes them in the client request. The server contract
`PartnerApplyWireInput` in `server/research/commerce/routes.ts` accepts only
`role`, `legalName`, and `contactEmail`; `parsePartnerApply` drops the extra
fields before calling `applyForMember`. Therefore those answers are not durable
review evidence. This remains a bounded follow-up requiring coordinated changes
to the server/shared contract and durable persistence; ASTRA-B does not modify
ASTRA-A-owned backend paths in this handoff.

## Confirmed lifecycle boundary

The portal production adapter deliberately returns `capability_disabled` for
unprovisioned durable lifecycle writes. The partner portal routes expose
onboarding/training reads with truthful unavailable behavior, while certification
and activation still require durable requirements evidence and explicit admin
authority. A UI state or client-submitted flag must not be treated as proof of
identity, tax, payout, agreement, training, certification, or activation.

## Release implication

This audit does not establish partner/referral production readiness. Keep the
following gates explicit: durable lifecycle persistence and authority, current
requirement-version evidence, supplier confirmation, inventory/capacity, exact
release approval, and production migration readiness. No deployment, migration,
price activation, flag change, account grant, payment, or communication was
performed.
