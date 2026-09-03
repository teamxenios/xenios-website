# Xenios Care admin reliability — release packet (2026-09-03)

Incident: `CARE-2A99C6F7` — a public Care access request returned HTTP 201, was
durably saved and generated the internal email, but no admin surface could show
it. Priority P0. Production was not mutated by this work.

## 1. Identity

| Item | Value |
| --- | --- |
| Repository | `teamxenios/xenios-website` |
| Branch | `claude/care-admin-reliability-20260903` |
| Base SHA | `8cca3373047a2161f5360541a9b2fc5c71f8063f` (release branch head after the 2026-09-03 production-truth reconciliation; contains live `50c2d35c…`) |
| Tested code SHA | `ace27886dd3b76a8e5dcc982111bb7062e9e451b` |
| Records successor(s) above it | this packet and the continuity records only (named by description; a document cannot carry the hash of the commit that contains it) |
| Live production SHA (verified read-only) | `50c2d35cf543724fad17a61d9d5c36cf81fe5f21` — `dep-daatp715efls738v00dg` |
| Rollback SHA | `50c2d35cf543724fad17a61d9d5c36cf81fe5f21` (commit-pinned redeploy) |
| Render service | `srv-d8s9vej7uimc7384dfcg` (workspace `tea-d8nhh6a8qa3s73f4ocj0`), auto-deploy off |
| Migration | none required, none authorized, none applied |
| Environment change | none |

## 2. Root cause

`server/care/manual-access.ts` persists the request first (`insertLoi` into
`loi_submissions` with the bounded Care markers) and only then sends email, so
the durable record always existed. The defect was on the read side: no admin
projection, route, queue, navigation item or operational status workflow for
Care requests existed; the only operational notice was the email, and the row
sat inside the generic LOI store. Email must never be the system of record.

## 3. What ships

| Surface | Change |
| --- | --- |
| `shared/care/manual-access-admin.ts` | Closed admin contract: bounded routing DTO, six operational statuses (`New`, `Contacted`, `Secure intake sent`, `Provider handoff`, `Closed`, `Not moving forward`), strict status schema, path helpers |
| `server/care/manual-access-admin.ts` | `GET /api/admin/care/access-requests`, `GET …/:requestId` (id or CARE reference), `PATCH …/:requestId/status` — literal paths (census-visible), injected canonical `requireSupabaseAdmin`, `no-store`; inclusive strong-marker recognition; malformed operational JSON stays visible as `dataQuality: malformed`; failed/unknown notification state stays visible and flagged; generic LOIs never enter or mutate through the Care API; bounded error code `care_access_admin_unavailable`; no PII in logs |
| `server/care/index.ts` (seam, re-pinned) | Mounts the admin API from the same Care registrar as the public write path |
| `client/src/research/adapters/careAdmin.ts`, `pages/adminx/CareAccessRequests.tsx`, `lib/routes.ts`, `adminx-section.tsx`, `ui/shells.tsx` | `/admin/research/care-requests`: search (reference, name, email, phone, state), status and state filters, email/phone actions, operational status select limited to the approved vocabulary, notification-failure and data-quality alerts, summary metrics, honest loading/empty/unavailable/unauthorized states, standing no-PHI notice; `ADMIN_ROUTES.careRequests`; a "Care" navigation group |
| Gates | Route census pin `411/402 → 414/405`; seam baseline for `server/care/index.ts` re-pinned (`479e5158… → 7f48fd74…`, chained note); clinical-route-coverage classifies the three doors nonclinical with driven response proofs; admin-nav pin 6 groups / 27 links |

Response fields (only): `id`, `reference`, `fullName`, `email`, `phone`,
`locationState(+Label)`, `careGoal(+Label)`, `contactMethod(+Label)`,
`contactWindow(+Label)`, `status`, `emailStatus`, `createdAt`, `dataQuality`,
`attentionRequired`, `attentionReasons`. Never: IP, raw `why_interested`,
referrer/UTM, `nonbinding_ack`, or any clinical field.

## 4. Verification on the tested code SHA

