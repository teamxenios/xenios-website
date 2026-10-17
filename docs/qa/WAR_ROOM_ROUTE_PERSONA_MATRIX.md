# War-room route/persona matrix

This independent QA artifact converts the accepted-main Express inventory into route-level evidence. It does not change registrations, authorization, runtime behavior, or protected scanners.

## Frozen baseline

- Accepted source baseline: `6fb322b4f89b7a68b6879e76eef9f91b50158209`
- Static Express registrations: **307**
- Registration call sites: **298**
- Scanner roots: `server/**` plus imported `shared/**` constants
- Implementation: `scripts/qa/war-room-route-persona-matrix.mts`

## Persona model

Every registration receives exactly one route-namespace persona: public/system, platform admin, Research admin, Research applicant, Research member, Research partner, or Care private. Each row retains its method, normalized path, source file, source line, mutation posture, and nearby static guard markers.

This is an audit classification, not proof that a handler is authorized. Shared walls, router mounting, middleware ordering, provider configuration, and live production behavior still require independent tests and body-suppressed smoke evidence.

## False-green detection

The matrix fails its bounded validation when:

- registrations drift from 307 or call sites drift from 298;
- the underlying scanner has unresolved or non-API registrations;
- a method/path identity is duplicated;
- any persona class disappears from coverage; or
- route rows cannot retain source-level evidence.

It separately reports candidates whose private namespace has no nearby static authorization marker and public/system mutations with no nearby webhook/auth marker. Those candidates are not automatically vulnerabilities: they are a mandatory manual-review queue that prevents a green aggregate count from being treated as authorization evidence.

## Commands

```powershell
npx vitest run scripts/qa/war-room-route-persona-matrix.test.ts
npx tsx scripts/qa/war-room-route-persona-matrix.mts > route-persona-matrix.json
```

The JSON output is evidence only and must not contain response bodies, secrets, credentials, private records, or provider data.

## Synthetic end-to-end commerce evidence

The same QA module mirrors the Infinity Mode `XENIOS-E2E-001` child-task chain with exact `E2E-001` through `E2E-024` task keys:

`production attestation → account → email verification → application → approval → exact eligible variant → affiliate referral → attribution → cart → reservation → payment tokenization → test payment → signed webhook → immutable order → supplier assignment → tracking → customer order history → refund → commission adjustment → super-admin → sanitized reporting mirror → independent browser QA → release candidate → production-safe smoke`

Acceptance requires all twenty-four stages in exact order, exact task keys, one stable synthetic principal, unique artifact IDs, an exact predecessor link at every transition, non-UI server-contract evidence, stable Product Control selection and affiliate-attribution digests, test-mode payment only, a verified webhook signature, an immutable order digest propagated through every downstream stage, refund-bounded integer-cent economics, refund-adjusted commission basis, complete super-admin reconciliation, an explicitly sanitized reporting mirror, and read-only production-safe smoke reconciling all prior evidence.

The validator fails closed for missing or reordered stages, skipped/vacuous/UI-only proof, live-provider mode, unsigned webhooks, principal drift, duplicate artifacts, mutable order evidence, invalid refunds, stale commission economics, or incomplete admin evidence. It creates no account, application, product, cart, reservation, payment, order, supplier record, tracking event, refund, commission, or admin row.

## Manual-order-payment acceptance contract

The current source preparation is an uncommitted, two-file local snapshot rooted at accepted GitHub/production base `39e24f499450e87f1e5967861273328aea3f5b07`. It is not a publishable candidate and receives no exact-SHA acceptance from this artifact.

Independent acceptance requires all eleven material gates:

1. reporting proof remains `reported_unverified` and never marks an invoice paid;
2. verification authority is exactly owner, admin, or operations admin;
3. authorization completes before any state/commit-port read;
4. exact idempotent replay returns the identical committed plan;
5. any replay payload change fails with `idempotency_conflict`;
6. reservation evidence is exactly one unique, current held reservation per invoice line;
7. duplicate external transaction evidence is denied;
8. duplicate proof evidence is denied;
9. prior plus proposed refunds never exceed each immutable verified line amount;
10. every downstream effect remains a plan with execution `not_executed`; and
11. supplier release is explicitly present only as a held, unexecuted effect.

The matrix also rejects skipped, vacuous, or UI-only evidence. It does not authorize or execute payment verification, order-paid transition, reservation finalization, receipt issuance, supplier release, notifications, commissions, refunds, storage, provider access, or production writes.

### Local source snapshot evidence

- `server/research/commerce/manual-order-payments.ts`: 66,682 bytes; SHA-256 `caea3bbe15c60d86dd1e5dfd11f36db72cb8ab8470f68f204fe78132b41e4bf5`
- `server/research/commerce/manual-order-payments.test.ts`: 69,779 bytes; SHA-256 `4bf86971036d38cd0c70e2b03c4d261e82d31e47d6757988d03fb13075a22dd4`
- focused source validation: 1 file / 45 tests passed

Those hashes identify the local bytes only. Release acceptance still requires a frozen committed head, exact-base ancestry, strict manifest, ownership, exact diff, CI, and a renewed independent review.
