# X1 catalog-interest implementation

Status: local source implementation. Not merged, pushed, deployed, activated, or connected to live delivery.

Base: `68253facc1f1a9d2126469e566ba36a7a73ce69e`, the clean catalog-aware successor to the current release branch.

## Public contract

- `GET /health/catalog` mounts a login-free catalog request page.
- `POST /api/catalog-interest` accepts only `requestId`, `email`, optional `marketingConsent`, the autofill-resistant `confirmEmpty` trap, and optional `turnstileToken`.
- The payload has no attribution, referrer, medical, ordering, payment, invoice, or fulfillment fields.
- Optional marketing consent defaults false and is recorded separately from requested catalog delivery.
- Quick Order remains the existing login-free URL: `https://xeniostechnology.com/research/early-access/order-request`.

## Production configuration gates

The endpoint fails closed until all of these are configured and the candidate database objects are qualified and promoted:

- `CATALOG_AUTHORITY_REVISION`
- `CATALOG_AUTHORITY_URL`
- `CATALOG_AUTHORITY_APPROVED_AT`
- `CATALOG_AUTHORITY_EXPIRES_AT`
- optional `CATALOG_AUTHORITY_REVOKED_AT`
- `CATALOG_TEAM_RECIPIENT`, one explicitly approved inbox so each request creates exactly two jobs
- the existing shared email resolver must return an explicitly approved sender identity; validated bare addresses, display-name envelopes, and connector-provided identities are supported, but catalog delivery invents no fallback
- existing Supabase service-role settings
- existing Resend provider settings
- existing Turnstile settings when bot verification is enabled

The URL must use one of the reviewed origins `https://xeniostechnology.com` or `https://www.xeniostechnology.com`, with no credentials, query, or fragment. An expired or revoked authority saves the request for manual review, cancels the customer-delivery job, and leaves only the team-review job pending.

No default catalog URL, revision, approval timestamp, expiration, sender identity, or team recipient is invented in source.

## Persistence and delivery

`supabase/candidates/20261022_catalog_interest/001_catalog_interest.sql` is an unpromoted candidate. One service-role, security-definer RPC holds an advisory transaction lock, returns the stored receipt for an exact replay, conflicts on a changed fingerprint, and atomically creates one lead, one consent snapshot, and the two canonical jobs:

- `catalog_interest_customer`
- `catalog_interest_team`

The production application has no in-memory persistence fallback. Durable rate-limit uncertainty returns 503; an actual exhausted budget returns 429.

`server/catalog-interest/mail.ts` provides a strict Resend-compatible port. It passes the canonical event key as provider idempotency, rechecks the current catalog authority for customer delivery, and returns `sent` only for a nonblank provider message ID. Provider errors, throws, and missing IDs remain failed outcomes.

`server/research/outbox.ts` now owns both canonical catalog templates. It maps the durable row into the strict adapter, resolves catalog authority at each worker attempt using that attempt's clock, and lazily obtains the existing shared Resend client only after the job, authority, content, and sender checks pass. A customer job whose authority has expired, drifted, or been revoked moves to permanent manual-review failure without contacting the provider. Team-review delivery remains independent of customer catalog authority. A provider error always wins over a simultaneously returned ID, and a blank ID is never recorded as sent.

## Activation blockers

1. Qualify the candidate against disposable PostgreSQL 16/17 using the included precheck, postcheck, apply-twice, rollback-only rehearsal, and an external two-session concurrency test. X1 currently has no working PostgreSQL runtime, so these checks are prepared but not run.
2. Promote the qualified SQL through the repository migration process and register it in the managed migration documentation and DAG.
3. Approve real authority values, one team recipient, sender identity, template copy, unsubscribe/suppression handling for any later marketing use, and provider configuration.
4. Run staging persistence, provider sandbox qualification, and an end-to-end worker drain against disposable data after database promotion. Local strict-adapter and canonical-worker retry/idempotency tests do not qualify a real provider or managed database. A saved or queued receipt must never be described as delivered.

No step above grants production database, deployment, provider-send, customer-contact, account-creation, purchase, invoice, or fulfillment authority.
