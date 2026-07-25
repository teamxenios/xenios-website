# Website 6 handoff — final QA, accessibility, and test automation

1. **Session:** Website 6 — Final QA, Accessibility & Test Automation
2. **Owner:** Codex QA lane
3. **Repository:** `teamxenios/xenios-website`
4. **Branch:** `test/website-6-final-qa`
5. **Base at start:** `a486b88` (`main`, 2026-07-25)
6. **Command Center:** https://github.com/teamxenios/xenios-website/issues/44
7. **Scope:** QA tooling, route/persona coverage, browser/mobile/accessibility, privacy/leak checks, performance/SEO, migrations/RLS, smoke and synthetic monitoring
8. **Out of scope:** Feature implementation, merge, deployment, production mutation
9. **Current wave:** Wave 1 — inventory
10. **Working tree:** Isolated QA worktree; pre-existing user changes in another worktree were not touched
11. **Route inventory:** In progress
12. **Persona matrix:** In progress
13. **Browser journeys:** Pending
14. **Accessibility/mobile:** Pending
15. **Forms/uploads/states:** Pending
16. **Auth/authorization/privacy:** Pending
17. **Notification idempotency:** Existing domain tests discovered; cross-cutting coverage pending
18. **Migrations/RLS:** Production migration ledger discovered; disposable PostgreSQL verification pending
19. **Performance/SEO:** Budgets and automated checks pending
20. **Leak/secret scans:** Pending
21. **Parallel PR review:** Blocked on inputs — no open Website 1, 3, 4, or 5 PRs existed at registration
22. **Validation:** Focused groups pending; full `npm test`, `npm run check`, and `npm run build` will run once at branch readiness
23. **Release state:** Not ready; draft PR not yet opened; nothing merged or deployed

## Resume point

Continue from Wave 1 inventory in the isolated `test/website-6-final-qa`
worktree. Recheck Command Center issue #44 and open PRs before final evidence.

