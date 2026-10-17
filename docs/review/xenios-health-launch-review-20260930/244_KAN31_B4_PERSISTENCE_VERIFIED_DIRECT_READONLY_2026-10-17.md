# KAN-31 B4 persistence verified by direct read-only staging queries

**PASS: the three B4 requests are durably stored on staging, with exact content, correct owner binding and no
duplicates.**

> **Independence note.** Samuel authorized me (KAN-31 chat, about 20:2xZ) to run this check myself, read-only, against
> staging only, through my own Supabase connection, which is not Core's locked read-only connector. This is therefore
> **not an independent review.** Root or Core should re-check it, for example by re-running the same statements.

Executor: Claude `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5.

## What ran

- **Where:** project `tetynodzrtmdbuzgboro` (`xenios-research-staging`, confirmed with `list_projects`).
- **How:** every statement was wrapped in `BEGIN READ ONLY … ROLLBACK`. No writes, no DDL, no staff or API access.
- **Environment:** `current_user` and `session_user` = `postgres`, `current_database` = `postgres`,
  `server_version_num` = `170006`, `transaction_read_only` = `on`.
  - All the template's environment guards pass on this connection.
  - This confirms the Doc 243 diagnosis: Core's read-only connector runs under a different role or session.

## Results for each request

| Case | Request ID | Row | Reference | Status | `created_at` | Rows for this attempt | Events | Owner |
|---|---|---|---|---|---|---|---|---|
| normal_doubleclick | `755cdeb0-…` | yes | equal | pending_review | equal | **1** | submitted: 1 | A |
| lost_response_retry | `30e27ad2-…` | yes | equal | pending_review | equal | **1** | submitted: 1 | A (same as case 1) |
| reload_recovery | `4ba04284-…` | yes | equal | pending_review | equal | **1** | submitted: 1 | **B (different)** |

- **Content is exact.** `sha256(jsonb::text)` of the stored `contact`, `agreements` and `lines` equals, for every case,
  the same digest of `expected_json` from bindings `683fc21b`. I computed the expected side with jsonb's key ordering
  and formatting; the hashes are listed below.
  - **Contact:** `c2467b56`, `9d192aa8`, `12672dc8`.
  - **Agreements:** `6b9e0dec`, `683a0911`, `4f31d807`. All 5 acknowledgment pairs, including `acceptedAt`, match.
  - **Lines:** `c19db4bb` for all three. Both lines match: 5-Amino-1MQ 50 mg ×2 and 5-AMINO-1MQ 5MG/ML ×3, with
    `reviewState` pending.
- **Idempotency held.** Despite the double-click, the replay, the dropped reply and retry, and the reload recovery,
  each attempt hash has exactly one row and one `submitted` event.
- **Isolation held.** A's two requests share an owner hash and B's differs. That matches the browser observations:
  the other browser got no receipt and the sessionless request got 401.

## One finding: the template's fingerprint check would have failed

- **What fails.** The stored `fingerprint` does **not** equal the bindings' `expected_fingerprint` in any of the three
  cases, and the template requires `r.fingerprint = e.expected_fingerprint`.
- **Where each side comes from:**
  - The server computes `stableHash({kind, contact, agreements, lines})` over the **validated input**
    (`service.ts:80`).
  - The harness computes `hash(canonical({kind:…, contact: planned.contact, agreements: body…, lines…}))`
    (`contracts.mjs:71`).
  - The two derivations differ in their inputs or serializer.
- **Why it isn't a data defect.** The exact content match above, the identical replay (200) and the changed-facts
  refusal (409) together show the server's own fingerprint is stable and enforced.
- **Fix later (not blocking).** Correct the harness derivation, or drop the fingerprint equality from the successor
  template in favor of the exact content check.

## Conclusion

Persistence on staging is **proven** for the B4 run. Staff read-back remains a separate approval. Production release
is a separate decision with its own steps.

No writes. No production change.
