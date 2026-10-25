# CODEX-PEP-AUTH-ADMIN Notifications Handoff

## Exact scope

This slice is a route-free, persistence-free, credential-independent kernel for membership application intake and administrative decisions. It introduces no production configuration and changes no existing file.

The kernel:

- accepts only a server-produced, action-bound, hostname-verified, unexpired Turnstile assessment;
- rejects unknown keys, malformed UUIDs, noncanonical UTC timestamps, and raw Turnstile token fields;
- permits only the `membership_reviewer` role to approve, decline, or request documentation;
- uses fixed decision/reason codes and deterministic idempotency keys;
- emits minimum-necessary email intents without review reasons or reviewer identity;
- keeps every submitted, documentation-pending, approved, and declined state at `accessGranted: false` and `checkoutEligible: false`.

## Shared-seam integration request

The release manager may later lease and wire all of the following; none is part of this commit:

1. A central route registration that authenticates the account or reviewer, calls the existing server-side Turnstile adapter, persists through the canonical membership store, and enqueues through the canonical notification outbox.
2. A production Turnstile adapter that validates secret configuration, expected action, allowed hostname, provider success, token freshness, and single use while never logging or storing the raw token.
3. A production email adapter that maps the four fixed template identifiers to reviewed templates and deduplicates on `idempotencyKey`.
4. Persistence mapping against the release-manager-approved membership schema, including atomic state comparison and idempotency enforcement.

Do not mount the kernel directly from client input, treat an approval as activation, or infer catalog/checkout eligibility from its state.

## Synthetic role accounts

Tests exercise synthetic applicant, membership reviewer, support viewer, and Product Control observer identities only. No real account, email, provider, database, secret, production state, or external system is touched.
