# Website 6 release coverage matrix

| Requirement | Automated evidence | Release interpretation |
|---|---|---|
| Route inventory and persona mapping | `script/qa-route-inventory.mjs`; generated JSON/Markdown; persona matrix | Missing manifest wiring, adapter/server parity, visible guards, and private sitemap entries are release failures |
| Auth and authorization | Existing member/admin/commerce route tests plus browser expired-session and concurrent-tab recovery | Browser state is presentation evidence; server tests remain authoritative |
| Browser journeys | Public sitemap smoke, Research dev-gallery states, redirects, Care-disabled check | Fixtures are test-only and never count as production completion |
| Mobile/reflow | Playwright 320/375/430/tablet/desktop projects | Horizontal overflow and target-spacing failures block |
| Keyboard/accessibility | Focus, labels, invalid state, axe WCAG 2.2 AA scans | Critical/serious violations block |
| Forms | Application form labels/required validation plus existing application, claim, login/reset, assessment, commerce, partner, profile, inventory/fulfillment domain tests | A visible form with no registered server route is a parity failure |
| Uploads/private Storage | Existing identity, media, documents, e-sign, product-request provider and route tests; migration bucket/grant checks | MIME/size/path/member isolation remain server-authoritative |
| Loading/empty/error/retry/disabled | Research gallery state scans plus existing component/route tests | Honest unavailable is acceptable; invented success is not |
| Expired session/concurrent tabs | `redirects-sessions.spec.ts` | Both tabs must recover without exposing content |
| Notification idempotency | Existing outbox, activation-email, commerce webhook, SLA, product-request and persistence idempotency tests | Retry/replay/concurrent worker must retain one durable event |
| Leak/secret/PII scan | `qa-leak-scan.mjs` plus browser URL/storage scan and existing redaction tests | Source and built client artifacts must be clean |
| Performance budgets | `performance-budgets.json`, browser Web Vitals test, production bundle gzip/image gate | Budget regressions block unless explicitly rebaselined with evidence |
| SEO/sitemap/redirects | Public route metadata/canonical checks, sitemap/private exclusion gate, legacy redirect journeys | Research/admin/Care-private surfaces never enter sitemap |
| API parity | Generated adapter/server parity gate | Known missing partner endpoints are an active release failure |
| Migration/RLS/grants | Static bundle fidelity plus full disposable PostgreSQL application | Any apply error, RLS-off table, unexpected policy, or browser-role grant blocks |
| Production smoke/synthetics | `qa-production-smoke.mjs`, `synthetic-monitors.json` | Read-only; live evidence is required after Website 2 deploys |
| Parallel PR gaps | `WEBSITE_6_PARALLEL_PR_GAPS.md` | No PR is not a pass; recheck before freeze |

