# Q1 actual backend persistence result (KAN-26 / XRM-2006)

**PASS, backend SQL result only.** The three approved Q1 calls ran once each, inside the admitted window, with exactly
the literals reviewed in Doc 191. Every returned value equals the declared expectation.

- **What this is.** Partial KAN-26/27 database evidence.
- **What this is not.** Not Auth, PostgREST, HTTP, browser, concurrency, staff, catalog or legal eligibility, or
  deployment evidence. No issue is Done. NOT LIVE.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only. No SQL, test, provider or browser action; no agents. Doc 191 and the accepted `e33`, cloud and I3
dispositions stand, and no source is re-reviewed.
- **Packet.** Delivered in chat.
- **Timing.** Reviewed at 2026-10-15T20:03–20:04Z.

Archive: `hl12/192_q1_actual_backend_persistence_result.json`.

## 1. Identity and authority

- **Evidence.** Core `e218151f` (tree `2fa35f51`) holds five files, all matching the packet and Root DOC394's frozen
  copies at `4741ac5e`:
  - A response, 1,167 B, `1a429284…`;
  - B response, 1,227 B, `321acf58…`;
  - C response, 1,110 B, `16c643f5…`;
  - `Q1_EXECUTION_RECEIPT`, 5,976 B, `ee61da0f…`;
  - `LOCAL_ADMISSION_VERIFICATION`, 1,825 B, `ecb6111d…`.
- **Approval.** Root DOC392 records the human answer "Approve exact Q1 staging persistence qualification". It is bound
  to payload `38b39a7b…`, decision `030e6bf3…` and my Doc 191 (`68979d46`). This is Root's record; I did not witness
  it.
- **Admission.** Root DOC393 (23,277 B, `d6a2a506…`, at `a752dc64`) carries exactly the reviewed A, B and C queries
  (`cf942474`, `ae3722c0`, `9bd6ca42`) against `tetynodzrtmdbuzgboro`. A fresh `get_project` at 19:52:42Z showed
  `ACTIVE_HEALTHY` for that exact staging project.
- **Window.** T0 was 19:53:03.482Z.

| Call | Started | Deadline | Wall time |
|---|---|---|---|
| A | 19:53:38.045Z | 19:55:03Z | 2,090 ms |
| B | 19:53:52.109Z | 19:58:03Z | 2,241 ms |
| C | 19:54:01.452Z | 20:01:33Z | 1,323 ms |

  All three ran before the 20:03:03Z expiry. Each ticket was consumed once. There were no retries, extra queries,
  cleanup or cancellations, and the slot closed at 19:54:18.624Z.

## 2. Results, parsed from the raw tool responses

- **Shape.** Each response has `isError: false` and exactly one row.
- **A: `create_before_commit`.**
  - Stored receipt: kind `unapproved_selection_request`, status `pending_review`, request ID `7c805ac4-…-ab8c31`,
    reference `XRI-7C805AC401604F3E8AF5AE5454AB8C31`, `createdAt` 2026-10-15T19:53:40.982556+00:00.
  - Fingerprint `2c291eaa…`.
- **B: `independent_recovery`, in a separate read-only call.**
  - `read_only` is true.
  - The stored receipt is identical to A's, including `createdAt` to the microsecond.
  - `different_owner_hidden` is true.
  - This is the cross-call durability evidence: the row committed in A was recovered by a separate call.
- **C: `controls_and_scoped_readback`.** Every one of its 12 fields equals the expectation:
  - fixture match, replay preserved the receipt, conflicting fingerprint refused, and invalid kind refused, all true;
  - `request_rows` 1 and `submission_events` 1;
  - Auth, PostgREST, concurrency and staff, all `false`.

  Because those booleans are reachable only after every assertion in the `DO` block passed, C's raw row is direct
  evidence that the fixture matched exactly, that a replay and two refusals behaved as designed, and that exactly one
  row and one event exist.

## 3. Limits

1. **What the scope covers.** Backend SQL through `execute_sql` as `postgres` with `SET ROLE service_role`. Not
   Supabase Auth, the real Early Access cookie, PostgREST, application HTTP, catalog or legal eligibility,
   concurrency, browser, or staff and Care readback.
2. **Clock domains.** The native `createdAt` (19:53:40.982556Z) is about 847 ms later than the executor's A return
   (19:53:40.135Z). Because `now()` is the transaction start, the database clock was at least about 0.85 s ahead of the
   executor's clock. The two domains are preserved unadjusted and must not be compared or used for ordering. There is
   no native duration or wire-time claim.
3. **C's rollback.** C's literal `ROLLBACK` raised no SQL error, but there is no independent global
   transaction-closure assertion.
4. **Retained fixture.** One immutable synthetic request and one `submitted` event stay on staging permanently, and the
   access-event sequence advanced. Future staging staff-queue reads will show them.
5. **Fingerprint.** It is client-supplied and compared, not recomputed (Doc 191 limit 3).
6. **Fixture path.** It must not be described as a live or customer path.

## 4. What remains for the Jira issues

- **KAN-26.** The real customer session submits through app HTTP and PostgREST and gets a server-confirmed reference.
- **KAN-27.** Real response-loss, reload and same-attempt recovery through the app.
- **KAN-31.** An isolated browser journey with mixed selection, saved reference, retry and unauthorized denial, then
  staff readback after the security closure (KAN-85).
- **Release.** Custody (the phase A return), the release manifest, deployment and live verification.

Comment text for KAN-26, for Root to relay: `REVIEW | KAN-26 (XRM-2006) | Q1 actual result, payload 38b39a7b, Core e218151f / Root 4741ac5e, staging tetynodzrtmdbuzgboro, app e33c12a9 | reviewer 6abf1edf (original Claude) | PASS (backend SQL only): A committed XRI-7C805AC401604F3E8AF5AE5454AB8C31; independent read-only B recovered identical receipt incl. createdAt, other owner hidden; C fixture match, replay preserved, conflict + invalid refused, 1 row / 1 submitted event; 3 calls in window, no retry/cleanup | limits: no Auth/cookie/PostgREST/HTTP/browser/concurrency/staff/catalog-legal credit; DB vs executor clocks differ (~0.85 s), unadjusted; fixture retained permanently | not Done: KAN-26/27/31 still need real customer path | next owner: Root/Core | doc 192.`

Not execution, admission, approval, push, deployment or production consent; not human approval; not customer-path
credit.
