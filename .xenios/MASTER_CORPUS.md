# Xenios Research master continuity corpus

This is the first human-readable file every Claude Code, Codex, ChatGPT or human engineer reads after opening the repository.

## Current authority

1. Current Git and production state outrank this file.
2. Refresh `PROJECT_STATE.json` and `RELEASE_STATE.json` after verification.
3. Never infer current production from old chat transcripts.
4. Do not ask Samuel to repeat project history already in Git.

## Platform direction

Xenios Research is one multi-persona platform, not a Kris/Roman-only build. Buyer-specific pricing and entitlements are configurations inside the general architecture.

The target personas are:

- public visitors and applicants
- approved members and professionals
- organization owners, admins, buyers and billing viewers
- affiliates and strategic partners
- suppliers, labs and fulfillment partners
- Care providers and clinical operations
- support, operations, finance, admins and founder

## Canonical systems that must not be duplicated

- Supabase Auth and canonical member identity
- account/organization authorization
- Product Control and master-offerings catalog
- buyer-scoped pricing
- canonical cart, checkout and orders
- affiliate attribution, commission and payout ledgers
- supplier/fulfillment authority
- notification outbox
- Care/provider workflow
- audit and release control

## Current high-priority sequence

1. Resolve F7 and mount organization accounts.
2. Open the real legal-version-bound membership application.
3. Build minimum-data supplier workspace.
4. Complete affiliate identity and money lifecycle.
5. Unify durable requests and quotes.
6. Enable safe general commerce progressively.
7. Finish notifications, analytics, Google Workspace, operations, Care and reliability.

## Session protocol

1. Run `node scripts/agentic/xenios-os.mjs validate`.
2. Run `node scripts/agentic/xenios-os.mjs status`.
3. Register the session.
4. Run `node scripts/agentic/xenios-os.mjs next --session SESSION-ID`.
5. Claim exactly one task and path lease.
6. Heartbeat while working.
7. Commit coherent work on an isolated branch.
8. Write an exact-SHA handoff.
9. Independent QA accepts that exact SHA.
10. Release the lease and take the next task.

## Safety

Never fabricate payments, signatures, prescriptions, provider decisions, supplier evidence, shipment events or production state. Never store credentials, patient data or recovery links in this corpus.
