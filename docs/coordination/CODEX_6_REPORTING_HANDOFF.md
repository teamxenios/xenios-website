# Codex 6 route-free reporting handoff

## Boundary

This source-only unit defines version 1 sanitized partner/supplier reporting events, injected queue and sink ports, a bounded delivery worker, and a deliberately disabled Google Sheets adapter. It registers no route, producer, timer, database object, migration, credential, environment variable, or provider client.

The adapter always returns `google_sheets_reporting_not_configured` and performs no network I/O. Enabling it requires a separately leased integration with credential-presence checks, protected configuration, destination ownership, least-privilege provider access, and renewed exact-SHA review.

## Privacy and operational behavior

- Event envelopes and payloads are strict allowlists; unknown fields fail closed.
- Events carry opaque operational references, finite statuses, timestamps, and bounded aggregate counts only.
- Every event, partner, supplier, referral, fulfillment, and reconciliation reference is a canonical UUID; free-form and encoded identifiers fail closed.
- Names, emails, phones, addresses, clinical data, authentication material, supplier cost, price, payment, and free-form provider errors have no contract field.
- Rows have a fixed column projection. `already_present` is reconciled as successful idempotent delivery.
- Durable queue commands use the outbox delivery UUID rather than an event payload identifier, and the claimed attempt number is never recomputed client-side.
- Batch size, attempt count, and exponential delay are bounded.
- Malformed or duplicate queue projections are rejected before sink work; a lost acknowledgement safely replays the same event identity and reconciles through `already_present`.
- Invalid events and permanent failures dead-letter; retryable failures retry only below the attempt ceiling.
- Sink exceptions and reasons are reduced to fixed local error codes before queue persistence.

## Integration prerequisites (not included)

1. Lease and review a durable outbox implementation and producer seams.
2. Approve destination spreadsheet identity, columns, retention, access, and data owner.
3. Configure credentials outside Git and verify names/presence without displaying values.
4. Replace the disabled adapter in a separate unit with timeout, authentication, deduplication, and bounded response handling.
5. Add reconciliation monitoring and a protected dead-letter recovery workflow.
6. Run exact-SHA security, provider sandbox, deployment, and postdeploy QA before activation.

## Rollback

Revert the source commit. Because this unit is unmounted and contains no migration, provider call, or persisted data, rollback has no database or external-system operation.
