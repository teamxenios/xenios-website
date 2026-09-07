# Locked-gate Resources access: exact admission shape for the wall's owner

Written 2026-09-07 by `fable-recruiter-resource-hub-20260906` as source-bound input for A,
who owns `server/research/index.ts`. **Fable did not edit that file, `client/src/research/layout.tsx`
or `shared/research/auth-return-to.ts`.** This note corrects one detail in the earlier
`b1b41c80` handoff.

## What is measured, not assumed

Harness started with `PREVIEW_LOCK_GATE=1` (RESEARCH_PUBLIC unset, review password set),
signed-in Research Rep persona, bearer present:

| Door | Result under the locked gate |
| --- | --- |
| `GET /api/research/partner/me` | 200 (admitted) |
| `GET /api/research/partner/dashboard` | 200 (admitted) |
| `GET /api/research/partner/resources` | **401 "Access required."** |
| `GET /api/research/partner/resources/:id/download` | **401 "Access required."** |
| `GET /api/admin/research/resource-hub/resources` (admin bearer) | 200 (outside the wall) |

Evidence: `locked-gate-probe.json`, `locked-gate-partner-resources.png` in the evidence folder.

## The three gaps the founder's package names are real in this source

| File | Current state (verified) |
| --- | --- |
| `server/research/index.ts` | `MEMBER_SESSION_READ_PATHS` contains `/partner/links`, `/partner/me`, `/partner/dashboard`; no Resources entry. |
| `client/src/research/layout.tsx:386` | exempts exactly `/research/partners/links` and `/research/partners/dashboard`; Resources falls through to `PasswordPage`. |
| `shared/research/auth-return-to.ts:23` | safe `returnTo` list has links and dashboard; not Resources, so the destination is lost after sign-in. |

## Correction to the b1b41c80 handoff

That handoff said the download door should be admitted through
`MEMBER_SESSION_READ_PATHS` **and** `downstreamMemberGuardedDownload`. The second half is
wrong. `downstreamMemberGuardedDownload` (`server/research/index.ts:496`) matches only the
signed document URL shape `^/api/research/documents/<uuid>/download\?exp=<int>&sig=<43 chars>$`.
The Resource Hub download carries no signature: it is a bearer-authorized application path
whose authority is the member guard plus `withPartner` plus the hub's own entitlement re-read.
It would never match that predicate.

## The shape that fits this codebase

`memberSessionRoute` (`server/research/index.ts:617`) already admits both exact-set entries
and anchored id shapes in its GET branch. The Resources doors belong there, alongside the
existing `customer-account/documents/:documentId` precedent, which uses `canonicalUuid`:

- library read: add `/partner/resources` to `MEMBER_SESSION_READ_PATHS` (exact string);
- delivery: one anchored shape in the GET branch, `^/partner/resources/([^/]+)/download$`
  with `canonicalUuid(...)` on the captured id — no prefix opened, no write method admitted.

Both sit behind `if (bearer && memberSessionRoute(...))`, so admission still requires a
bearer and grants nothing on its own.

## Why this is admission, not permission (the safety bar)

The doors are registered by `registerPartnerPortalApi` with the injected `requireMember`
guard, and every handler runs through `withPartner`, which resolves the partner **from the
authenticated member only** (no id is read from the path, query or body). The hub then
re-reads entitlement at use time. The existing suites already pin each denial and none of
them depends on the wall:

| Case | Answer | Pinned in |
| --- | --- | --- |
| no bearer | 403 `forbidden` | `portal-routes.test.ts` |
| member with no partner record | 404 `partner_not_found` | `portal-routes.test.ts` |
| partner outside the audience | 404 `not_found` (never 403) | `portal-routes.test.ts`, `service.test.ts` |
| suspended / terminated partner | empty library, 404 on delivery | `service.test.ts` |
| draft-policy, unpublished, withdrawn version | 404 `not_found` | `service.test.ts` |
| unknown or non-canonical id | 404, no ledger row, no 503 oracle | `service.test.ts`, `supabase-store.test.ts` |
| admin doors with a partner bearer | 403 | `api-proof-journal.json` (56/56) |

So the wall change opens reachability for an authenticated member and changes no
authorization decision. A should still re-run the partner portal and resource-hub suites plus
the locked-gate probe on the combined tree, because that is where the wall and the hub meet.

## What is NOT recommended

No public-mode toggle, no `/api/research` prefix exemption, no admission of any write method,
and no trust in a browser-declared role. If A prefers a different shape, the measurement above
is the acceptance bar either way.
