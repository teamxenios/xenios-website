# Q1 managed-persistence proposal: three queries, source and scope (KAN-26 / XRM-2006)

**PASS, source and scope only, with no material defect.**

- **What is reviewed.** Root DOC387's three literal queries, A, B and C.
- **Fit.** They match the installed `e33c12a9` request-intent SQL and would test what they claim, failing closed
  otherwise.
- **What this is not.** Not approval, admission or execution. It completes no Jira issue: not KAN-26, KAN-27 or KAN-31.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only. No SQL, parser, test, provider, browser or fixture execution; no agents. Accepted `e33`, cloud and I3
dispositions are not reopened.
- **Packet.** Root `02eb8a2` DOC388 (`bb68fe8a…`), delivered in chat.
- **Timing.** Reviewed at 2026-10-15T19:39–19:45Z.
- **Jira.** I have no Atlassian access of my own; Root relays this record.

Archive: `hl12/191_q1_managed_persistence_three_query_scope.json`.

## 1. Identity

- **Payload.** DOC387's payload identity recomputes to `38b39a7b…` (SHA-256 of the compact `JSON.stringify`).
- **The three queries.** The `query` argument of each `execute_sql` operation equals its SQL file byte for byte:
  - A: `cf942474…`, 3,029 B;
  - B: `ae3722c0…`, 1,013 B;
  - C: `9bd6ca42…`, 6,478 B.
- **Target.** Staging `tetynodzrtmdbuzgboro`. The production project is excluded.
- **Fixture literals.** A and C carry the same fixture literal. All six hash literals are 64 lowercase hex characters.
- **Source SQL.** `supabase/candidates/mixed_catalog_request_intent.sql` at `e33c12a9` is `c50a5462…`, as the payload
  states. I3's installation contains that file's body byte-identical, except the trailing `commit;`.

## 2. Inspection against the installed functions

### Caller role

- **The guard.** `create_or_replay` and `find_attempt` are security definer functions with `search_path=''`. Each
  refuses unless `current_setting('role') = 'service_role'`.
- **How Q1 meets it.** A and B use `SET LOCAL ROLE service_role`. C uses `set_config('role','service_role',true)` inside
  its `DO` block, then restores the saved value (`none`) before the postgres-only readback. This matches the
  production path, where PostgREST runs as `service_role`.
- **Grants.** `service_role` holds schema usage and execute on both the public invoker wrappers and the private
  functions.
- **Scope of the role change.** Transaction-local only: no role, grant, Auth user or clinical capability changes.

### Transactions

- **A.** `BEGIN … COMMIT`, with limits of 5 s statement, 1 s lock, 10 s idle and 30 s transaction (`transaction_timeout`
  exists in Postgres 17, and the guard requires `170006`). The receipt row precedes `COMMIT`, so durability is credited
  only by B's separate read, as the payload states.
- **B.** `BEGIN READ ONLY … ROLLBACK`. `find_attempt` only selects, so a read-only transaction is valid.
- **C.** Ends in `ROLLBACK`. Its negative controls run inside `BEGIN … EXCEPTION` subtransactions.
- **Result rows.** I3's actual `execute_sql` response returned its SELECT row ahead of a trailing `ROLLBACK`, so the
  receipt rows are expected to come back.

### Fixture against the validators

- **Detail.** Its keys are a subset of the allowed set; `kind` is `unapproved_selection_request` and `status` is
  `pending_review`.
- **Contact.** Allowed keys, `ageConfirmed` true, string fields of 1–320 characters, and both addresses complete.
- **Agreements.** One entry with `accepted` true and a parseable `acceptedAt`.
- **Lines.** Two unique lines with allowed keys and `reviewState` `pending`. The clinical line is `provider_request`
  with `clinicalReviewRequired` true; the other is `direct_order_request`. Quantities are 2 and 3, and the
  not-for-sale display states are avoided.
- **Reference.** The expected `XRI-7C805AC401604F3E8AF5AE5454AB8C31` matches the table's CHECK formula.

### Replay, conflict and invalid input

- **Replay.** Same owner and attempt with a new `requestId`: `ON CONFLICT (owner_hash, attempt_hash) DO NOTHING`, then
  the stored row is reread and its fingerprint matches. The original receipt comes back unchanged and no event is
  inserted.
- **Conflict.** A different fingerprint raises `23505 request_intent_attempt_conflict`. C catches that SQLSTATE and
  message exactly. The app maps the same pair to 409 `attempt_conflict` in `rpc-repository.ts`.
