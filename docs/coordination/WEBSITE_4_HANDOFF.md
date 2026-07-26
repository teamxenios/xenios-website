# Website 4 production handoff

1. **Session:** Website 4 — Operations, Affiliates & Fulfillment.
2. **Feature domain:** Operations command center, Mitch fulfillment, affiliate reporting, professional accounts, CRM, notification outbox, and operational audit.
3. **Repository:** `teamxenios/xenios-website`.
4. **Starting branch:** `feature/website-4-operations-affiliates`.
5. **Starting SHA:** `a486b889503a8f9d42f86c4666e808af6c5e852c`.
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
16. **Inventory integrity:** Fulfillment commands require exact canonical lot allocations and current quality documents. Allocation and shipping record evidence without decrementing inventory a second time after checkout hold.
17. **Idempotency/audit:** Fulfillment, operations-task, partner-request, and professional-account RPCs are idempotent, stale-write protected where applicable, transition checked, and audited. Append-only evidence cannot be updated or deleted.
18. **Migration verification:** Migration 31 was applied twice to a disposable PostgreSQL 16 database after migrations 1–26. Fulfillment, CRM privacy/replay/stale-write handling, assigned tasks, partner-request replay, the full professional pipeline, RLS, grants, and record-count invariants passed.
19. **UI consistency:** The portals reuse the Research app, button, form, badge, typography, spacing, palette, and focus patterns. Interfaces were checked at desktop and 375px with populated, empty, and error states and no document-level horizontal overflow.
20. **UI evidence:** `docs/coordination/evidence/website-4-operations-desktop-ui-consistency.png`, `website-4-mitch-375-ui-consistency.png`, `website-4-affiliate-375-ui-consistency.png`, `website-4-professional-empty-375.png`, and `website-4-operations-error-375.png`.
21. **Secrets:** No secret values are committed or documented. Required names are `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and optional `RESEARCH_AFFILIATE_BASE_URL`.
22. **Rollback:** See `supabase/research-operations-affiliates-rollback-notes.md`. Prefer disabling Website 4 route/capability wiring and reverting the application SHA; preserve all ledgers and audit evidence.
23. **External integration blocker:** Canonical commerce migrations 20–26 are not yet present in production. Website 2 must also confirm checkout persists order-to-lot reservations in `research_lot_allocations`; Website 4 deliberately refuses allocation without that canonical evidence.
24. **Release sequence:** Apply canonical commerce migrations → confirm allocation bridge → apply Website 4 migration → register production guards/dependencies/routes → run integrated checks → merge → Render deploy → live role-based smoke test → logs/database verification.
25. **Route parity:** All 16 formerly missing partner endpoints now have literal authenticated server registrations, owner-scoped durable adapters, and parity tests. See `docs/coordination/WEBSITE_4_ROUTE_PARITY.md`.
26. **Newly finished missing scope:** Production-backed operational CRM commands/timeline, durable assigned operations tasks, partner campaign/event/organization/compliance intake, aggregate partner reports, hashed partner session history, and the complete prospect → discovery → diligence → commercial review → agreement → active/paused/closed professional pipeline.
27. **Validation:** `npm test` passed 145 files / 3,159 tests; `npm run check` passed; `npm run build` passed; focused Website 4 tests and disposable migration tests passed.
28. **Remaining scope:** The exhaustive classification and exact continuation packets are in `docs/coordination/WEBSITE_4_REMAINING_SCOPE.md`.
29. **Production smoke:** Pending Website 2 merge and Render deployment. Website 4 remains available for review fixes and will verify the released routes.

PRODUCTION STATUS: NOT YET MERGED

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS
