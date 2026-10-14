# Pending-intake staff-read alternative, r1: source review

**ACCEPTED as source design for a bounded, default-off pending-read authority. One material claim correction is
needed, and it changes no code: the database binds role and scope to the actor the server names, but it cannot prove
that actor is present.**

- **What is accepted.** The authorization change is narrow and fails closed.
  - It reuses the canonical Care principal resolver and the `clinical_admin` to `care:administer` mapping.
  - It never calls the whole-Care capability check.
  - It adds its own default-off flag, plus an approved row of its own in the existing `care_capabilities` registry,
    which both SQL readers check on every call.
  - Whole-Care flags, guard and endpoints are unchanged.
- **The correction.** In the real call path, the SQL `auth.uid()` clause is vacuous. So anyone holding the
  service-role key can read every pending request once the scope row is approved. With the exposed-credential
  condition still open, that scope row must not be approved until the condition is closed.
- **Not operational.** This review approves no capability, role, flag or adoption. Staff readback stays
  non-operational until those exist under separate authority.

This is a source review of unapplied, unmounted code. Nothing was run. It is not test, database, browser or runtime
qualification, and it is not consent to activate anything.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs,
source text and baseline files at `8e85daa`. No tests, parsing, patch application, queries or agents. R2 and R8 were
not re-reviewed, and the Doc 164 packet was not replaced. Archive:
`hl12/165_pending_intake_staff_read_alternative_r1_review.json`.

## 1. Binding

- **Source.** Core `bf33c7ca` (tree `e9fb3b43`, parent `b938e604`). Records: `a467117c` (tree `5cd8541b`), which
  adds `HANDOFF.json` only. All files sit in `staff-read-alternative-r1/`.
- **Base chain.** `8e85daa`, then R2 `fdbe3e80`, composition-r1 `e7347965`, and client-r3 `b938e604`.
- **Artifacts.** All four match the packet's pins:

| Record | Bytes | SHA-256 |
|---|---|---|
| `SOURCE_MANIFEST.json` | 9,201 | `884ee177…` |
| `DELTA_AFTER_CLIENT_R3.patch` | 36,727 | `f8c70e7e…` |
| `CUMULATIVE_AGAINST_8e.patch` | 191,002 | `1d8c59d6…` |
| `REVIEW_AND_QUALIFICATION.md` | 8,865 | `2d3b908a…` |

- **Bytes.**
  - All 20 committed files match the bytes reviewed, blob for blob.
  - The seven before-images equal the latest prior files: five from R2, and two (`production.ts`,
    `production.test.ts`) from composition-r1.
  - The patches have 9 and 28 file sections, as claimed. They were not applied or parsed.
- **Later commits.** `86302a5a` and `2b9dbc41` ("Option B", composition-r2) are not reviewed here. For its two
  overlapping paths, Option B's before-images equal this alternative's after-images, so it builds on this revision
  rather than conflicting with it.

## 2. Against the canonical resolver, schema and audit at `8e85daa`

- **Resolver** (`server/care/production-deps.ts`). The proposal calls the existing `resolvePrincipal`, which:
  - reads the bearer token and verifies it with the provider (`anon.auth.getUser`);
  - rejects recovery-purpose sessions (`otp`, `magiclink` and `recovery` methods, or no normal first factor);
  - loads active roles where `revoked_at is null`, and the patient index from `care_patients`, together;
  - keeps only recognized Care roles.

  It does not touch the capability. If Supabase or the anon key is absent, the fallback resolver returns no principal,
  so it can never authorize.
- **Permission.** In `shared/care/contracts.ts`, only `clinical_admin` maps to `care:administer`. The SQL requires the
  same role with the same `revoked_at is null` predicate, so the app and database layers agree.
- **Capability registry** (`supabase/care-access-foundation.sql`).
  - `care_capabilities.capability_key` has no check, so a `request_intent_pending_read` row needs no schema change.
  - The table's own check requires `approved_by` and `approved_at` whenever `state` is `enabled`.
  - Every existing reader and verifier filters on `capability_key = 'care'`, so a second row disturbs nothing. The
    foundation verifier's informational row count would read 2.
  - Re-running `care-prescription-pharmacy.sql` resets only the `care` row.
