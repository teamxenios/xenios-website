# Optional referral intake — source candidate

Task EA-REFERRAL-INTAKE-VERTICAL-20261118; original grant 2026-11-18T21:13:55.889Z. Owner codex-ea-auth-protocol-20261118, existing staff_mfa session reassigned to this slice. Isolated branch codex/ea-referral-intake-20261118 from e7fb20a28788879f1d85232b954f23a03ba5d0d2. Twenty-three original paths plus contact-admission-rpc.ts/test transferred explicitly by Root. No Auth/MFA experiment, production account, existing customer request or completed staff evidence is changed.

## Behavior and boundaries

An optional “Who referred you?” name belongs to the existing owner-scoped contact journey. The supplied parser is reused without its package runner: NFC, whitespace normalization, 80 Unicode code points, ordinary punctuation, separate legacy 2–24 character code grammar, rejection of controls, lone surrogates, authority fields and accessors. Names are never inferred to be codes. Unknown/ambiguous names remain unverified reported text; there is no directory search, arbitrary account match, partner binding, assignment or commission action.

The admission API sends an explicit allowlist. A status GET returns standing, policy revision, optional lifetime, referralEnabled and a non-bearer per-row referralRevision UUID only. It returns no name, code, contact or address. React holds the original contact draft only for that mounted owner/policy; reload, owner change and start-another do not reconstruct it. No reported name/code is added to browser storage, URLs, analytics, logs or customer receipts.

The new optional-intake command is one of:

```json
{"referralChoice":{"mode":"use_saved","admissionRevision":"10000000-0000-4000-8000-000000000001"}}
{"referralChoice":{"mode":"replace","referralName":"Synthetic Person","referralCode":"REPORTED"}}
{"referralChoice":{"mode":"omit"}}
```

`replace` requires a name or code; `omit` accepts neither; `use_saved` accepts only the opaque revision. The existing goal and code-only legacy inputs remain valid. Mixing legacy top-level referral facts with a choice is refused. Top-level referralName is a staff projection, not an implicit public submit command. The form requires a choice when a temporary row is available, shows the optional section open, and freezes it with the existing attempt. “Remove optional answers” emits omit, including after use_saved was selected. Start-another does not reuse the former request's default. Product/category/guide/holds, Auth, Care and payment authorities are unchanged.

## Private transaction

`catalog_referral_admission` is a private child of the existing expiring contact record. It shares the parent's owner/policy key, has an opaque UUID for the admission instance, and pins the exact parent expiry. The new atomic put uses the original lock/address writer and writes the referral in the same transaction. Same facts replay without renewing TTL or revision; different referral conflicts. Parent purge cascades to this child. A missing erased child is not rebuilt by an apparent replay. New explicit admission after parent expiry/deletion gets a new UUID; a stale request cannot use it as the earlier instance.

`reported_referral_snapshots` is a separate private request child with mode, reported name/code and capture time. It has no two-hour TTL. Its applicable durable policy is the existing request_policy_snapshots row. The new create_with_referral RPC refuses a new referral command unless that policy capture actually exists. No period, consent, approval or policy record is invented. The same request INSERT fires the existing policy/workflow/outbox triggers. Later referral, goal or audit failure rolls back all effects.

Actual INSERT RETURNING identifies the winner even if a concurrent legacy writer proposed the same request UUID. Only the winning insert creates context and reported snapshot. Existing exact attempts return the original receipt/fingerprint before touching temporary admission, policy configuration or erased context. Changed command on the same attempt conflicts. Retry cannot recreate an erased snapshot or goal. No additional sales lead/outbox or duplicate assignment table is introduced; the AE lane consumes committed canonical requests through its own authorized identity bridge.

## Stable server interfaces

