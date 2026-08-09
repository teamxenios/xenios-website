# Early Access hardening: the frozen shared contract

Base: `541b1049e3bee188ee2719f369e6513ae7123786` (the accepted release, and the
SHA production is running).

This document is the lane base instruction. Every hardening lane branches from
the commit that adds this file, builds against the two contract modules it
describes, and proposes changes to them through its handoff rather than editing
them directly.

## The two modules

| Module | Audience | Holds |
|---|---|---|
| `shared/research/early-access-hardening.ts` | browser-facing | order stage, customer submission view, signing start union, agreement standing view, ship-by arithmetic, catalog roadmap vs live commerce |
| `server/research/early-access/hardening-contract.ts` | server only | legal binding, agreement package and standing, proof metadata, internal email state, admin submission view, settlement refusals, founder compatibility |

The split is structural. A type that names a provider message id or an internal
recipient is not reachable from the client bundle, because it is not in
`shared/`. That is the guarantee, not a review habit.

Neither module contains a route, a store, a migration or a component. Importing
either one cannot change behavior.

## What the contract settles

### Early Access identity is not legal signer identity

`SignatureRecord.memberId` is the only identity a signature can carry
(`server/research/membership-activation/signatures.ts`). An Early Access
customer is a `customerRef`, an opaque session handle whose `boundBy`
provenance may be as weak as `email_entry`
(`server/research/early-access/routes/ports.ts`).

`EarlyAccessLegalBinding` is the durable bridge. Only `verified_link` may
authorize signing. `admin_attested` exists for the pre-existing founder
checkout alone and requires a named human on the record. Aliases are carried so
verifying an identity never orphans an earlier order, and `ownsCheckout` makes
sure another member can never satisfy someone else's order.

"Resolves to a member" is weaker than it sounds and is not the assurance here.
The activation signing routes use `requireMember`, which admits
`pending_activation` and `paused` and refuses only `closed`, and identity
document verification gates the payment path rather than the signing path. The
binding is therefore its own durable fact with its own provenance, not an
inference from the presence of a member row.

### The agreement package is recomputed, never remembered

A stored `complete = true` can lie in three ways: the required set can change,
a version can be republished with reacceptance, and a row can have been written
by a different member. `EarlyAccessAgreementStanding` is therefore recomputed
from immutable signature records every time, which is what
`SignatureService.requiredAgreementsSatisfied` already does, and it carries the
`packageVersion` it was computed against so drift is detectable.

Attestations are append-only and supersedable, and they record the REAL
signature timestamps from the legal records, never the proof-upload time.

Re-checked at four points, named in `EARLY_ACCESS_AGREEMENT_CHECKPOINTS`:
quote, checkout, proof submission, settlement.

The membership of the package is a founder and legal decision. A lane resolves
it from the existing registry (`DOCUMENT_CATEGORY_REGISTRY`, sixteen
categories, with arbitration and the membership covenant slot already flagged
`requiresSeparateAcknowledgment`). A lane does not choose which documents apply.

### Signing is a union, not a URL

`EarlyAccessSigningStart` is `native` (the in-page typed or drawn signer this
repository already has, which produces a real `SignatureRecord`, a signed PDF
and a completion certificate) or `provider_hosted` (OpenSign). Field names
follow the existing engine, so the arm carries `signingUrl` and
`signingRequestId` exactly as `CreateSigningSessionResult` does.

There is no `returnUrl` and no `redirectUrl`. The provider path here is
webhook-driven: it sets the session redirect to null on purpose and advances
state only from a verified webhook. Coming back from a signing flow is not
evidence of having signed.

A grep of this tree for Host-derived URL construction (`req.headers.host`,
`req.protocol`, `x-forwarded-host`, `req.hostname`, `req.get("host")`) returns
nothing. The only `x-forwarded-*` reads are client-IP derivation. That hazard
is an accelerator hazard, not a repository one, and this contract is how it
stays that way.

Note for the legal lane: an OpenSign completion never creates a
`SignatureRecord`. It satisfies the gate as an ephemeral `EsignAcceptance`
recomputed per call, so any code reading signature timestamps must handle both
sources.

### The cart already leaks supplier identity to customers