- **Role audit.** The guard writes `care_access_audit` exactly as `requireCarePermission` does:
  - permission `care:administer`;
  - outcome `allowed`, `forbidden` or `unauthenticated`;
  - written before the request is allowed through.

  Both values are within the table's checks, and an audit failure denies with 503. An allowed row records only the
  application role decision. It is not database approval and not a successful read.

## 3. What is sound

- **Two independent gates.**
  - **Flag.** `RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED` must equal exactly `"true"`, read on every request. When it
    doesn't, the guard answers 503 before any identity lookup or audit.
  - **Identity and role.** Next comes the canonical identity and role check. No principal gives 401, and the wrong
    role gives 403.
  - **Failures.** Adapter, patient-index and audit failures give 503 with no diagnostics.
- **Purpose and actor binding.**
  - The guard builds the context from the verified principal: purpose `request_intent_pending_read`, actor equal to
    its subject ID.
  - The service re-checks that context and passes `principal.subjectId` to the reader.
  - The staff routes refuse any query key other than `page` and take no body, so no caller-supplied actor or email can
    reach the reader.
- **Whole-Care independence.**
  - The guard never calls `loadCapabilityStatus`, and both SQL readers dropped the `care` key.
  - So whole Care may stay disabled while an approved pending scope allows pending reads only.
  - Whole Care enabled without the pending scope still grants no pending read: the SQL denies.
  - `requireCarePermission`, `/api/care` and both Care env flags are untouched.
- **Both SQL readers.** `staff_get` and `staff_list` each require, on every call:
  - the `service_role` role setting;
  - a non-null actor with a live `clinical_admin` assignment;
  - an `enabled`, approved `request_intent_pending_read` row.

  They write their `access_events` row inside the same call, so a failed audit returns no data. Wrappers are
  security-invoker, private functions are security-definer with an empty search path, and both are executable only by
  `service_role`. The candidate inserts or updates no capability or role row.
- **Revocation.** The SQL re-checks the role and scope at read time, so a revocation after the application resolved
  the principal still denies. The flag is re-read on every request.
- **Routes while public intake is off.**
  - Only GET or HEAD on `/staff` and `/staff/<UUID>` bypass the intake switch, and those reach only the two guarded
    handlers.
  - Config, catalog, submit and recover stay closed, and other staff paths and mutation methods answer 503.
  - The research wall is stricter than the router: exact path, and lowercase UUIDs only.
- **Private data.**
  - Every response carries private, no-store, no-referrer and noindex headers.
  - Staff detail returns contact, agreements and lines, and the reader rejects any line that is not pending.
  - There is no approve, pay, prescribe, supplier, fulfillment or document endpoint.
- **Negative tests.** Fifteen are written, not run, and they are aimed correctly against the real code. For example,
  the recovery test's `otp` token is in the canonical recovery set. They cover:
  - flag absent or malformed;
  - whole Care disabled while access is still allowed;
  - absent, expired, unverified or recovery sessions;
  - general admin and other Care roles;
  - adapter and audit failures;
  - wrong purpose and cross-actor contexts;
  - intake-off route limits;
  - caller-supplied actor or email;
  - static checks of both SQL bodies.

## 4. Material claim correction: actor presence is server-attested, not database-proven

- **Vacuous clause.** The packet and manifest say both SQL readers require "auth.uid consistency". In the real call
  path, that clause never fires:
  - the composition root's RPC client is the Supabase service-role admin client;
  - its JWT has no subject, so `auth.uid()` is null;
  - `(auth.uid() is not null and auth.uid() is distinct from p_actor_user_id)` therefore never denies;
  - with a user JWT, the role would be `authenticated` and the call would be refused anyway.
- **What the database does prove.** The named actor holds `clinical_admin` and the scope is approved. It does not
  prove that this person made the request.
- **Consequence.** Anyone holding the service-role key can find a `clinical_admin` user ID and call
  `request_intent_staff_get` or `request_intent_staff_list` for any request, once the scope row is approved.
  - Direct table reads stay revoked, even from `service_role`.
  - The resulting `access_events` would name that actor.
- **Required.**
  - Record this accurately in the manifest and qualification notes, including the static test name that says "real
    auth identity".
  - Do not approve the `request_intent_pending_read` row until the open exposed-credential security condition is
    closed and the service-role key is confirmed rotated.
  - Until approval, the scope check denies every read. That denial is the effective protection.

