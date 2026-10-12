# Production operating profile proposal (`3709170`): technical review

**PROPOSAL REVISION REQUIRED: four P2 and eleven P3. No P0 or P1.**

**The numbers are consistent.** I recomputed every relation, and the values satisfy every check the source makes on
carriers and effective values:
- **Intake:** 200 < 1000; 750 < 3000 < 4500; hold 4500 + 1000 = 5500.
- **Writer:** 750 < 12000 < 16000; lock = gate = 6000 ≥ 5500; gate + reserve = 7000 < 12000; release target 17000.
- **Attempts:** 7000 (intake) and 19250 (writer).

**The labelling is honest:**
- Every ceiling is at or below its accepted nonproduction value, and the JSON and Markdown agree.
- Every value is labelled proposed and unmeasured, every installed value is null, and nothing is copied from the
  starter plan.
- Nothing authorizes installation, activation or reactivation.

**What's missing.** Four consequences that the unchanged source forces are not put in front of you, and you need them
to decide. They are corrections to the proposal's text, not to its safety. Nothing was executed.

This is a technical assessment only. You decide the live profile, the reactivation responsibility and the operators.
This review chooses no value.

Reviewer: this session, `claude-opus-5-5`. Board task `QUICK-ORDER-PRODUCTION-PROFILE-TECHNICAL-REVIEW-20261011`
revision 1, acknowledged at `c3e7337`.

**Target:**
- **Source:** `3709170ec967e190be55771bf0400ae732d6fc84`.
- **Records:** `31de10e898ae8181e77ebcc94c9531608306a8d9`.
- **Files:** `evidence/production-operating-profile-proposal-20261011.json` (blob `b9f44603`, 54,645 bytes) and `.md`
  (blob `3b5d2b24`, 31,671 bytes).

**Controlling records:**
- doc 78 and the steward finding `29297c31`;
- the nonproduction profile at `9c4a9b5`;
- the S4 limits from docs 80 to 83;
- your decision 3 under revision 3.

**Method.** Two read-only lenses (completeness and relations; enforcement, routing and anchor), each with an
adversarial verifier, then a critic. I confirmed PP-1's arithmetic and the guard's timing in the bytes myself.

**Disclosures.** PostgreSQL, PostgREST and Supabase behaviour is reasoned from documentation, NOT RUN. Output is
archived as `hl12/93_production_profile_findings.json`.

## 1. Corrections to the proposal (P2, before your decision)

| ID | What the proposal doesn't say | Smallest correction (no value chosen) |
| --- | --- | --- |
| **PP-1** | **The 7000 ms gate-entry objective cannot be met under normal contention.** Writer statement 12000 minus gate 6000 and reserve 1000 leaves 5000 ms before the gate. That is less than one permitted lock wait (6000) and less than one intake hold (5500). The guard is an `AFTER … FOR EACH STATEMENT` trigger (`currentness.sql:1378-1379@264e6af`), so the writer's own row waits come before the gate. A writer that waits behind one intake hold reaches the gate with no more than 6500 ms of statement time. This regresses the nonproduction property `statement ≥ lock + gate + reserve` (15000 = 7000 + 7000 + 1000); production has 12000 < 13000. It fails closed (57014/55P03), and `md:104` concedes the statement timer "may refuse", but the consequence isn't derived | State the derived 5000 ms bound. Then offer you exactly one of two options. **(a)** A carrier relation `writer.statement ≥ writer.lock + gate + reserve`, the nonproduction property. **(b)** Withdraw the 7000 ms statement objective and register 57014 at the gate as an expected writer and admin refusal class (doc 80 CS-30), with an S3 control. Reword `md:67` and `json:213` ("5000 beyond gate+reserve" holds only at 0 ms elapsed) |
| **PP-2** | **Operation needs a separate login role for each class, and the timers become role-wide.** The carrier lives in one `pg_db_role_setting` row for the exact (login, database) pair, with one route class. Intake and writer therefore need distinct login roles, not just distinct pools. Each class's statement, transaction, idle, TimeZone and DateStyle values become startup settings for every session of that login, and expiry ends sessions. The effective writer `lock_timeout` must be exactly 6000 on every writer and admin route, for every statement (`:1324`, `:1335-1336`, `:1354`). Today's single shared admin client (`server/supabase.ts:54-66`) carries writers and session persistence together, so one class always refuses on it. Doc 78 QOE-01, U-3 and LV-2 are not carried | Register these as preconditions, not unknowns. Operation needs a separately authorized class route through the excluded seams, or a reviewed amendment, with no blanket shared-role timeout change (U-3, KV-2). Extend PPM-03, PPM-04 and PPM-07 to cover refusals and session terminations of unrelated traffic |
| **PP-3** | **A single shared writer and admin anchor works only if the application's request role is the owner O.** The material guard is SECURITY DEFINER and sees the caller's role. Publish, revoke and activation are SECURITY INVOKER and require `current_user = O` (`:1550`, `:1757`, `:1928`). One identity tuple therefore admits both only with request role O on the application route, which the proposal itself excludes. Doc 80 CS-35's alternative, rotating the anchor per operation, is omitted along with its refusal windows: material writes refuse while the admin tuple is anchored, owner direct DML refuses under the application anchor, and revoke needs a rotation first | Restate §5 and PPM-03. Name the only unchanged-source paths: (i) request role O already in place, with no grants; (ii) owner rotation between two frozen carriers, committed separately, with its refusal windows and a rotation step in the emergency sequence; or (iii) a reviewed per-route-digest amendment. Bind the chosen path into the decision text |
| **PP-4** | **The headline 19,250 ms bound for writers and owner administration has no enforcement point.** The writer attempt, acquisition and response fields are checked only as a sum on the carrier. No writer route has deadline code, the admin client has no timeout override, and owner administration has no Node entry | Restate `md:11`. For writers and owner administration, only the database timers act, giving a 17,000 ms release target (transaction 16000 + cleanup 1000). Label the other writer fields as carrier-consistency values with no consumer, until writer-route changes are separately authorized |

