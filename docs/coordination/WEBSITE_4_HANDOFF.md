# Website 4 release handoff

1. **Session:** Website 4 — Operations, Affiliates & Fulfillment.
2. **Repository:** `teamxenios/xenios-website`.
3. **Branch:** `feature/website-4-operations-affiliates`.
4. **Worktree:** `C:\Users\sboad\projects\wt-website-4-operations-affiliates`.
5. **Recorded base:** `a486b889503a8f9d42f86c4666e808af6c5e852c` (`origin/main` at session start).
6. **Delivery head:** The commit containing this handoff on `feature/website-4-operations-affiliates` (the PR records its immutable SHA).
7. **Commit sequence:** Protected state machines; exact-lot fulfillment; privacy-safe CRM/outbox; affiliate attribution/commission ledger; operations APIs/UI/schema/professional accounts.
8. **Delivered scope:** Admin command center, CRM, order/fulfillment tracking, restricted Mitch portal, lots/inventory/shipping/returns/exceptions, durable notification outbox, affiliate application/login/links/attribution/commissions/payout proof, Lawrence model, and nine separate professional-account programs.
9. **Core invariants:** Payment, order, fulfillment, shipment, and allocation states remain separate; mutations are authorized, idempotent, stale-write protected, and audited.
10. **Primary paths:** `server/research/operations`, `client/src/research/pages/operations`, `client/src/research/adapters/operations.ts`, and `supabase/research-operations-affiliates.sql`.
11. **Shared files untouched:** No edits to `server/index.ts`, `server/routes.ts`, `server/research/index.ts`, `client/src/App.tsx`, shared research shell files, root package files, or Website 2 member backend modules.
12. **Integration request:** See `docs/coordination/WEBSITE_4_INTEGRATION_REQUEST.md`.
13. **Schema:** One additive, non-production SQL composition file with RLS, immutable ledgers, audit records, idempotency constraints, and role grants.
14. **Environment:** No secrets are committed. Signed links, carriers, payouts, and message providers must receive server-side configuration during integration.
15. **External providers:** Carrier labels, payout proof, email, Telegram, SMS, and in-app delivery are injected adapters; absent providers fail safely into the retryable outbox.
16. **Security/privacy:** Mitch has no CRM, affiliate, payout, or audit access; member tracking is owner-scoped; affiliate dashboards omit customer PII; outbound external messages suppress customer and clinical content.
17. **Roles:** Admin, operations, fulfillment/Mitch, support, finance, affiliate, professional, and member permissions are explicit and tested.
18. **Validation:** Focused domain/UI/schema suite passed 72 tests; repository-wide `npm test` passed 144 files/3,149 tests; `npm run check` and `npm run build` passed.
19. **UI evidence:** `docs/coordination/evidence/website-4-operations-desktop.jpg` and `docs/coordination/evidence/website-4-mitch-mobile.jpg`; browser checks confirmed 19 linked metrics, one priority action, ten fulfillment queues, and no page overflow.
20. **Known limitation:** Domain services and route registration are integration-ready references; the release manager must connect authenticated actors, production repositories, workers, and provider adapters in locked shared wiring.
21. **Rollback:** Revert the five Website 4 commits before composing the SQL into production; no deployment or production migration was performed by this session.
22. **PR/review order:** Review state/auth boundaries, then immutable ledgers and SQL/RLS, then API contracts, then UI and coordinator wiring.
23. **Next owner checklist:** Apply shared wiring, resolve any Website 2 schema overlap, run integrated acceptance, update this handoff with the final SHA/PR/checks, then merge and deploy only through the release manager.
