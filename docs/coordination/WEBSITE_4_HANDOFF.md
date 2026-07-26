# Website 4 production handoff

1. **Session:** Website 4 — Operations, Affiliates & Fulfillment.
2. **Feature domain:** Operations command center, Mitch fulfillment, affiliate reporting, professional accounts, CRM, notification outbox, and operational audit.
3. **Repository:** `teamxenios/xenios-website`.
4. **Starting branch:** `feature/website-4-operations-affiliates`.
5. **Starting SHA:** Original Website 4 base `a486b889503a8f9d42f86c4666e808af6c5e852c`; resumed Release Train 3A checkpoint base `6dba785b649a8b729d74d2691ac7d46b2a64e4f6`.
6. **Final branch:** `feature/website-4-operations-affiliates`.
7. **Final head SHA:** Use the immutable head on PR #48 after this handoff commit.
8. **PR:** https://github.com/teamxenios/xenios-website/pull/48
9. **Merge SHA:** Not yet merged; Website 2 is the sole merge owner.
10. **Migration:** `supabase/research-operations-affiliates.sql` is production-ready but has not been applied. It depends on canonical commerce migrations 20–26.
11. **Render deployment:** Not yet deployed; Website 2 owns Render service `srv-d8s9vej7uimc7384dfcg`.
12. **Production routes:** To be registered by Website 2: `/admin/research/operations`, `/operations/mitch`, `/research/affiliate`, and `/research/professional-accounts`.
13. **Production persistence:** Durable Supabase repositories and authorization guards are implemented in `server/research/operations/production-deps.ts` and `server/research/operations/production-guards.ts`.
14. **Schema posture:** Website 4 reuses canonical orders, fulfillment, lots, partners, attribution, commission, payout, and notification tables. It adds only operations-specific projections, policies, audit records, professional-account records, and service-role RPCs.
15. **Authorization:** Supabase access tokens are verified server-side; recovery sessions are denied; staff roles come from `research_operations_staff_roles`; member ownership and affiliate identity are resolved server-side; new tables use RLS with no browser grants.
16. **Inventory integrity:** Fulfillment requires exact canonical allocations and current quality evidence. The production inventory boundary now covers receipt, release, return, damage, quarantine, correction, and reconciliation with role/version/idempotency checks, append-only command/movement evidence, shipped-release refusal, and negative-balance refusal. Allocation and shipping still never double-decrement after the checkout hold.
17. **Shortage resolution:** Mitch/logistics can open and resolve a durable shortage through the atomic fulfillment RPC and protected routes. Resolution records audit/outbox evidence but does not create inventory, a label, or a shipment.
18. **Notification producers:** Fulfillment exception/resolution/shipment/escalation and inventory-review events write deterministic, privacy-minimized rows to the canonical notification outbox. In-app evidence is durable; email is queued only for administrators who enable the existing `operations` immediate preference; the existing worker recognizes `admin_operations_alert`. Telegram/SMS remain provider-disabled.
19. **Idempotency/audit:** Fulfillment, inventory, operations-task, partner-request, and professional-account RPCs are idempotent, stale-write protected where applicable, transition checked, and audited. Append-only evidence cannot be updated or deleted.
20. **Migration verification:** The updated migration 31 was applied twice to a disposable PostgreSQL 16 database after migrations 1–26. The full inventory lifecycle, shortage resolution, outbox dedupe/privacy, fulfillment, CRM privacy/replay/stale-write handling, assigned tasks, partner-request replay, professional pipeline, RLS, grants, and record-count invariants passed.
21. **UI consistency:** The portals reuse the Research app, button, form, badge, typography, spacing, palette, and focus patterns. Interfaces have desktop/375px state evidence plus measured 320px, keyboard-structure, and 200%-zoom/no-overflow evidence.
22. **UI evidence:** `docs/coordination/evidence/website-4-operations-desktop-ui-consistency.png`, `website-4-mitch-375-ui-consistency.png`, `website-4-affiliate-375-ui-consistency.png`, `website-4-professional-empty-375.png`, `website-4-operations-error-375.png`, and `docs/coordination/WEBSITE_4_UI_MATRIX.md`.
23. **Secrets:** No secret values are committed or documented. Required names are `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and optional `RESEARCH_AFFILIATE_BASE_URL`.
24. **Rollback:** See `supabase/research-operations-affiliates-rollback-notes.md`. Prefer disabling Website 4 route/capability wiring and reverting the application SHA; preserve all ledgers and audit evidence.
25. **External integration blocker:** Canonical commerce migrations 20–26 are not yet present in production. Website 2 must also confirm checkout persists order-to-lot reservations in `research_lot_allocations`; Website 4 deliberately refuses allocation without that canonical evidence.
26. **Release sequence:** Apply canonical commerce migrations → confirm allocation bridge → apply Website 4 migration → register production guards/dependencies/routes → run integrated checks → merge → Render deploy → live role-based smoke test → logs/database verification.
27. **Route parity:** All formerly missing partner endpoints plus the inventory command and shortage-resolution endpoints have literal authenticated server registrations, scoped durable adapters, and tests. See `docs/coordination/WEBSITE_4_ROUTE_PARITY.md`.
28. **Newly finished missing scope:** Production inventory receipt/release/return/damage/quarantine/correction/reconciliation, durable shortage resolution, privacy-minimized canonical outbox producers/worker dispatch, and the 320px/keyboard/200%-zoom evidence matrix, in addition to the prior CRM/tasks/partner/professional work.
29. **Validation:** Focused Website 4 suite passed 5 files / 52 tests; full `npm test` passed 148 files / 3,189 tests; `npm run check` passed; `npm run build` passed. The updated migration applied idempotently twice in disposable PostgreSQL 16 and its behavior/verification SQL passed.
30. **Remaining scope:** The exhaustive classification and exact continuation packets are in `docs/coordination/WEBSITE_4_REMAINING_SCOPE.md`.
31. **Production smoke:** Pending Website 2 merge and Render deployment. Website 4 remains available for review fixes and will verify the released routes.

PRODUCTION STATUS: NOT YET MERGED

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS
