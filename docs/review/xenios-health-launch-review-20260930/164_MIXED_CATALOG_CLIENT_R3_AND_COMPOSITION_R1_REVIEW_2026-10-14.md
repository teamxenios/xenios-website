# Mixed-catalog request intent: client correction and mounting composition

**The Doc 163 client correction is ACCEPTED. The mounting composition's guards are sound, but its scope statement
needs one material correction: it replaces the live assisted-order customer entry rather than adding a new one
beside it.**

- **Accepted.** Client-r3 separates known first-POST refusals from unknown outcomes exactly as Doc 163 required.
- **Material scope correction.** The composition sends both customer doors to the new form and gates the storefront's
  full catalog on a new flag that is off by default. The baseline records the old assisted-order journey as live in
  production. Section 4 sets out the decision this needs.
- **Staff readback.** The staff page is mounted correctly, but it cannot work while Care is disabled. It is not
  accepted as operational.

This is a source review of unapplied, unmounted code. Nothing was run. It is not test, database, browser or runtime
qualification, and it does not mean the full goal is live.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs,
source text and baseline files at `8e85daa`. No tests, parsing, patch application, queries or agents. R2 and R8 were
not re-reviewed. Archive: `hl12/164_mixed_catalog_client_r3_and_composition_r1_review.json`.

## 1. Binding

| Revision | Core commit | Tree | Parent | Files |
|---|---|---|---|---|
| composition-r1 | `e7347965` | `2b85d4ce` | `fdbe3e80` (R2) | 27 |
| handoff record | `253e0ade` | `10704622` | `e7347965` | adds `HANDOFF.json` only |
| client-r3 | `b938e604` | `e36922e5` | `253e0ade` | 15 |

- **Bytes.** Every committed file under both namespaces matches, blob for blob, the bytes reviewed here.
- **Chain.** R2, then composition-r1, then client-r3.
  - Each client-r3 before-image equals the composition-r1 after-image. Where composition-r1 left a file alone, it
    equals the R2 file instead.
  - The six existing application files' before-images equal their `8e85daa` blobs.
- **Records.**

| Record | Bytes | SHA-256 |
|---|---|---|
| composition `COMPOSITION_MANIFEST.json` | 15,249 | `e12cf5e1…` |
| composition `DELTA_AFTER_R2.patch` | 50,008 | `7920da6e…` |
| composition `CUMULATIVE_AGAINST_8e.patch` | 161,762 | `1306e37d…` |
| client-r3 `SOURCE_MANIFEST.json` | 7,232 | `723bba9a…` |
| client-r3 `DELTA_AFTER_COMPOSITION_R1.patch` | 20,697 | `ab4e7dbb…` |
| client-r3 `CUMULATIVE_AGAINST_8e.patch` | 173,241 | `c2293750…` |

- **Method.** No patch was applied or parsed. This review reads the after-images.
- **Out of scope.** Later commits `bf33c7ca` and `a467117c` (the separate staff-read alternative) are not part of
  this packet and were not reviewed.

## 2. Doc 163 correction: accepted

- **Status exposed.**
  - `request-intent-api.ts` raises `RequestIntentHttpError` carrying the HTTP status. It does so only when the body is
    a well-formed error envelope, with a code matching `^[a-z][a-z0-9_]{0,79}$`.
  - A missing or malformed body stays an unknown failure.
- **Known refusal.** This means a 400, 401, 403 or 429 on the first actual POST of the attempt.
  - The POST counter increments inside the post callback, after the marker write and immediately before the submit
    call.
  - Neither a click nor a marker write counts as a POST.
- **Unlock conditions.** The form unlocks only if all three of these hold:
  - it is the same mounted instance;
  - the frozen payload is still the one that was sent;
  - the owned marker was removed and verified gone.
- **Unlocked behavior.** The form then:
  - discards the frozen payload and key;
  - unchecks the acknowledgments;
  - shows "not saved" guidance matched to the cause;
  - allows a fresh attempt.
- **Everything else stays unknown.** That covers:
  - 409, any 5xx, network failure, and a malformed or missing body;
  - any refusal after an earlier POST;
  - a stale mount, an ownership change and a storage failure.
- **Tests.** Eight new written tests cover both branches. They have not been run.
- **Scope.** There is no server, SQL, mounting or authorization change. The optional Doc 163 recommendations
  (database error mapping, contact cap, billing address) stay optional and open.

## 3. Composition: what is sound

**Server** (`request-intent/production.ts` and `server/index.ts`):

