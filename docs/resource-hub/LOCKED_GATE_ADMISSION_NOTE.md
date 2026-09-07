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
and anchored id shapes in its GET/HEAD branch. The Resources doors belong there, alongside the
existing `customer-account/documents/:documentId` precedent, which uses `canonicalUuid`:

- library read: add `/partner/resources` to `MEMBER_SESSION_READ_PATHS` (exact string);
- delivery: one anchored shape in the GET/HEAD branch, `^/partner/resources/([^/]+)/download$`
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
| no authenticated member attached | handler 403 `forbidden`; the locked wall refuses no bearer with 401 | `portal-routes.test.ts` (handler-only), historical preview probe (wall) |
| member with no partner record | 404 `partner_not_found` | `portal-routes.test.ts` |
| partner outside the audience | 404 `not_found` (never 403) | `portal-routes.test.ts`, `service.test.ts` |
| suspended partner | empty library, 404 on delivery | `service.test.ts`, historical preview probe; terminated is also blocked in source, not exercised by this probe |
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

---

## Pre-verified patch for A (measured, then reverted; A's file is untouched here)

Fable applied the shape above to a LOCAL working copy of `server/research/index.ts`, measured
the full safety bar under `PREVIEW_LOCK_GATE=1`, then reverted. The branch contains **no**
change to that file. The exact diff is `docs/resource-hub/locked-gate-admission.patch`
(12 added lines, comments included) and the probe is
`docs/resource-hub/locked-gate-safety-bar.mjs`.

Run it against a **fresh, disposable local** locked-gate harness. The probe creates,
reviews, publishes and withdraws synthetic resources through the preview admin API; it
is not read-only. Reusing a seeded process fails the initial-draft assertions. The probe
accepts loopback HTTP origins only and refuses an unlocked gate before seeding:

```bash
PORT=5232 NODE_ENV=development PREVIEW_LOCK_GATE=1 node node_modules/tsx/dist/cli.mjs scripts/preview-resource-hub.ts
BASE_URL=http://127.0.0.1:5232 OUT_FILE=locked-gate-safety-bar.json node docs/resource-hub/locked-gate-safety-bar.mjs
```

### Historical measurement (original probe, not corrected-probe acceptance)

| Run | Library | Delivery | Safety bar |
| --- | --- | --- | --- |
| Before the patch (this branch as pushed) | 401 | 401 | **5 pass / 1 fail** in the saved artifact |
| After the patch (local, reverted) | 200 | 200 with PDF bytes | **19 reported pass / 0 fail**, with the limitations below |

The before artifact's failure is the unrelated-path row: the preview boundary returned
404 while that earlier assertion expected 401. The later script accepted the preview
404. The earlier claim of 6/6 did not match the saved before artifact.

Recorded response observations with the patch applied, gate locked:

- the rep library assertion found the rep-only and shared fixture IDs, and excluded the
  draft-policy and withdrawn fixture IDs; it did not assert the complete response shape;
- the affiliate library assertion found no `REP-ONLY` title, and rep-only delivery returned
  404 `not_found`; the title check alone does not establish absence of every metadata field;
- a signed-in member with no partner record gets 404 `partner_not_found`;
- a suspended partner gets an empty library and 404 on delivery;
- withdrawn and draft-policy resources are denied;
- an unknown uuid is denied 404; the HTTP probe did not inspect the ledger;
- a malformed id is refused at the wall with 401 before the handler runs (stricter than the
  handler's own 404; neither answer reveals whether a resource exists);
- no bearer and an invalid bearer are refused;
- POST on either Resources path and GET commissions receive the preview boundary's 404;
  these requests never reach the research wall, so they do not prove its method/path policy.

The original leak assertion inspected summary rows, not response bodies. Its reported
pass is **not leak evidence**. The direct service and portal-route projection tests remain
separate evidence; their results do not retroactively repair the historical HTTP artifact.

Artifacts: `locked-gate-safety-bar-before.json`, `locked-gate-safety-bar-after.json` in the
evidence folder.

### Corrected probe and its limits

The corrected script asserts library reachability and exact delivered fixture bytes,
runs downstream denial checks even if admission fails, and exits nonzero on an assertion,
transport, parse, setup or output failure. It checks every upload/review/publication/
withdrawal transition, including the expected 409 refusal to publish draft-policy material.
Library assertions require the exact permitted fixture versions. The response-body leak
check examines decoded JSON and raw bytes in memory, retaining only a boolean; no raw
response, arbitrary server error/code or matched private value is logged or persisted.
The check covers named private fields and known fixture actor/token/review values, not arbitrary
unknown secrets.

Evidence carries `claimScope: LOCAL_PREVIEW_ONLY` and per-row scope. The three intercepted
method/sibling-path rows explicitly assert the preview boundary's own error marker. They
must be supplemented by tests without that boundary to prove selective wall admission.

The harness injects `previewRequireMember`, which maps fixed preview tokens to personas.
It does **not** invoke canonical `requireMember` for these partner requests. A combined-source
test must separately exercise verified member identity, recovery-session refusal, closed
accounts, and real partner lookup. The preview also mounts the portal unconditionally;
production mount flags (`AFFILIATE_SYSTEM_ENABLED`, `AFFILIATE_PORTAL_ENABLED`) and Resource
Hub enablement are separate checks. This GET probe does not establish HEAD behavior,
browser sign-in/returnTo, terminated-partner behavior or delivery-ledger contents. In
particular, draft-policy publication is refused during setup, so the HTTP denial observes
an unpublished draft; the service test for an already-published draft-policy version is
separate evidence.

The original before/after JSON files are retained as historical measurements. Run the
corrected probe on the combined tree to produce new evidence; no old 19/19 claim is
carried forward as acceptance. Its network-free self-tests can be run independently:

```bash
node --test docs/resource-hub/locked-gate-safety-bar.test.mjs
```

### What A still owns

Applying the patch, the `client/src/research/layout.tsx` exemption and the
`shared/research/auth-return-to.ts` safe-return entry, then re-running the gates on the
combined tree. All three changes are necessary, but the sign-in journey also needs a
Resources return destination at the unauthorized page action: `ResearchRouteBoundary`
currently links to literal `/research/sign-in`. The safe-return entry cannot restore a
destination that the action never supplied. Keep that focused UI correction with its
owner; do not add a stronger active-member status requirement merely to obtain a redirect.
Historical measurements are author-reported evidence from Fable, not independent acceptance.