## 5. Recommended, not required

- **Truthful staff errors.**
  - A database refusal (`42501 request_intent_private_review_required`) becomes `request_intent_persistence_uncertain`.
    The router then answers 503 `request_outcome_unconfirmed` with the customer recovery notice ("retry the same
    attempt…"), and the composition test pins that 503.
  - The staff page shows its own generic text, so staff never see the notice. But a definite refusal looks like an
    outage, and the expected state after mounting (flag on, scope not yet approved) will read as 503 in monitoring.
  - Map that refusal to 403 `private_review_access_required`, and give staff routes their own 503 text.
- **Role-audit attribution.** The role audit can only record `care:administer`; the table's check fixes the allowed
  values.
  - While whole Care is disabled, `requireCarePermission` returns before auditing, so every such row comes from this
    guard.
  - Once whole Care is enabled, the two sources cannot be told apart. `access_events` remains the record of actual
    reads.
- **HEAD requests.** A HEAD on a detail path runs the full read and writes a `staff_read` event with no body delivered.
  Either serve GET only, or record that this is intended.
- **Audit volume.** With the flag on, each unauthenticated request writes one append-only role-audit row. The read
  limit bounds this at 120 per minute per IP. Include it in the resource and abuse window.
- **Lighter activation.** Activating whole Care needs database approval plus two env flags. This scope needs database
  approval plus one. Samuel should know that before deciding.

## 6. Remaining prerequisites

**Disposable database rehearsal**, before registration and only under granted authority, must prove:

1. **Foundation reconciliation.**
   - `supabase/care-access-foundation.sql` provides the capability, role and audit tables.
   - `supabase/care-eligibility-intake.sql` provides `care_patients`, which the resolver queries on every staff
     request and fails closed without.
   - Both sit outside the migrations folder. Reconcile their hosted history; don't assume it or blindly re-apply them.
2. **Role setting.** Through PostgREST, `current_setting('role')` inside the security-definer functions is
   `service_role`.
   - With the service key, `auth.uid()` is null and the clause does not wrongly deny.
   - With a user JWT, the call is refused.
3. **Forced row-level security.** The function owner can read the forced-RLS foundation tables, through bypass
   rights. Without that, every read is silently denied.
4. **Grants.** Only `service_role` executes the wrappers and private functions. `anon` and `authenticated` are refused,
   and schema usage is correct.
5. **Scope matrix.**
   - An approved, enabled row allows the read.
   - A missing, disabled, pending or unapproved row denies.
   - An enabled `care` row alone denies.
   - Whole Care disabled with the scope approved allows pending reads only.
   - An absent, revoked or other role denies, as does a wrong actor.
   - Revoking the role or the scope between application resolution and the SQL read denies.
6. **Audit.**
   - The `access_events` insert is atomic with the read, and a failure returns nothing.
   - The RPC runs in a read-write transaction, which is the default for the admin client's `rpc` call.
   - Role-audit inserts succeed, and their failure denies.
7. **R2 behavior.** The R2 items from Doc 163: pending-only immutability, owner isolation, create and replay under
   concurrency, and validator parity.

**Then**, in order:

8. **Source and custody.** An exact source exception and current protected custody for the composition.
9. **Local qualification.**
   - The 68 declared tests, plus HTTP checks of routes and methods with intake off and on.
   - HEAD behavior, and headers on every staff response including errors.
   - Typecheck, a production build, and the browser staff journey.

**Activation**, separate and requiring Samuel's explicit authority each time:

10. Close the exposed-credential condition and rotate the service-role key.
11. Create a real `clinical_admin` assignment for an adopted operator. Names stay deferred, as recorded.
12. Approve the scope row with a named approver.
13. Turn on the flag.

**Unchanged.**
- The Doc 164 findings stand: the material scope correction, the three integration items, and staff readback not
  operational.
- This alternative changes none of them, and Option B was not reviewed.
- R8 and Docs 160–163 stay closed, and the application `8e85daa` is unchanged.
- Failed run `790af2ce` stays FAILED, and the payment and security holds stay open.

Not execution consent, not human approval, not test credit, and not activation, push or deployment consent.
