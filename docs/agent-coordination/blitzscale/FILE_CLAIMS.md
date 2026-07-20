# Blitzscale file claims (mirror of ../file-claims.md, graph view)

Authoritative claims live in `docs/agent-coordination/file-claims.md`. This is
the graph-node view. One owner per glob; violations rejected at review.

| Glob | Node | Owner window |
|---|---|---|
| server/research/{identity,agreements,activation,profile,assessment,blueprint,plans,documents,tracker,media,telegram,questions}* | G2-G5,G10 | Website 2 |
| server/research/{products,guides,inventory,commerce,orders,subscriptions,shipping,fulfillment,referrals,partners,commissions}* | G6-G8 | Website 3 |
| content/research-products/**, content/research-guides/**, content/research-goals/**, docs/research-content/** | G6 | Website 3 |
| docs/research-legal/**, docs/research-operations/document-control/** | paperwork | Website 2 |
| client/src/research/** presentation + *.test.tsx | G9 | Website |
| client/src/pages/Admin* | G10 | Website 2 (+coordinator for diagnostics) |
| docs/agent-coordination/**, blitzscale/**, script/** integration+release, shared/research/* barrels | G0,G11-G13 | PowerShell coordinator |
| SHARED: server/index.ts, server/routes.ts, server/research/index.ts registration, client/src/App.tsx, client/src/research/{section,layout,core}.tsx, package.json | — | coordinator (temp owner; handoff to change) |

Do NOT edit merged PR #25 internals (members.ts, member-auth.ts, membership.ts,
outbox.ts, guards.ts, recovery.ts, paths.ts auth/recovery logic). Extend via
new modules and the frozen contracts.
