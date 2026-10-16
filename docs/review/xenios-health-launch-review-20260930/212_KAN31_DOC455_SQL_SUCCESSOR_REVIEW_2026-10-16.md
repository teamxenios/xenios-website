# KAN-31 Doc455 DB-owner SQL successor: source review

**PASS at source scope, with executable conditions.** The frozen V2 SQL meets Doc 208 condition 5 and the binding
contract.

**Reviewer finding with a recommended strengthening.** The private-pair provenance that Doc 208 accepted as "lost" is
**computable without server secrets** in E33. Doc 208's premise was inaccurate, and I accepted it without checking.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session.
- **Method.** Read-only: Root `c0278ba7`, E33 source and the schema candidate. No SQL run, no agents.
- **Not reopened.** Docs 208, 210 and 211 stay accepted.
- **Timing.** Recorded at 02:42Z.

## 1. Identity

- **Root commit.** `c0278ba7` (tree `87f70dec`, parent `f5bc6018`) adds three frozen files:

| File | Size | Hash |
|---|---|---|
| Handoff MD | 19,538 B | `0e90761d…` |
| Vectors JSON | 2,652 B | `72c4c1d4…` |
| SQL | 10,836 B | `6a4a66e4…` |

## 2. What conforms

- **Transaction limits.** `BEGIN READ ONLY … ROLLBACK`, with lock 1 s, statement 5 s, idle 10 s, transaction 30 s,
  and `search_path = pg_catalog`.
- **Placeholder decoding.** Placeholders are decoded from hex. There is no interpolation and only one statement.
- **Input envelope.**
  - Exact keys at the top level, in each case and in `expected_json`; every leaf is a string.
  - Duplicate keys are rejected by a `json` (not `jsonb`) recursive walk, with depth capped at 32.
  - Exactly 3 cases, each with a distinct label, request UUID and reference, and `planned_labels` matching exactly
    in order.
  - The envelope is at most 262,144 B and must match its SHA-256. Each `expected_json` is at most 32,768 B and must
    match its SHA-256.
  - The reference must equal `XRI-` plus the upper-case UUID, and the status must be `pending_review`.
  - `created_at` is parsed as strict ISO and compared as `timestamptz`. The receipt's `createdAt` is
    `timestamptz` through `jsonb_build_object`, which is ISO with `T`, so this is consistent.
- **Row checks.**
  - The row is found only by UUID; contact, agreements and lines are checked with `jsonb` equality, which keeps
    array order.
  - The fingerprint is compared with the independently expected value. The fingerprint is plain
    `sha256(stable(…))` in production (`defaults.ts` 36–40, wired at `production.ts` 119), so it is
    independently computable.
- **Fails closed.** A missing row gives `id_rows=0`; a NULL hash gives `pair_rows=0`; any NULL coalesces to
  false.
- **Events.** `event_rows=1` and `submitted_rows=1`, with `actor_user_id` NULL. The schema confirms that only
  insert appends `submitted`; replay, recovery and `409` append nothing; only `staff_read` and `queue_list`
  add events. A pre-staff snapshot can therefore pass.
- **Output.** `browser_scenario_proved_by_this_query_alone=false`, `operational_staff_read_proved=false`,
  `project_identity_proved_by_this_query=false`, and the claim string. No raw contact, hashes or keys are output.
- **Vectors.** I recomputed the three independent vectors (sorted keys, Unicode, both array orders): canonical text,
  byte counts and SHA-256 all match.

## 3. Notes (not defects)

- **`pair_rows` is tautological.** The `unique(owner_hash, attempt_hash)` constraint makes `pair_rows=1` true
  whenever the row exists. It adds no evidence beyond the constraint, which the binding contract already discloses.
- **Version pin.** `170006` matches the observed staging Postgres 17.6 (Doc 207 metadata). It must still be
  reconciled before freezing, as the handoff says.

## 4. Reviewer finding: provenance is recoverable

E33 computes:

- `owner_hash = sha256(stable(["request-intent-owner","member", authUserId]))` (`request-intent/service.ts` 53–54);
- `attempt_hash = sha256(idempotencyKey)`;

and production wires the **unkeyed** `sha256AssistedOrderHasher`. No server secret is involved.

- **What this means.** For a member principal A, both values can be computed before the POST:
  - the owner hash from A's synthetic auth user ID, frozen in the manifest by Root;
  - the attempt hash from the key, captured before forwarding (which the driver already does).
- **Correction to Doc 208.** Doc 208's statement that hosted mode "cannot precompute those hashes without server
  secrets" is **wrong** for E33. I accepted the proposal's premise without verifying it.
- **Recommended strengthening.** It is cheap, but not required for the Doc 208 acceptance to stand:
  - add `expected_owner_hash` and `expected_attempt_hash` to each case, independently precomputed;
  - require `r.owner_hash` and `r.attempt_hash` to equal them exactly;
  - keep the raw key and user ID out of SQL artifacts, since only hashes are needed.
- **Effect.** This restores Doc399-level private-pair provenance for member principals. The claim could then drop "no
  private-pair provenance". It requires A to resolve as a `member` viewer, whose owner formula differs from the
  session formula, so Root must bind A's viewer type.

**Recommendation.** If the run is not imminent, adopt the strengthening, because it replaces behavioral inference
with cryptographic attribution. If speed governs, the current SQL stands under Doc 208 as accepted. Samuel and Root
choose.

## 5. Executable conditions

1. **Role literal versus executor.** The SQL requires `current_user` and `session_user` to be `postgres`. The
   restricted read-only Supabase MCP usually runs as a different role, which would make `input_valid` false.
   - Name the exact execution path, a `postgres` session inside a read-only transaction, before freezing.
   - Otherwise, change the role literal in a **reviewed** successor. Never at dispatch.
2. **Schema present.** Staging must actually contain `request_intent_private` from the candidate schema, with
   current authorized metadata reference.
3. **Freezing the query.** Root freezes and hashes the populated query, then obtains separate SQL approval. The
   negative controls in the handoff remain **NOT RUN** and need their own authority. Constraint-forbidden states must
   not be manufactured.
4. **Order of operations.** Snapshot before any staff read. The hosted run itself remains gated by Doc 211's reserved
   prerequisites.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | Doc455 DB-owner SQL successor (Root c0278ba7: SQL 6a4a66e4, vectors 72c4c1d4, handoff 0e90761d) | reviewer 6abf1edf | PASS at source scope: read-only/rollback/limits, hex placeholders, exact-key/duplicate-key/size/hash gates, 3 distinct cases, UUID-only lookup, jsonb content + independent fingerprint (plain sha256 in E33 production), fail-closed NULL/missing, one submitted + one total event (schema: replay/recover/409 add none), false proof flags; vectors recomputed OK. Note pair_rows tautological under unique constraint. FINDING: E33 owner_hash = sha256(stable(["request-intent-owner","member",authUserId])) and attempt_hash = sha256(key), unkeyed, so private-pair provenance IS precomputable; corrects Doc 208 premise; recommend adding expected_owner_hash/expected_attempt_hash (optional strengthening). Executable conditions: postgres role literal vs actual executor (read-only MCP role differs), staging schema present, frozen populated query + SQL approval, negative controls separately authorized | doc 212.`

Not execution, SQL, configuration, credential, deployment, approval or production consent; not human approval.
