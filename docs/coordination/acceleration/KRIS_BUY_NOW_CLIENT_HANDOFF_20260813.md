# Kris Buy Now client handoff

Base: `85c9f421d276407867b2e469a871cb5bcfef7bfe`

This successor connects a server-approved `direct_eligible` item to the existing
single-product Early Access journey. It does not call the multi-line cart,
settlement, automatic capture, subscription, or a new order store.

The pinned matrix is unchanged:

- total: 420
- direct_eligible: 143
- provider_workflow: 243
- classification_pending: 32
- price_pending: 2
- unknown: 0

## Composition requirement

`purchaseMode` remains the channel-level matrix decision. Buy Now additionally
requires `KrisLegacyOrderSelection`, resolved on the server from an exact,
current Product Control product/variant selection. The member-safe Kris artifact
does not contain those identities and cannot manufacture them. Production must
inject `resolveLegacyOrder` into `buildKrisCatalogProductionDependencies` from
the approved Product Control binding/read model. With no resolver or on any
price, currency, identity, timestamp, or quantity disagreement, `legacyOrder`
is null and the UI renders Pending Activation.

The handoff carries only canonical product/variant identity, the
KRIS_VOLUME_PARTNER unit price, currency, current effective quantity limit, and
evaluation time. Roman Health buyer context is not browser input: the existing
Early Access session/identity chain derives `customerRef` on the server.

The existing order door then revalidates Product Control, active release, price,
quantity, agreements, supplier readiness, and shipping before it creates an
order. The established downstream path remains order -> invoice/payment
instructions -> payment proof -> named-admin confirmation -> supplier release.

## Validation

- focused Buy Now, matrix, catalog, price/privacy and legacy-order tests: 173 pass
- TypeScript: pass
- production build: pass
- route uniqueness: 368 registrations / 359 call sites / 0 duplicates
- production mutation: none

The agreement gate is closed with the founder-confirmed launch value:

`RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS=[{"kind":"early_access_terms","version":"v1"}]`

This successor does not set or change that environment value. Apply it only
after the final release SHA is frozen, tagged `KRIS_LAUNCH_A`, and selected as
the Render deployment source.