- `privateContactAdmissionRpc(client, retentionSeconds, referralEnabled=false)` and `makeCatalogAdmission(legal, hasher, custody, retentionSeconds, referralEnabled=false)` default to the old address RPC/v3 key. Explicit true enables the new versioned RPC/v4 key and name UI. Existing composition is deliberately unchanged in this lease.
- `request_intent_catalog_referral_status(p_owner_binding text,p_policy_revision text)` returns only admitted/opaque revision.
- `request_intent_catalog_referral_put(...existing contact/address/TTL...,p_referral jsonb)` returns committed/already_same/different_contact.
- `request_intent_create_with_referral(p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb,p_context jsonb,p_admission jsonb)` receives the frozen command; p_admission is derived server-side from resolved owner/session/current legal authority. It returns the existing minimal stored receipt/fingerprint.
- `request_intent_referral_staff_get(p_request_id uuid,p_actor_user_id uuid,p_scope text)` accepts operator or staff only. It calls the existing operator_get(...,true) or staff_get_with_context first, preserving current authorization and audit, then adds reported name/code. No browser-selected actor or AE authority is accepted. Both the existing optional-context read flag and the new explicit `requestIntentStaffReader(client,readOptional,readReferral=false)` constructor argument control this projection; default false preserves the old RPC.

All new tables revoke direct privileges from PUBLIC, anon, authenticated and service_role and enable RLS. Public wrappers are SECURITY INVOKER; private definers have empty search_path and backend-only grants. Old RPC signatures are preserved. Current Supabase changelog and [database function security guidance](https://supabase.com/docs/guides/database/functions) were read; no SDK/CLI upgrade or dependency change is involved.

## Qualification state

Authored, not yet executed: shared parser/command tests; client admission serialization and metadata stripping; mounted HTTP gate/name trace; admission UI valid/overlong and existing owner-race cases; final form use/replace/omit, identical frozen retry and removal; category/guide conservation; service replay/authority tests; repository routing; five owned-PG16 cases for atomic admission/races/purge, policy-bound snapshot/lost reply/erasure replay, stale-instance/rollback/concurrent insert, current staff denial/revocation, and default-off refusal/legacy preservation. The existing fixture uses only its own PG16 cluster/container and synthetic policies, not a managed URL or provider.

No local test/build/browser/PG job has run in this allocation. Hosted exact-head execution and independent source/SQL review remain required. A source parser/diff check, if recorded by the author, is not runtime or integration evidence. The supplied package's Node24 11/11 result is historical package-only evidence; it does not qualify this integration on Node20.19.

First pushed source cb6536a1af5480d467e811e90db4111ff63bf6ac opened draft PR528. Hosted run44402726747 actually passed build, protection and Windows assurance; typecheck135149763997 failed only the two new Form fixture config wrappers because optionalIntakeEnabled was inferred as boolean instead of the existing literal true. The successor adds explicit literal annotations, without a cast of RequestIntentApi or changing the contract. Full failed typecheck output is retained privately. The test job was still running at this checkpoint, so no PG/UI/full-suite pass is claimed. A finite static review also changed the optional-intake descriptor copy to a null-prototype object, with an authored pollution regression, so an omitted goal cannot be invented from Object.prototype. These corrections have not been executed locally.

## Root integration and adoption requirements

1. Review and qualify this exact candidate and its full PG/HTTP/UI tests on pinned Node20.19. Source candidate application twice is included in the owned-PG fixture. Promote/register the SQL through Root's migration process only after acceptance; do not install the unregistered candidate directly in production.
2. In production.ts:126–127, explicitly pass the qualified existing optionalIntakeEnabled boolean as the final argument to both constructors, and the qualified referral boolean as the third argument to requestIntentStaffReader at line152. Default false continues the old admission/staff RPC flow. Do not enable the new path until schema and approved prospective policy capture are ready. The v4 key intentionally asks for fresh temporary admission; no previous contact or policy acceptance is fabricated or migrated.
3. Root owns shared request-intent.ts validation text: “Choose a listed goal or check the optional referral information.” Existing staff readback needs a same-scope escaped text line for optionalIntake.referralName; no new access grant.
4. The retention executor owner must inventory the new reported_referral_snapshots child in the request graph and qualify deletion/suppression under the actual durable policy. Parent temporary purge already cascades. No executor schedule, deletion or durable period is activated here.
5. AE/backend owner receives only committed reported facts through its authorized backend projection. Raw text is not a canonical referrer or assignment; authenticated/guest binding and initial assignment remain that lane's reviewed responsibilities. Former-AE replay/access and clinical-data exclusion are not proved by this slice.
6. Website2 receives exact candidate/environment/authorized synthetic fixture from Root for joined browser refresh/owner-switch/explicit choice/readback proof. No repeat of Samuel's existing request, acceptance, sign-in or recovery is authorized here.
7. Samuel must approve the exact merge/deployment/managed changes after the completed action packet. No merge, deployment, production-data write, provider call or message has been performed by this slice.