This one is a defect at the accepted base, not an accelerator hazard.
`EarlyAccessCartChildOrder` and `EarlyAccessCartChildRelease` both carry
`supplierId` and `supplierSku`, and both reach the customer: the read route's
`checkoutView` strips ownership fields and passes `children` through untouched,
and the status route returns the store's result verbatim.

`EARLY_ACCESS_CART_FORBIDDEN_CUSTOMER_KEYS` and `cartCustomerPayloadIsClean`
name and test the rule. It is kept separate from the submission list, because
merging them would let a fix for one silently satisfy the other's assertion.

### Customer and admin submission projections are different types

`EarlyAccessSubmissionCustomerView` carries only what the customer supplied or
was shown. `EARLY_ACCESS_SUBMISSION_FORBIDDEN_CUSTOMER_KEYS` names the fields
that must never appear on a customer payload, and `customerPayloadIsClean`
walks nested objects and arrays, because the leak this prevents was a nested
submission blob rather than a top-level field.

`EarlyAccessSubmissionAdminView` is the counterpart, produced by a separate
query.

### Payment proof: bytes are transient, the method is not a guess

Bytes exist inside one bounded request and the provider send. Never the
database, storage, the outbox, the filesystem or a log. There is nowhere on
`EarlyAccessProofSubmissionRecord` to put a file.

The method comes from this checkout's own resolved
`EarlyAccessPaymentInstructionsPresentation`, which the server already builds
from configuration plus the protected registry. There is no hardcoded method
list and no default. The repository's closed vocabulary has seven codes, not
the five the accelerator assumed.

### Internal email: acceptance is not delivery, failure is not absence

`accepted` means the provider took the message, so customer-facing wording says
accepted or queued. `unknown` covers the case the accelerator lacked: the
provider accepted and the confirming write failed. The bytes are gone, the send
cannot be safely repeated, and claiming `failed` would tell an operator no
email exists when one may be sitting in the inbox. `unknown` is honest, and it
is a work item for a named human.

### One settlement door

```
POST /api/admin/research/cart/:cartCheckoutNumber/confirm-payment
```

behind the existing `requireSupabaseAdmin` guard, served by
`createEarlyAccessCartConfirmPaymentAdminRoute`, calling `settleEarlyAccessCart`,
which commits atomically and then runs the existing
`EarlyAccessCartNotifier.settled`. A second route calling the settlement port
directly bypasses that notifier, and the notification is how the customer and
the suppliers find out. Extend this door. Do not add one.

Existing refusals are frozen: `input_invalid`, `checkout_unknown`,
`evidence_missing`, `amount_mismatch`, `transaction_id_used`, `already_settled`
(the replay answer, which carries the original settlement). Hardening adds six,
listed in `EARLY_ACCESS_SETTLEMENT_REFUSALS_ADDED`. Additive only.

Admin confirmations are durable, not two checkboxes that vanish with the
screen. Transaction ids are unique on a canonical form, because case and
whitespace differences are cosmetic and letting them through records one
payment twice.

### Ship-by

`shipByAt = paymentVerifiedAt + 72 hours`, both server timestamps, computed by
the database from its own clock. `earlyAccessShipByAt` exists so the client,
the tests and the server agree on the arithmetic; it is UTC in and UTC out, so
a locale or a DST boundary cannot move a shipping commitment. Overdue is
derived, never stored as a stage, and a shipped order is never overdue.

### Catalog: two orthogonal fields

`roadmapStage` is a human statement of intent. `liveCommerce` is the projection
of the existing purchase authority (`evaluatePurchaseEligibility` in
`shared/research/catalog.ts`). `canAddToCart` reads only `liveCommerce` and the
presence of a live `EarlyAccessAddToCartAuthority` carrying a real
`productId`, `variantId` and current server price. It never reads
`roadmapStage`, so a planning row cannot become purchase authority even if
every other field is set to look convincing.

`priceDisplay: null` means pricing pending, which is the honest answer for a
planning row whose supplier quote is outstanding. It is not the same as free.

## One unresolved question that decides whether the cart is reachable