- **Invalid input.** A bad `kind` raises `22023 request_intent_invalid` before any insert.
- **No false pass.** Any other outcome is re-raised, so C fails.

### Responses

- **Shape.** `{receipt:{kind,requestId,publicReference,status,createdAt}, fingerprint}`, which equals what the app's
  parser whitelists.
- **Timestamps.** `createdAt` is `to_jsonb(timestamptz)` at full precision, so C's equality against `created_at` is
  exact.
- **C's final booleans.** Constants, reached only if every assertion passed. The Auth, PostgREST, concurrency and staff
  claims are honestly set to `false`.

### Namespace and isolation

- **Before writing.** A's pre-check refuses if any of the three fixture IDs or either owner hash already exists.
- **Owner isolation.** B confirms that a second owner hash with the same attempt returns NULL.
- **C's readback.** Scoped to fixture IDs only: exactly one row, a complete contact, agreements and lines, one
  `submitted` event, and no rows for the negative IDs. It returns only booleans.

### Counts

- **Calls.** Seven public RPC calls (1 + 2 + 4), as declared.
- **Retained data.** One synthetic request and one event, retained by design. The access-event identity sequence
  advances by one.

## 3. Limits (non-material; recorded)

1. **RLS bypass.** Q1 does not itself assert that `postgres` bypasses RLS. Its pre-check and readback on the
   force-RLS, policy-free private tables depend on it, as do the definer functions. I3 asserted those tables are
   owned by `postgres` with forced RLS and no policies. If bypass were absent, the definer insert would be refused (A
   fails) and C's readback would mismatch, so this cannot produce a false pass.
2. **`session_user`.** Evidenced only by I3's `apply_migration` guard. If the `execute_sql` context differs, A refuses
   with `Q1_CONTEXT_MISMATCH` and the call is spent.
3. **Fingerprint.** The database stores the client-supplied fingerprint and compares it; it does not recompute it. Q1
   proves database idempotency, not the app's canonical fingerprinting.
4. **Retained fixture.** It stays on staging permanently, because the `deny_mutation` triggers block deletion. It will
   appear in future staging staff-queue reads, labeled as synthetic.
5. **Not covered.** Sequential behavior only: no concurrency, Supabase Auth or real cookie session, PostgREST or HTTP
   transport, canonical catalog or legal eligibility, staff or Care readback, browser, or deployment.
6. **Observation only, not re-reviewed.** I3's actual postcheck output carries an `…-I2-…` scope label, from the
   postcheck text reused from I2. The I3 receipt itself is scoped I3.

## 4. Prerequisites before any call

- **Approval.** Samuel's exact approval of payload `38b39a7b…`. This is required and not received; this review grants
  nothing.
- **Readiness.** The same Core's fresh FINAL READY, with all three literals retained and hashed.
- **Target health.** A fresh `get_project`: exact ID and org, `ACTIVE_HEALTHY`, not production.
- **Exclusivity.** One exclusive staging operation, with known consumers quiescent.
- **Window.** A new 10-minute window from actual admission, with A dispatched by +2 min, B by +5 and C by +8.5. No
  retry, cleanup, extension or reuse.
- **Stopping.** Stop at the first error, lost or truncated response, or mismatch, and preserve a possibly committed A.
- **Re-review.** Needed only if any literal, the payload or the target changes.

## 5. What Q1 can and cannot credit

- **Can credit.** Database-level persistence across separate calls, a native receipt and reference, sequential
  replay, conflict and invalid refusal, owner-hash isolation, and fixture-only privileged readback. This is partial
  KAN-26/27 database evidence.
- **Cannot credit.** KAN-26 "durable request with server-confirmed reference" end to end, KAN-27 response loss and
  reload recovery, and KAN-31 browser journey. Each still needs real Auth, HTTP, cookie binding, browser and staff
  access.

Comment text for KAN-26, for Root to relay: `REVIEW | KAN-26 (XRM-2006) | Q1 payload 38b39a7b (A cf942474, B ae3722c0, C 9bd6ca42) on e33c12a9 / staging tetynodzrtmdbuzgboro | reviewer 6abf1edf (original Claude) | PASS (source/scope only): exact queries match installed e33 functions; role, transaction, replay/conflict/invalid, response-contract and fixture-scoped readback sound, fail-closed | limits: no Auth/PostgREST/HTTP/browser/concurrency/staff credit; fixture retained permanently | requires Samuel's exact Q1 approval + fresh admission | next owner: Root/Core | doc 191.`

Not execution, admission, approval, push, deployment or production consent; not human approval; not test credit.