## 2. Named limits (P3; fold into the same revision)

- **PP-5. Private-session revoke wait.** Either bind the session-revoke route's effective wait to at least 5500 ms, or
  state that it can refuse with 55P03 while an intake holds the session row, with logout still returning 200. Name its
  owner.
- **PP-6. Cross-carrier equality.** Require the intake and writer sections to be byte-identical in every carrier. The
  source compares each carrier only with itself. Make it a PPM-10 freeze check.
- **PP-7. CS-33 and CS-36 by name.** The precondition "no guard before every writer has valid configuration" can't be
  met literally, because the anchor COMMENT can't precede install. Restate it as: carriers staged before install, then
  the anchor inside a declared, bounded write-freeze window with writers disabled (or an atomic-anchor amendment).
- **PP-8. CS-34 NOWAIT refusal sources.** Name autovacuum, ANALYZE, concurrent index builds and any open DML, including
  unguarded session-binding INSERTs. Retries are manual only. Add the refusal rate to PPM-09.
- **PP-9. Carry TC-27, TC-28 and KV-2.** Carry the install and rollback timers, the recovery whole-request bound and an
  installation login with no operating timers, by reference, as S4 prerequisites.
- **PP-10. Per-field expiry mapping.** Add an expiry and refusal column for each field. State that each value is its
  own ceiling, or replace the dropped nonproduction maximum of 24000.
- **PP-11. Unchecked relation and server default.** `gate + reserve < effective writer statement` is checked only on
  the carrier, so name who qualifies it on effective values. `deadlockTimeoutMs` 1000 equals the server default, so a
  pass on an unconfigured target is not configuration evidence.
- **PP-12. `acquisitionMs` 750.** The only identified checkout mechanism is seconds-valued and instance-wide. Name the
  mechanism, or state that the value is enforced before transmission only, with an uncertain outcome after send.
- **PP-13. Intake refusal exposure.** Derive it: up to 17,000 ms per writer-class transaction while the exclusive gate
  is held. Link it to PPM-07.
- **PP-14. TimeZone and DateStyle are route-wide.** `'ISO, YMD'` differs from the built-in `'ISO, MDY'` for co-tenant
  sessions; include both in PP-2.
- **PP-15. Unconditional wording.** Reword `md:15` so that it authorizes no guard installation, grant, connection
  design, budget increase, activation or reactivation, without conditions.

**Rejected or narrowed:**
- The 3000 ms-at-gate sub-claim (the nonproduction profile had the same).
- PP1-3, PP2-2 and PP2-5 at P2 (downgraded to P3).
- PP2-4 as a separate finding (folded into PP-2).
- The "pre-BEGIN mechanism missing" check (MET).
- "24 writer routes" (corrected: 23 platform-writer mappings plus the session revoke).

## 3. Your decision points (for after the revision; this review chooses none)

1. **The numeric profile.** This includes the PP-1 choice, the 500 ms gate-over-hold margin (nonproduction: 1000) and
   how acquisition is enforced.
2. **The platform consequences to accept.**
   - Material writes and revoke refuse when limits are missing or invalid (already accepted under decision 3).
   - The writer lock equals the gate on every writer and admin route.
   - Timers, TimeZone and DateStyle are role-wide.
   - Publish and activation SHARE locks stall DML for up to 17 s, and NOWAIT refusals happen during maintenance.
   - Intake refusal exposure is up to 17 s per writer transaction.
   - All material writes refuse in the install-to-anchor write-freeze window.
3. **Routing and the anchor path.** PP-2 and PP-3.
4. **The writer bound.** The database timers only, or separately authorized writer-route deadlines later.
5. **The private-session revoke disposition.**
6. **Reactivation.** You alone approve it, with no automatic reactivation; revoked revisions need a new revision. The
   live reactivation operator is still UNKNOWN.
7. **The operators.** Designate the database owner O, the configuration installer, the artifact owner and the
   activation operator. All are UNKNOWN.
8. **Binding.** Your decision binds the exact corrected version and its raw digest, plus the named evidence.

## 4. Prerequisites (unchanged by this review; UNKNOWN never means pass)

**Measurements on the exact target.** PPM-01 to PPM-10 run under separate execution approval, extended as above:
- PP-2 and PP-3 for PPM-03;
- effective TimeZone and DateStyle, the source of `deadlock_timeout`, and the effective-statement relation for PPM-04;
- the CS-30 gate control and the PP-4 disposition for PPM-05;
- unrelated-traffic terminations and PP-13 for PPM-07;
- owner-DML refusal and the NOWAIT rate for PPM-09;
- cross-carrier equality and the anchor COMMENT for PPM-10.

**Installation (S4):**
- separate installation authority, plus a designated installer and artifact owner;
- a distinct login per class, or an amendment;
- the resolved anchor path;
- carriers staged before install, with a bounded write-freeze;
- TC-27, TC-28 and KV-2;
- the session-revoke disposition;
- the frozen snapshot with the real inputs.

The composition dispositions (doc 83, and doc 87 once published) stay controlling.

Nothing here authorizes a carrier, guard installation, role grant, pool change, anchor COMMENT, activation or
reactivation.