| Gate | Result |
| --- | --- |
| Focused (`manual-access`, `manual-access-admin`, `manual-access-admin-wiring`, `integration-wiring`) | PASS (29 → 30 tests incl. literal-path parity) |
| Admin page jsdom + responsive source assertions | PASS 9/9 |
| Clinical-route-coverage + admin-shell nav | PASS 49/49 |
| Release control plane (records + census) | PASS 51 / 1 skipped |
| Core-site protection test | PASS 35/35 |
| TypeScript (`npm run check`) | 0 errors |
| Production build (`node script/build.mjs`, Node 20.19.0) | PASS |
| Provenanced candidate build (`build-candidate-preview.mjs`) | PASS at `3b206fa5` (client bundle identical to the tested SHA; only test files changed after) |
| Full sequential suite (`npm test`) | PASS — 810 passed / 4 skipped files (814); 12,126 passed / 43 skipped tests (12,169); 0 failed; 326 s (host Node, `npm test`) |
| Built-server probes (provenanced preview, unauthenticated) | `GET/PATCH /api/admin/care/access-requests…` → **401** (guard live); unknown `/api/admin/care/*` → 404 (control); `/admin/research/care-requests` → 200 shell |
| Browser responsive pass (1440/1024/768/430/390/360/320) | no horizontal overflow at any width; route mounts; "Care → Care requests" group renders first with active state; unauthenticated boundary renders the sign-in card. **Partial**: the populated queue was verified in jsdom, not pixel-rendered, because the preview harness has no admin session |

## 5. Negative controls proven

1. Unauthenticated request cannot list (401, built server + test).
2. Guard is the injected canonical `requireSupabaseAdmin`; no second auth path (wiring test pins the default).
3. Unrelated generic LOI never appears (test).
4. Generic LOI cannot be status-updated through the Care API (404, test).
5. Raw JSON, IP, UTM, `nonbinding_ack` absent from the response (test).
6. Clinical field names absent (test + driven proofs against seven sentinel identities/fields).
7. Malformed Care payload remains visible and flagged (test).
8. Failed email remains visible and flagged (test).
9. Unknown email state remains visible and flagged (test).
10. Invalid status rejected with 400 and no mutation (test).
11. Public writer output maps directly into the admin projection (contract test).
12. Seth-style row resolves to `CARE-2A99C6F7` (test).
13. Route/guard/manifest/router/adapter/nav removal breaks the wiring test.
14. Admin UI grants no authority; it only forwards the bearer token to the admin endpoint.
15. Status select offers only the approved operational vocabulary (page test).

## 6. Existing request recovery

| Proof | State |
| --- | --- |
| `CARE-2A99C6F7` durable in `loi_submissions` | **BLOCKED locally** — this session has no authorized read-only production database path (no Supabase credentials in the environment; the Supabase MCP connector is failing authentication). The production log evidence (POST → 201 at 2026-09-03T04:28:51Z, internal email generated) and the writer's persist-before-email order make durability the expected state; the projection recognizes any row with a strong Care marker. |
| Returned by the protected endpoint | post-deploy, read-only, with Samuel's admin session (smoke item below) |
| Renders in the queue | post-deploy, read-only |

Seth must not be asked to resubmit.

## 7. Risks and disclosures

- The generic `/admin` LOI surface still lists Care rows with the legacy LOI
  status vocabulary (`Reviewing`, `Followed up`, `Signed`); a status set there
  renders in the Care queue as a custom option until changed. Row sets are
  disjoint; no data loss. Follow-up: hide Care rows from the generic LOI list.
- `server/care/index.ts` now imports `requireSupabaseAdmin` from
  `server/routes.ts` as the production default; the import graph is acyclic
  (`routes.ts` imports nothing under `server/care`).
- Unclaimed follow-ups: normalized Care request table with governed migration
  (not needed for this P0); monitoring for successful-save vs admin-visibility
  mismatch (read-only, no production mutation).

## 8. Deployment (prepared, not executed)

Commit-pinned Render API deploy of the approved exact SHA (`POST
/v1/services/srv-d8s9vej7uimc7384dfcg/deploys` with `commitId` = the approved
SHA); never a branch-head trigger. Pre-deploy: capture the live critical-endpoint
baseline. Post-deploy smoke (read-only): `GET /api/health` 200; `GET
/api/admin/me` with Samuel's session 200; `GET /api/admin/care/access-requests`
with Samuel's session 200 and `CARE-2A99C6F7` present exactly once;
`/admin/research/care-requests` renders the record; no generic LOI appears; no
PHI or raw operational JSON appears; public `POST /api/care/access-request`
contract unchanged; critical-endpoint diff `REGRESSION=0`. Do not change Seth's
status during smoke. Rollback: commit-pinned redeploy of `50c2d35c…`.

## 9. Founder approval required

Approve deployment of the exact tested SHA `ace27886dd3b76a8e5dcc982111bb7062e9e451b`
(or its records-only successor named in the PR, whose runtime tree is identical)
to Render service `srv-d8s9vej7uimc7384dfcg`. Nothing is deployed until then.
