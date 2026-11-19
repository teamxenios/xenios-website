# Connect the protected operations report to the existing admin account

Owner: `codex-ea-analytics-20261118`, canonical `ANALYTICS` task and active lease `a2e98932-f7a5-48de-9305-b6c5850d256c`. Root granted six exact connection paths and byte-preserving reuse of eleven accepted adapter/core files from `12e8ab59cd7e5fd6aa71f1057e9ebc54c8005fd9`, over isolated base `e9d54eb5e9253362ca6f7624ab7f23689ac2eb19`. The original eight-path reuse was explicitly extended to the three existing project-scope support paths after the owner identified their dependency. Root retains the actual backend/global route/navigation mount, migration ledger, configured project identity, managed readiness and publishing decision.

## Existing contracts and required composition

`OperationsAnalyticsPage` composes the existing `AdminScreen`, accepted analytics client and `OperationsInsights` renderer. The canonical `useAdminSession` supplies the actual SDK binding; this page creates no second account system or identity selector. `AdminScreen` preserves its existing token argument and adds an optional second binding argument, so existing callers remain valid.

The optional `AdminSession.binding` field is either absent/null or an `AdminSessionBinding` with a never-reused generation, `isCurrent()` and `sessionFence(actualSdkSession)`. The fence restricts transport to the currently observed SDK credential and user. It grants no reporting permission. The server still requires the existing configured `requireSupabaseAdmin` gate, then verifies ordinary signed Auth, confirmed identity and the server-owned project scope. Existing Care request readers and account executives do not inherit admin reporting access.

The canonical hook invalidates reporting callbacks synchronously when the SDK session changes and before sign-out cleanup starts. A late initial session read must not overwrite a newer Auth event. Reporting stays revoked during pending/failed cleanup; background refresh is not an explicit sign-in. Existing cleanup tasks still finish before the actual SDK sign-out, preserving their prior behavior. A stale login completion or unmounted hook cannot reopen a reporting binding. The display-only admin email lookup has its own captured SDK identity/generation: prior email clears on a credential/user switch, and late fetch/body results cannot restore it under a different observed identity. Email remains display data, never authorization.

The page loads only the existing protected endpoint:

`GET /api/admin/research/early-access/analytics?day=YYYY-MM-DD&responsePopulation=request&responseChannel=portal_published`

The day is an America/Chicago calendar day; the server defines its actual window, including daylight-saving boundaries. Population and response channel are reporting filters. The browser supplies no actor, tenant, organization, project or environment authority. The accepted API client validates the complete twelve-metric report and uses the required canonical session fence before dispatch and after asynchronous work. Loading a new report clears the former report. Denied/expired contexts clear private data; unavailable, superseded and genuinely unmeasured results remain distinct from zero. Refresh/retry/cancel are explicit actions, not an automatic polling or retry service.

## Measurement truth

The current accepted snapshot RPC measures unclassified source coverage. `operationsReportFromSnapshot` intentionally returns `not_measured` for operational metrics until canonical fixture/cohort provenance is authoritative. An unclassified row count is not a production workload, conversion denominator or delivery rate. The page preserves that distinction and cannot make missing facts operational by displaying them.

Root's existing request-storage owner must supply the real server-owned provenance/cohort contract. Unknown legacy records remain unknown. Operational/test classification cannot come from a public request field, matching email, referral or browser scope choice. Actual lifecycle, payment, notification and recipient-specific delivery adapters remain separate evidence. This connection does not establish customer email reads or actual inbox delivery.

## Source dependencies and qualification

The accepted adapter requires the explicit project-scope contract from its original qualification. At the isolated base, three previously accepted support paths were absent: `shared/research/analytics/operations.ts`, `server/research/analytics/report.ts` and `report.test.ts` differed from accepted `12e8ab59`. The owner reported this finite dependency before qualification, and Root explicitly authorized restoring those exact accepted bytes. Project mode remains explicit; omitted scope kind preserves legacy tenant behavior and mixed kinds are refused. No project-to-tenant relabeling or type cast was introduced to bypass this distinction.

The eleven reused adapter/core files are source-preserved. Their prior qualification does not execute this new connection or prove the combined application. This increment adds 35 Auth/fence cases and 16 page cases, authored and unrun at this checkpoint. Independent review identified and corrected the stale display-email lifetime before execution. The page cases use the actual accepted client and renderer with synthetic SDK/session/fetch responses. Root owns one actual combined hosted qualification stream and required census/route tests; no local Node, compiler, test, browser or database allocation is started by this increment.

After the exact source qualifies, Root still composes the protected backend router and admin route/navigation, registers the snapshot candidate using the canonical migration process, and prepares the actual managed action for review. Website 2 requires the exact served SHA and legitimate admin context for a real browser result. Default missing-source/unavailable behavior is not a completed measured workflow.

## Documentation and action boundary

The current Supabase [changelog](https://supabase.com/changelog.md), [Auth event subscription](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) and [session read](https://supabase.com/docs/reference/javascript/auth-getsession) references were checked before implementation. Event callbacks remain synchronous, subscription cleanup is retained, and browser session observations are used only as local fences; the server remains the authority.

This source work changes no dependency version, backend/global route, managed schema/data, role, recipient, provider or message. Samuel's latest directive permits source commits, pushes, draft PRs and synthetic qualification; a concrete merge/deployment/production or real outbound action still needs his explicit approval. The separate public-presentation `49ccaf66` approval packet does not activate this reporting work.
