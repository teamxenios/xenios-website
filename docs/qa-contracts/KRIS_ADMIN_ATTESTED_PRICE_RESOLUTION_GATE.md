# KRIS admin-attested price resolution release gate

- Status: **RELEASE HOLD**
- Owner of this gate: Bottom Right / Integration, QA & Release Train
- Runtime owner: Access Identity / Top Right
- Production integrator and deployer: Release Lead only

## Decision

Do not enable `XENIOS_BUYER_SCOPED_PRICING`, certify a Roman partner-priced
order, or describe the KRIS buyer-price path as release-ready until both defects
below are repaired and every exit condition in this contract passes.

This verdict was reproduced on candidate
`31ef0b5be4cc257de085db26bbe49839897a21d1`. The affected production
composition and legal-binding files are unchanged from live release
`8c8ce358263a041f13fb270d7034164a66a04896`.

## Confirmed defect 1: Roman resolves no partner sheet

The staged Roman binding has these durable facts:

- customer ref `eac_c9f70655f7def7d36719fdbb00d13083`;
- canonical member `0f6c3691-0936-49a6-ab10-114a61997474`;
- provenance `admin_attested`;
- attestor `Samuel Boadu, founder, Roman Health Launch A activation`;
- no aliases.

`READY_step5_customer_scope_and_binding.sql` inserted that row directly. The
insert bypassed M62's canonical writer, whose `admin_attested` exception is
limited to founder checkout `XEC-E1703CC63BBE89E6839E24C1`. That checkout is
owned by customer ref `eac_d80e62ad2039e515b943d4d7cb6c2e32`, not the Roman
ref.

Production pricing currently uses
`SupabaseEarlyAccessLegalBindingDirectory.forCustomer()` as if it were a
neutral customer-to-member lookup. It is intentionally a legal-signing policy
seam. For the Roman row it returns exactly:

```json
{"ok":false,"code":"binding_unverified"}
```

`kris-buyer-price-sheet-production.ts` maps that result to no member. The
relationship/role/entitlement bridge is never called, and the provider returns
no buyer sheet. Downstream price resolution therefore restores public ledger
pricing.

Independent production-shaped controls isolated provenance as the cause:

- the exact Roman relationship, role, entitlement, artifact, and unit binding
  with `admin_attested` produced a null sheet;
- changing only provenance to `verified_link` produced the real
  `KRIS_VOLUME_PARTNER` sheet and the known AOD unit at `USD 24.64`;
- making the same `admin_attested` row the founder-checkout owner also produced
  the partner sheet.

Five relevant suites remained green, 67/67, while this production composition
was broken. Stubbed `memberForCustomer` success is not adequate coverage.

## Confirmed defect 2: foreign business key can receive the sheet

`kris-buyer-price-sheet.ts` verifies the profile, version, effective time,
role, and entitlement, but does not require the relationship's
`pricing.businessKey` to be Roman Health.

An independent probe using the committed artifact gave a relationship with
`businessKey="other-organization"` an otherwise exact, active
`KRIS_VOLUME_PARTNER` entitlement. The provider returned the real partner
sheet and `USD 24.64` price. The existing "SECOND ORGANIZATION" test has no
entitlement, so it does not exercise this defect.

Current live evidence reports the entitlement only on the Roman relationship.
That makes this a latent cross-tenant authorization defect, not permission to
defer the fail-closed control.

## Frozen boundaries

The repair must not:

- broaden `SupabaseEarlyAccessLegalBindingDirectory.forCustomer()` for all
  `admin_attested` rows; proof submission, signing, and ownership flows consume
  that policy;
- rewrite append-only activation evidence or relabel the Roman row as
  `verified_link`;
- authorize from email, display name, request fields, or attestor prose;
- accept an alias merely because the inverse directory returned it;
- create a second account, organization, entitlement, pricing, cart, checkout,
  order, or payment architecture;
- change SQL, environment state, deployment state, or production data from a
  specialist session.

The founder-checkout exception in the generic legal directory must remain
byte-for-byte narrow unless a separate, explicit legal-policy decision is
approved and reviewed.

## Required pricing-only successor invariants

Implementation details remain with Access Identity / Top Right, but the
successor must prove all of these invariants:

1. Pricing derives the canonical member from the server-authenticated active
   member for the current request. A configured Roman member ID may add an
   exact equality pin, but it is never a config-only substitute for the request
   principal. Missing or mismatched authority fails closed. Browser identity
   fields and email are never inputs.
2. The existing M67 inverse lookup must establish that the requested,
   server-derived primary customer ref belongs to that exact canonical member.
   Failure, absence, a foreign ref, or an unexpected additional/alias handle
   fails closed for this exception.
3. The relationship must have
   `pricing.businessKey === ROMAN_HEALTH_BUYER_KEY` (`roman-health`).
4. Existing checks remain required: one active, unmigrated relationship; at
   least one qualifying active role under the current provider predicate
   (`organization_owner` or `business_buyer`); one active current
   `KRIS_VOLUME_PARTNER` entitlement; accepted artifact
   SHA/version/effective-time; and exact unit bindings.
5. The order door retains its separate verified session/customer ownership and
   provenance requirements. Reaching the Roman ref alone must not authorize an
   order or a price.
6. Nulls, lookup errors, duplicates, stale facts, and configuration drift must
   restore only public pricing without leaking the private sheet or its
   entitlement metadata.

## Required automated evidence

### Production composition

Add `server/research/account-identity/kris-buyer-price-sheet-production.test.ts`
or an equivalently production-shaped suite. It must use the actual production
binding composition rather than a direct success stub and prove:

- the exact Roman tuple above resolves the accepted artifact and the known AOD
  unit to exactly `2464` cents, `USD`;
- the founder checkout remains owned by its legacy customer ref;
- unset/wrong canonical member authority, M67 failure, missing Roman ref,
  extra/alias ref, a bearer-member/customer mismatch, a foreign member, and
  arbitrary `admin_attested` rows return no sheet;
- a copied attestor string or matching email confers no authority.

### Provider tenant isolation

Extend `server/research/account-identity/kris-buyer-price-sheet.test.ts` with a
fully valid negative control: an active `other-organization` relationship with
the exact active KRIS entitlement and artifact pins must still return no sheet.
The test must fail against the pre-repair provider.

Also retain negatives for duplicate relationships/entitlements, inactive or
migrated relationships, no qualifying role or a billing-viewer-only role,
suspended/revoked/expired/not-yet-effective entitlements, wrong
version/effective instant, and artifact drift.

### Generic legal-policy freeze

Extend
`server/research/early-access/legal/supabase-legal-binding-directory.test.ts`
to prove:

- the exact founder-checkout attestation remains accepted;
- Roman's staged row remains rejected by generic `forCustomer()`;
- an arbitrary ref with Roman's exact attestor text remains rejected;
- missing or wrong founder-checkout ownership remains rejected.

### Mounted shelf and order door

Add a release-level HTTP test, preferably
`server/research/early-access/routes/roman-admin-attested-price-resolution.test.ts`,
that uses the repaired production provider and proves:

- the exact Roman bearer/session/customer path sees the same partner price on
  shelf and order door;
- submitting the public amount for that partner-priced unit returns exact
  `409 PRICE_CHANGED` with the partner amount;
- submitting the exact partner amount commits partner-priced money under the
  Roman customer ref;
- arbitrary admin, founder legacy customer, foreign member/organization,
  email-only identity, weak session provenance, and forged body hints cannot
  obtain the sheet or place a partner-priced order;
- a Roman customer session paired with a different active member bearer fails
  closed rather than inheriting either principal's price or ownership;
- serialized responses contain no supplier cost, margin, provenance, artifact
  source, private entitlement, or foreign-customer data.

### Credential-seam dependency before Buy Now

The pricing repair alone does not make the mounted Kris Buy Now journey usable.
The Kris detail uses a canonical member bearer, while the Early Access
agreement, cart, order, invoice, status, and proof doors use an HttpOnly Early
Access session cookie. Adding `Authorization` only to final order placement
would leave the earlier doors split and can make the base session customer win
before the outer member bridge.

Before Buy Now activation, the owning runtime lane must preserve the existing
password-unlock cookie and prove one fail-closed identity composition across
every door. Required controls are:

- cookie plus active member bearer resolves one exact customer across
  agreement, cart, order, invoice, status, and proof;
- bearer without the required Early Access session remains
  `SESSION_REQUIRED`;
- cookie alone receives no member/partner elevation;
- recovery, inactive, foreign-member, and session/member mismatch cases are
  refused;
- the session-identity flag is exercised in both states without changing
  ownership;
- bearer material never appears in a body, URL, browser storage, log, or
  serialized response.

## Release exit criteria

The hold can be reconsidered only when:

1. both confirmed defects have a reviewed successor SHA and the planted
   pre-repair negative controls demonstrably fail on the old code;
2. all focused suites, TypeScript, diff check, and relevant broader commerce
   suites pass from a clean, pushed candidate;
3. Bottom Right independently reproduces the exact Roman positive at `2,464`
   cents (`USD 24.64`) and every foreign/admin/legacy/weak-provenance negative;
4. the release lead integrates the reviewed SHA and verifies the deployed SHA;
5. a real signed-session shelf/order smoke passes without fabricated auth,
   payment, entitlement, or production data;
6. the incomplete cart/credential seam remains disabled or is separately
   repaired and certified before Buy Now activation.

This gate certifies only buyer-price resolution and isolation. It does not
clear the separate 1,121-master mount, EA cookie-plus-bearer credential,
supplier quantity-50, durable Q101/request, catalog breadth, or founder-action
holds.

— Codex Bottom Right (Integration, QA & Release Train)
