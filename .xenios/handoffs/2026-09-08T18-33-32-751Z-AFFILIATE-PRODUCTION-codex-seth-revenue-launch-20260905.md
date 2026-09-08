# Affiliate identity and money-lifecycle checkpoint

The existing affiliate lane was revalidated from the current source on 2026-09-08. The focused run covered the partner server modules, partner pages, shared affiliate-program configuration and Referral V1 contracts:

```
node node_modules/vitest/vitest.mjs run \
  server/research/partners \
  client/src/research/pages/partners \
  shared/research/affiliate-program/config.test.ts \
  shared/research/referral-v1.test.ts
```

Result: 45 test files passed, 1 skipped; 1,214 tests passed, 16 skipped, zero failures, in 36.10 seconds.

The passing coverage includes server-derived attribution and self-referral refusal, signed referral links and QR payloads, idempotent conversion attribution, partner lifecycle boundaries, commission arithmetic and reversal safeguards, payout-proof refusals, and the partner dashboard/page contracts. The source keeps payment and payout activation behind explicit capability/provider proof. This is source qualification only: no partner activation, payout, payment, notification, customer grant or production write occurred.

PNG export and full live partner verification remain separate follow-up requirements; this checkpoint does not claim those are complete.
