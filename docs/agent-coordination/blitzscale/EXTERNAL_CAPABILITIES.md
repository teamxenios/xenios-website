# External capabilities registry (build-first / keys-later)

Owner: coordinator. Every capability = provider-neutral interface + disabled
provider + deterministic test provider + (sandbox where practical) + real
adapter with NO embedded creds + env validation + default-false flag + full
UI states + tests + safe observability + activation instructions. Declare
`DONE_BEHIND_DISABLED_PROVIDER` when the full path is complete and off.

The member-safe capabilities route (`GET /api/research/capabilities`, planned
G0) returns booleans only — never secret names, provider IDs, config values,
or stack traces. The Samuel-only diagnostics route (`GET /api/admin/research/
system-status`, EXISTS in main) may show missing-variable NAMES and approval
states, never values.

| Capability | Flag (default false) | In main today | Owner | External gate |
|---|---|---|---|---|
| transactional email | provider resolves (Resend/connector/unavailable) | outbox + resolver LIVE, sender identity ready | done (PR #25) | Resend domain verify + RESEARCH_EMAIL_FROM/REPLY_TO |
| identity verification (age 21+) | RESEARCH_IDENTITY_VERIFICATION_ENABLED | not built | Website 2 (G2) | identity provider account + webhook secret |
| membership billing | RESEARCH_MEMBERSHIP_BILLING_ENABLED | activation attestation path only | Website 2 (G2/G7) | Stripe keys + webhook + price IDs |
| product commerce | NEXT_PUBLIC_RESEARCH/CONSUMER_COMMERCE_ENABLED | lanes gated, order webhook seam | Website 3 (G7) | Stripe + ORDER_WEBHOOK_URL |
| private media | (new flag) | not built | Website 2 (G5) | Supabase private storage / signed URLs |
| Telegram support | (new flag) | not built | Website 2 (G5) | bot token + per-chat map |
| live shipping rates | (new flag) | not built | Website 3 (G7) | carrier accounts + contracts |
| Mitch fulfillment | (new flag) | not built | Website 3 (G7) | fulfillment API + supplier data |
| affiliate payouts | RESEARCH_REFERRALS_ENABLED + payout flag | referral ledger + fraud in main | Website 3 (G8) | payout processor |
| Quantum commerce | RESEARCH_QUANTUM_COMMERCE_ENABLED | Coming-Soon only | Website 3 | operating-lane approval (NEEDS_SAMUEL_DECISION) |

Release-state truth is reported as independent booleans (see
RELEASE_CHECKLIST.md), never collapsed into one "launched".