- **Dark by default.** The new door opens only when all of the following hold:
  - the new `RESEARCH_REQUEST_INTENT_ENABLED` is `"true"`;
  - the origin is valid;
  - an RPC client and the agreement gate exist;
  - the canonical legal pairs are non-empty.

  Form-acknowledgment kinds cannot pose as legal pairs. While disabled, every door answers 503 and no RPC runs.
- **Origin.**
  - The origin comes from the configured `SITE_URL` only. It must be https, or http on localhost, with no credentials,
    path or query.
  - POSTs require that exact Origin, a JSON content type, and same-origin Fetch Metadata when that header is present.
  - Host headers never set the origin, and the referral cookie is not reused.
- **Rate limit.**
  - Requests go through the existing atomic `research_rate_limit_hit` RPC. The key is a purpose prefix plus the
    SHA-256 of the trusted request IP.
  - An unknown IP, an RPC error or a non-boolean answer returns 503. A denial returns 429.
  - There is no in-memory fallback.
  - The bounds (120 reads per minute, 20 writes per 10 minutes) are proposals that need qualification.
- **Standing.** The standing contract is identical to the existing bridge's:
  - a live member or Early Access session that carries a session hash;
  - a customer reference;
  - the durable agreement gate.
- **Bearer.** A request with an Authorization header that does not resolve to a member with an auth user ID is refused
  with 401. It is never downgraded to cookie ownership.
- **Headers and writers.**
  - Every response is private, no-store, no-referrer and noindex.
  - No outbox, mirror, payment, provider or supplier writer is composed.
- **Seam change.**
  - In `server/index.ts`, the only change is a typed extraction of the existing wiring object and one registrar call.
    Both compositions share exactly the same wiring.
  - The JSON body parser is registered earlier, and `careAccess` and the viewer resolvers are in scope.
  - The registration sits in the same async boot step as the existing doors. Nothing in the constructors throws
    synchronously.
  - The one boot-time reader, `reviewedHeldSpecifications`, is already called and memoized by the existing bridge
    just before.

**Research wall** (`server/research/index.ts`):

- **Exact entries only.**
  - GET: config, catalog and staff.
  - POST: the root and recover.
  - Staff detail: one anchored, lowercase-UUID regex.

  There is no prefix exemption.
- **Submit path.** The submit path changed from `/` to the empty string, so the POST matches the exact wall entry.

**Customer entry:**

- **Both doors.** The standalone `/research/early-access/order-request` and the embedded storefront render the same
  form.
  - The form is keyed by identity, not by token.
  - Account recovery or failed verification blocks submission and points to support.
- **Continuation.** The interface gates continuation on the existing agreement standing. The server remains
  authoritative.
- **Clinical link hint.**
  - The form scans the whole family in the neutral catalog and requires exactly one match.
  - That match must be requestable, and its quantity allowed. The cap of 100 matches the SQL.
  - The customer must press Add. The hint never redirects to the Care resolver and never adds anything itself.
- **Placement.** The request call-to-action sits outside the legacy cart mount.
- **Sign-out.** The sign-out storage sweep is byte-identical.

**Staff page:**

- **Routing.** `/care/request-intents` sits inside the existing Care section switch. Unknown paths still fall through
  to not-found.
- **Credentials.** `careApiFetch` attaches only a non-recovery Supabase session bearer.
- **Authority.** The server's Care permission and the database's `clinical_admin` check stay authoritative. Website
  admin rights alone grant nothing.

**Protection manifest:**

- **Two lines.** Exactly two lines change, both in `seamBaselineHashes`. The new values equal the SHA-256 of the
  after-images.
- **Write zones.** Every client path is inside the allowed write zones: `client/src/research/`, `client/src/care/`
  and `server/research/`.
- **Unchanged.** `App.tsx`, logging and the lockfile are unchanged.

## 4. Material scope correction: this replaces the live order-request journey

**What the code does.**

- `section.tsx` routes `/research/early-access/order-request` to `RequestIntentEntry` instead of `AssistedOrderPage`.
- On the storefront, the All products section now renders the request form.
- The storefront's open/closed signal (`bridgeState`) now comes from the request-intent config, not the
  assisted-order config.

**What the baseline records.** The assisted-order bridge is live in production:

- `production-env-shape.fixture.json`, captured read-only on 2026-08-29, carries
  `RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=true`;
- `production-wiring.test.ts` describes the bridge as live since the 2026-08-21 launch.

**Why the manifest's wording is wrong.** The composition manifest says "Existing AssistedOrderPage, service,
wizard-state and payment guard unchanged". That is true of the files only:

- after this composition, no customer route reaches the wizard;
- confirmation and status pages for existing references stay routed, and the old server doors stay composed.

**Consequence if released with the new flag off**, which is its default:

- the storefront loses its All products catalog;
- every authenticated Early Access customer sees "Request intake is currently unavailable" at the top of the
  storefront;
- the order-request page cannot submit anything.

The live order-request journey stays gone until the new flag, schema and RPCs are all live.

**Required before application.** One of the following:

- **A.** Samuel explicitly approves replacing the live assisted-order request journey with request intents. The
  release then enables the new flag in the same window as the qualified schema, and the manifest states the
  replacement.
- **B.** The existing assisted-order entry stays as the fallback while the request-intent flag is off, so mounting
  adds a journey instead of replacing one.

This review does not choose between them. It is a product and release decision.

## 5. Required integration items

These are not design defects, but each must be closed in the integration packet.

1. **An existing storefront test will fail as written.**
   - At baseline, `EarlyAccessRoute.storefront.test.tsx` stubs only `/assisted-orders/config` and
     `/assisted-orders/catalog`. It also drives the wizard's test IDs (`order-card-add-…`, `order-continue-contact`).
   - Under the composition, the new probe receives a generic body and reads as disabled, and the new form has no such
     IDs. This is predicted from source, not run.
   - Update that test, and add tests for the new route wiring. The 14 new declarations cover the server composition,
     transport and form. They do not cover `EarlyAccessRoute`, the Care section or the Care page.
2. **The staff URL is missing from the HTTP document policy.**
   - `/care/request-intents` is not among the raw HTTP document policy's known Care paths, though every other Care
     page is.
   - A direct load or refresh therefore returns HTTP 404 with the app shell. The page still renders.
   - Register it as a known private, noindex document.
3. **Seam re-pin provenance is missing.**
   - Every earlier seam re-pin in the protection manifest records the old hash, the new hash, the lease and the reason
     in `seamBaselineHashes.$comment`. This one changes the hashes without that entry.
   - Add the entry at application, under the actual custody lease.
   - The gate only reports a seam mismatch, so the re-pin does not certify itself.

## 6. Recommended, not required

- **One shared config request.** The call-to-action and the storefront now probe the config separately, where the
  baseline shared one cached request.
  - Under a 429 or a transient failure, the two probes can disagree.
  - The route comment that promises one shared request is no longer true.
  - Reuse a cached probe.
- **Registration order.** Register the request-intent API after the existing ten assisted-order doors. Then a future
  construction error cannot stop the live doors from registering, which was the 2026-08-29 incident pattern.
- **Staff sign-in return.** Give the staff sign-in link a return path, and admit `/care/request-intents` to the
  sign-in return list. Today staff must navigate back by hand.

## 7. Staff gap: unchanged, not accepted as operational

- **Refused today.** With Care hard-disabled in production:
  - `requireCarePermission` refuses everyone;
  - the database check needs an approved, enabled Care row.

  Every staff member will see a refusal on the staff page.
- **The alternative.** The separate restricted reader (`bf33c7ca`) is not in this packet and needs its own review.
- **Nothing inferred.** This review infers no Care enablement, role or operator.

## 8. Remaining prerequisites

1. **Section 4 decision.** Replace the live journey with approval and a same-window flag, or keep the fallback.
2. **Staff authority.** Either a reviewed separate reader, or Samuel's explicit decision to enable Care.
3. **Database.**
   - Rehearse the R2 SQL on a disposable database, covering the Doc 163 list.
   - Confirm the hosted database has `research_rate_limit_hit` (defined in `supabase/research-referral-fraud.sql`)
     and the Care foundation tables.
   - Then place and register the migration.
4. **Protected custody.**
   - A narrow seam edit of `server/index.ts` and `server/research/index.ts`.
   - The manifest re-pin, with its provenance entry.
5. **Section 5 items.**
6. **Local qualification.**
   - Apply the client-r3 cumulative patch to `8e85daa` in a disposable worktree. That patch alone contains all 26
     paths, so do not also apply either delta.
   - Run typecheck, the 53 declared tests and the affected baseline tests.
   - Run the seam, protection, route-census and release checks. The new doors are registered in `production.ts`, not
     as literal registrations in `server/index.ts`.
   - Run a production build.
   - Run the browser journey, with the flag both off and on:
     - save, replay, known refusal, and unknown outcome with recovery;
     - the clinical link;
     - both doors;
     - staff readback, once an authority exists.
7. **Hosted.**
   - A valid `SITE_URL`.
   - Legal applicability of the deployed agreements to mixed requests.
   - The new flag enabled only after the schema is live.
   - Release with Samuel's explicit approval.

**Unchanged.** R8 and Docs 160–163 stay closed. The application `8e85daa` is unchanged, failed run `790af2ce` stays
FAILED, and the payment and security holds stay open.

Not execution consent, not human approval, not test credit, and not push or deployment consent.
