# Universal Account and Partner Access — qualification addendum

Observed 2026-09-06. This addendum follows the founder directive to finish the account/partner release separately from the Resource Hub. It is qualification evidence only; it is not production authorization.

## Qualification result

- **Database prechecks: PASS.** The two pinned read-only prechecks were executed against Supabase project `yvzeduaxbwgcwllhywff` through the authorized management database-query connection. Every statement was wrapped in `BEGIN READ ONLY` and `ROLLBACK`; no production mutation occurred. Evidence: `production-account-partner-prechecks-20260906.json` (SHA-256 `8e94f885842be95a03042f29c154582670bc863bc244786b7f09c9aa865ba658`).
  - Approved-customer precheck SHA-256: `f275d2d98c3e5349a619952ba0674202f260f85cff6066ace6a46a5ad8287451`; canonical schema present; normalized-email duplicate guard false; 71 columns, 30 constraints, 17 indexes, 0 triggers, 0 policies, 0 candidate authority functions; counts applications 3, members 3, application events 10, notification outbox 58.
  - Partner-lifecycle precheck SHA-256: `04ec1bff31b8363f8e816c22bd8d9ad65bf13fa43604bfd8755af377cdae29e9`; canonical schema present; duplicate member-binding guard false; 46 columns, 44 constraints, 16 indexes, 0 triggers, 0 policies, 0 candidate authority functions; counts partners 0, agreements 0, training 0, lifecycle events 0.
  - Compatibility decision: **preflight PASS for the selected candidates**. The existing tables, keys, and base constraints required by both candidates are present, existing normalized indexes are compatible with the idempotent `IF NOT EXISTS` statements, and the data guards are clear. The approval/operation columns and authority functions remain absent as expected before apply. Read-only prechecks do not exercise the candidates' post-apply constraint replacement or DDL locking; those remain migration-window checks.
- **Migration rehearsal: PASS, bounded.** The disposable PGlite rehearsals passed 35 approved-customer checks and 57 partner-lifecycle checks, including read-only pre/post scripts, double application, privileges, idempotency, stale revisions, identity binding, expiry, cross-partner separation, and transaction rollback. They use a synthetic Auth/member/partner baseline and do not establish production object parity, concurrency, or provider delivery.
- **Approval-to-login browser journey: BLOCK for full closure.** The real production route handlers and SPA bundle passed a local browser journey over synthetic preview Auth/data: normal sign-in to account home, partner workspace, refresh, rendered sign-out to the gateway, sign back in, and cross-partner selector rejection. Evidence: `account-journey-browser-20260906.json` (SHA-256 `12543832c83a52e0541207e3c608d941bd02f9c934c5f4abcc3b159479822ce9`). The new-account admin-approval and ownership-verified claim path passed through the real handler acceptance suite (`server/research/e2e/account-membership-catalog.acceptance.test.ts`), but the complete admin-approval → claim → normal-login sequence has not yet been proven in one browser run. No live account approval, claim, email, or notification was performed.

## Rollback configuration

The exact historical flags are:

| Flag | Observed nonsecret value | Required rollback value | Action |
| --- | --- | --- | --- |
| `RESEARCH_FOUNDING_ACTIVATION_ENABLED` | `true` | `false` | Before reverting application code, explicitly set false so the historical founding-membership activation writers and scheduler cannot remount. |
| `RESEARCH_MEMBERSHIP_BILLING_ENABLED` | absent (effective default `false`) | remain unset or explicitly `false` | Keep disabled before any application rollback; do not add the flag during rollback. |

No configuration was changed during qualification. Rollback preserves account, approval, audit, billing, and notification-outbox history; it does not delete new account or approval records or claim that historical recurring charges were canceled.

## Candidate and release boundary

- Exact deployment candidate: `ff3c496245739233b71e46f9e5d6e26af9d57017`
- Candidate tree: `73734e113e8ef5f9e1f27ae4dae36bdf598abb25`
- Release name: **Universal Account and Partner Access**
- Included: approved-customer access without a paid-membership prerequisite, canonical account and partner interfaces, partner administration/lifecycle operations, and the partner data-integrity repair.
- Excluded: Resource Hub/recruiter workflows, referral rollout, price activation, commerce/payment/fulfillment, real account approvals or claims, notifications, and purchases.

## Proposed live smoke (approval required separately)

- Account: Seth's founder-supplied address, `seth@thevitalityadvisors.com`, as the ownership-verified test identity.
- Approval actor: the existing authenticated Xenios admin authority selected for the deployment window.
- Expected notification side effects: one `approved_customer_claim` outbox job addressed to Seth's account email, followed after a successful claim by one `approved_customer_welcome` outbox job; delivery is checked only as outbox processing, never claimed as provider delivery.
- No approval, claim, message, or configuration change has been performed. The smoke requires explicit production authorization naming the account, recipient, exact SHA, migrations, and rollback actions.

## Remaining blocker

The release remains **BLOCKED for a defensible deployment GO** until the bounded browser journey proves the new-account approval-to-claim path in the same real-handler browser run and the founder grants exact-SHA production authorization. Resource Hub work remains separate and does not block this narrow release once these account/partner prerequisites are closed.
