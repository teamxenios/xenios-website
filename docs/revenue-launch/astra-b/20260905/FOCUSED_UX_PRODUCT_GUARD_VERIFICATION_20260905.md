# ASTRA-B Focused UX / Product-Control Guard Verification

Date: 2026-09-05 (America/Chicago)

## Scope

This is a read-only regression pass over the ASTRA-B leased customer/admin UX,
Product Control pricing/reconciliation review, partner guards, account-portal
continuity, and recovery-isolation seams. It does not activate prices, grant
accounts, change flags, write production data, apply migrations, deploy, or send
communications.

## Exact command

```text
npm test -- --run client/src/research/revenue-launch/ReconciliationReviewPanel.test.tsx client/src/research/recovery-isolation.test.tsx client/src/research/account-portal/AccountPortalShell.test.tsx client/src/research/pages/sign-in.test.tsx client/src/research/pages/partners/Training.test.tsx client/src/research/pages/partners/shared.test.tsx client/src/research/pages/partners/Onboarding.test.tsx client/src/research/pages/partners/Links.test.tsx client/src/research/pages/partners/Dashboard.test.tsx client/src/research/pages/member-access-state.test.tsx client/src/research/pages/adminx/ProductsAdmin.test.tsx client/src/research/pages/adminx/ProductPriceReviewPanel.test.tsx client/src/research/pages/adminx/PartnerLifecycleReviewPanel.test.tsx client/src/research/pages/adminx/MemberAccessDiagnosisPanel.test.tsx client/src/research/pages/member/MembershipPage.test.tsx --reporter=dot --testTimeout=120000 --no-file-parallelism --maxWorkers=1
```

## Result

```text
Test Files  15 passed (15)
Tests       299 passed (299)
Failures    0
Duration    47.20 seconds
```

The runner emitted existing React `act(...)` warnings in recovery-isolation and
partner-lifecycle tests; these were warnings only and did not produce failures.

An additional client-contract pass covered the partner application form and
adapter, including the audience/channel request shape and unavailable/error
mapping:

```text
Test Files  2 passed (2)
Tests       55 passed (55)
Failures    0
Duration    3.31 seconds
```

Combined with the focused pass above, the reviewed ASTRA-B client/admin slice
has 17 passing test files and 354 passing tests across the two commands.

## Boundary

This evidence proves the focused local regression set only. It is not evidence
of supplier confirmation, inventory/capacity, production migration readiness,
price activation approval, authenticated production checkout, or live payment.