The research gateway wall mounts on `/api/research` before the Early Access API
registers, and it default-denies anyone without the research gateway cookie.
Its exemption lists name session, catalog, agreements, unlock, logout, orders
and verification. They name no cart path. So an Early Access customer who
unlocks with the Early Access password and posts a cart quote is refused,
unless they also hold the research gateway password.

No composed test covers it: the cart route tests register the Early Access API
alone, and the one test that mounts both enumerates exempt paths without a cart
path among them.

The question is binary and belongs to Samuel. If pilot customers hold both
passwords, this is a deployment precondition and should be written down as one.
If not, the exemption list needs method-exact cart entries, and that file is a
protection seam only the orchestrator may edit. No lane routes around this.

## Standing facts from the forensics pass

**The repository ledger is not evidence of production state, in either
direction.** `MIGRATION_DAG.json` marks migrations 58, 60 and 61
`appliedToProduction: false`, while migration 61's own header narrates two real
production checkouts by number, which cannot exist unless 58 and 60 ran.
`CURRENT_PRODUCTION_STATE.json` predates the cart entirely. Refreshing both is
part of the orchestrator's release-control commit.

**Do not drop and recreate the cart event-type constraint.** Migration 61
replaced it wholesale, its vocabulary is exactly the eight values in
`EARLY_ACCESS_CART_EVENT_TYPES_AT_M61`, and migration 61 then writes a real
`checkout_superseded` row. A constraint regenerated from a pre-61 mental model
applies cleanly on an empty container and fails at apply time on production.
Widen additively, and seed a `checkout_superseded` row in the PG16 and PG17
harness so the container has the production shape.

**Route cardinality is pinned at 348 registrations across 339 call sites** in a
release-control file only the orchestrator may edit. A lane that adds a route
breaks a gate it may not fix. That is intentional: report the count and the
paths in the handoff, leave the gate red, and say so. A lane that edits the pin
to go green has defeated the mechanism.

**Three proof concepts already exist**, listed in `EARLY_ACCESS_PROOF_CONCEPTS`:
admin-recorded off-platform evidence, the single-product customer bucket
upload, and the new transient email-only submission. They are not
interchangeable, and a fourth should be a deliberate decision.

**Migration 61's remediation is order-sensitive.** It refuses to run unless
both checkouts are still `awaiting_payment`, and recording a proof advances a
checkout to `under_review`. If 61 is not yet applied, it must be applied before
any proof is recorded against the founder checkout.

## Two prerequisites no lane can code around

**The counsel-approved package is not registered anywhere.**
`registerLegalPackage` in `server/research/membership-activation/legal-import.ts`
verifies and registers the seventeen approved documents against pinned
SHA-256s, and it has no production caller: only its own test imports it. No
script, no bootstrap, no CLI. So `research_fm_document_versions` holds no
published Early Access package today, and `requiredAgreementsSatisfied` fails
closed with `no_published_version` for every category. That is correct
behavior, and it is a hard prerequisite. Until a named human runs a
registration with the hash-verified documents, no Early Access customer can
complete a package.

**The Early Access acceptance table is not applied.**
`research_early_access_agreement_acceptances` arrives in migration
`20260804120000` and the ledger records that migration as pending.

Neither is a coding task and neither may be simulated. A lane writing a fixture
to stand in for one of these has left the contract; say so in the handoff
instead.

## Files no lane may touch

Session 1 owns these. A lane that needs one changed says so in its handoff.

- `server/research/early-access/register.ts`
- `server/research/early-access/persistence/production-deps.ts`
- `shared/research/early-access-cart.ts` and both hardening contract modules
- the migration DAG, `MIGRATIONS.md` and the release-control pins
- route cardinality
- every protection-manifest seam file: `client/src/App.tsx`, `server/index.ts`,
  `server/research/index.ts`, `server/care/index.ts`, `shared/research/flags.ts`

## Gates every lane reproduces

At this base: `npm run check` clean, route uniqueness 348 registrations across
339 call sites, migration DAG 22 nodes, core-site protection PASS, and
migration 61 hashing to
`a15ed8163b618a1de56d779c8b16e1ced31621ccf07d7435a2aa4838e4f3ead2` from its
canonical Git blob bytes. A lane that moves one of those numbers says so.
