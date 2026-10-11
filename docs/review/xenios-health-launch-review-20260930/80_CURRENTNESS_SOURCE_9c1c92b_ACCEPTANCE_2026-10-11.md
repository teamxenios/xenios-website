# Currentness source (`9c1c92b`): source acceptance

**CORRECTIONS REQUIRED. No P0 or P1, and no fail-open path found.**

The implemented currentness family is close. These are met:
- **Your decisions:** the stock existence check, and the hold until a separate re-activation, with no numeric defaults.
- **The narrow carrier, sealed scope and resolver:** the carrier stores raw bytes for bindings and configuration only;
  the sealed scope is header-last; one resolver is shared by the commit and the guard.
- **The trigger inventory:** 47 triggers over 48 event rows.
- **The lifecycle locks and their order.**
- **The doc 78 conditions:** the digest anchor, identity readbacks, read-only replay, the row-11 order, test-only
  fixtures and the file boundary.

Fifteen corrections are needed in source before acceptance (CS-1 to CS-15): five in the SQL, nine in the verifier and
its controls, and one in the records. One of them stops the family working at all. The integrity check matches the
family's own indexes, so after installation it could never pass (CS-1). It fails safe, but it blocks everything.

All fifteen sit inside the five currentness paths and the four evidence records, so they go to the same builder as one
consolidated correction. This is not a design change. The lease and the completed implementation are not reset.

Nothing was executed. Authored controls are not pass counts. The status remains LOCAL ONLY / NOT RUN / SOURCE
ACCEPTANCE PENDING.

Reviewer: this session, `claude-opus-5-5`. Board task `DOC71-CURRENTNESS-SOURCE-ACCEPTANCE-20261010` revision 1,
registered at coordinator `4e180a6` and acknowledged at `e6e3585`.

**Target**, recomputed from Git:

| Field | Value |
| --- | --- |
| Source | `9c1c92bcb7a514da9b575a291d0abac67c8ba366` (tree `d0c676b673df6f9f9d587b543df9c745e31e5d39`) |
| Records | `1fa74efd957ee78f8e75f24e25be766062b5de1c` |
| Currentness SQL, precheck, postcheck, rollback | raw `a1716144…`, `97789d21…`, `96e0695e…`, `ec87e6c7…` |
| Verifier | raw `357bd060…` |
| Evidence records | `ac7d45ec…`, `590e57ad…`, `9b5da663…`, `f6bd470e…` |

**Scope.** The whole currentness family and its verifier, judged against the last accepted baseline `25858ad` and every
carried condition (docs 73, 75 and 76, and doc 78 C-1 to C-12). The family was authored at `3578905` and inherits no
acceptance. Only the 17 slice paths differ from `25858ad`.

**Method.** Five read-only lenses, each with an adversarial verifier, then a completeness critic:
- scope materialisation;
- the authority lifecycle and locks;
- the guard, fingerprint and integrity;
- settings, admission and trust;
- the verifier's controls.

I confirmed CS-1 and CS-6 in the bytes myself.

**Disclosures.** The agents reported read-only command-form deviations only. One ran `cd /dev/null 2>&1`, which failed
harmlessly. No file was written, nothing was executed, and no other worktree was read. PostgreSQL behaviour is reasoned
from documentation, NOT RUN.

Output is archived as `hl12/80_currentness_source_acceptance_findings.json`.

## 1. Corrections required (P2, stage S2)

**In the currentness SQL**

| ID | Anchor | Defect | Smallest fix |
| --- | --- | --- | --- |
| **CS-1** | `currentness.sql:702-705` | The owned-relation check selects every object named `research_health_quick_order_authority_%` with no object-type filter. PostgreSQL's default primary-key and unique index names (e.g. `…_authority_revisions_pkey`) match, so it raises "owned relation contract drift" on every call. Install, the strict reader, the guard, publish, revoke, activate and the rollback block would all refuse permanently. The baseline integrity check was passable | Restrict the set to tables (`relkind in ('r','p')`, or the six exact tables), then require `relkind='r'` and forced RLS on that set. Leave indexes to the fingerprint. Add a positive integrity control, and a negative with RLS disabled |
| **CS-2** | `:389-401`, `:423-436`, `:729-990`, `:1112`, and the integrity and fingerprint queries | Carried condition CC-15-TYPES is unmet. Non-keyword types, casts, catalog relations and built-ins are unqualified under an empty search path, including in the SECURITY DEFINER guard. A session's temporary objects resolve first (documented, NOT RUN), so a temp domain could run code as the owner, and temp `pg_class` or `pg_trigger` tables could mask drift | Qualify every non-keyword type, cast, catalog relation and built-in as `pg_catalog.*` in all four SQL files, and rebind the definition digest. Add the two `pg_temp` negative controls |
| **CS-3** | `integrity()` `:553-720`, install `:1976-1998`, precheck and postcheck `:85-148` | The r3 structural predicates for the 12 guarded tables are missing in every phase: plain table, not a partition, no inheritance, no rules, not a subscription target. Statement triggers do not fire for writes routed through those channels | Add one identical predicate block to integrity, both install branches, the precheck and the postcheck, plus a global prefixed-trigger check in the precheck. One negative control per predicate |
| **CS-4** | `:916-921` | A changed required-input row with a non-null `record_id` refuses (55000) in any domain once anything is published, and permanently, although the commit reads required inputs by domain only. This is the defect doc 73 CC-4 said to remove | Remove that refusal, classify by sealed domain only, and add IN and OUT controls with a non-null `record_id` |
| **CS-5** | `:1035` | The carried CC-17 condition is unmet. An alias-free legal-binding INSERT whose `customer_ref` equals another row's alias still bypasses the guard, and the verifier records the bypass as the expected outcome | Treat such an INSERT as material, and keep the bypass only for unrelated alias-free inserts. Replace the "bypass" control with a colliding pair (+1 and held) and a non-colliding pair (no change) |

**In the verifier and its controls.** None of these is a defect in the protected behaviour; each is a control that is
missing or cannot fail.

| ID | Anchor | Defect | Smallest fix |
| --- | --- | --- | --- |
| **CS-6** | `currentness_local.mjs:951` against `currentness.sql:1745` | The only revoke control uses the reason `'synthetic revocation'`. The space is outside the source's allowed reason pattern, so revoke refuses with 22023 first. The CC-2 (revoke takes no table locks) and R2-5 (revoked revision refused) controls never assert anything | Use `'synthetic-revocation'`, and add a separate negative asserting 22023 for the spaced reason |
| **CS-7** | Gate predicate `:499-510`, NOWAIT `:1545-1556`, `:1911-1922` | No controls for: a gateless head UPDATE; the parts of the lock predicate (shared-only, wrong key, foreign holder); a same-epoch change; publish and activation NOWAIT refusals; exception discipline | Author the R2-14 set listed in the archive (CS-7 a to e) and list it in the receipt |
| **CS-8** | `mjs:742-761` | Writer-profile refusal controls cover only pre-publication guard UPDATEs | Add published-state guard refusals (anchor absent, wrong digest, malformed carrier, exceeded timer, identity mismatch), publish, activation and revoke refusals, and the role-setting-absent case, each with its valid twin. Add an R2-4 row to the correction map |
| **CS-9** | `mjs:764-770` | The isolation matrix covers 2 of the 9 required cases | Add {RR, SERIALIZABLE, READ UNCOMMITTED} x {OUT, equal-projection, zero-row}, plus the concurrent publish and activation case |
| **CS-10** | `mjs:659-660` | No published-state IN or OUT controls for 7 of the 12 relations, for any DELETE, or for moves in or out of scope. A membership regression would go undetected; the source itself appears correct | Add a reduced matrix: one IN (+1, held) and one OUT twin per relation and event, plus one move each way |
| **CS-11** | Seal and history triggers `:481-494`, `:530-548`; carrier refusals `:750-833`; tamper `:862-879` | No controls for scope and history immutability, the post-header seal, the carrier parser's refusals, tamper detection, or the revoked-revision refusals | Add those negatives (listed in the archive), each leaving the head, revisions and members unchanged |
| **CS-12** | `mjs:706-717` | Timer negatives test only `lock_timeout`, and the relation negatives are incomplete | Add zero statement and transaction timeouts; negative, fractional and overflowing approved values; an unsupported unit; and each relation and DateStyle negative, each with a valid twin |
| **CS-13** | Verifier | No MERGE, writable-CTE or COPY controls, and no negatives for foreign, disabled, missing, overloaded or wrong-transition prefixed triggers | Author those controls (r3 MD:763-768) |
| **CS-14** | `mjs:329-331`, `:1558-1560`, `:2093-2119` | No verifier check that function settings are exactly `search_path=""` across all 13 functions. The post-rollback absence list omits the guard, and role-denial and drift coverage omits the new objects. This is the doc 78 C-1 inventory | Assert the 13 exact signatures, owner, SECURITY DEFINER only for the guard, and settings exactly `{search_path=""}`. Extend absence, role-denial and drift coverage to the new functions and tables |

**In the records**

| ID | Anchor | Defect | Smallest fix |
| --- | --- | --- | --- |
| **CS-15** | Correction map `:551-569`, `:2939-2942`, `:3147-3183`; receipt | The map and receipt overstate coverage. They mark CC-17 and CC-15-TYPES as implemented, list the bypass as a positive control, list the unreachable revoke controls as authored, and give no stage for held cases | Mark CC-17, CC-15-TYPES and the structural predicates NOT_IMPLEMENTED until CS-2, CS-3 and CS-5 land. Mark the revoke controls broken until CS-6. Add an R2-4 row, a stage on every held case, and entries for CS-7 to CS-14 |

## 2. Precision items (P3)

**Fix in the same correction pass where cheap (S2), otherwise named limits:**
- **CS-16.** The historical verifier path asserts the superseded head contract.
- **CS-17.** Stale S0 comments; the intake call that verifies the header is unnamed.
- **CS-18.** Incomplete format constraints and typed read-set checks.
- **CS-19.** The descriptor seal constant is only a NULL gate.
- **CS-20.** Integrity omits trigger attributes and the new history triggers and foreign keys.
- **CS-21.** The install comment loop is not limited to the exact 47 pairs.
- **CS-22.** Rollback detects the intake family only partially.
- **CS-23.** Two quality-control labels claim more than they test.
- **CS-24.** Admission and receipt wording.
- **CS-25.** Writer and admin paths don't refuse an upgrade from their own shared gate.
- **CS-26.** Record the scope of C-12's plain-SET rule.

**Travel to qualification (S3):**
- **CS-27.** Timers accept only ms and s.
- **CS-28.** Holder sessions race the 1 s idle timeout.
- **CS-29.** Derive is quadratic at the parse bounds while locks are held.
- **CS-30.** The gate remainder check covers the transaction budget only.
- **CS-31.** The jsonb comparison is GUC-sensitive for float columns, of which there are none today.
- **CS-32.** The version-refusal control needs an alternate server.

**Travel to installation and operation (S4):**
- **CS-33.** Emergency revocation depends on profile validity.
- **CS-34.** Publish and activation NOWAIT refuse during autovacuum or index builds.
- **CS-35.** One anchor admits only one writer identity tuple.
- **CS-36.** The anchor cannot be supplied inside the install transaction.

**Rejected:**
- **P-5 and P-6:** the source matches r3 MD:715-717.
- **S-2:** the 1-100 quantity cap is the carried r3 MD:219-222 maximum.

## 3. Intake and adapter compatibility (not final intake acceptance)

- **Currently blocked by CS-1.** Every commit's preflight strict reader raises CS-1's 55000. The adapter maps that to
  OUTCOME_UNCERTAIN with the key kept, and nothing saves. This is moot once CS-1 is fixed.
- **For the intake reseal, after currentness is accepted:**
  - Refuse empty or short offerings as a definite refusal before the resolver call.
  - Bind the currentness `integrity()`, seal part 3 and the function inventory in the intake dependency gate.
  - Disclose that the expected-digest argument is a consistency binding, not an authorization boundary.
  - Reword two comments that read as pre-BEGIN arming claims.
  - Bind the corrected CC-17 guard.
- **Compatible already:**
  - The adapter's error mapping matches the doc 75 and doc 78 rulings: confirmed aborts go to the retryable 503 with
    the key kept; codeless errors and session terminations are uncertain; 57014 is not promoted.
  - The commit's shared gate is a try-lock.

## 4. Next steps

1. **The same builder, without waiting for another kickoff:**
   - author CS-1 to CS-15, and CS-16 to CS-26 where cheap, confined to the five currentness paths and four evidence
     records;
   - produce a new source commit and records commit, with a recomputed definition digest;
   - keep the receipts PENDING.
2. **The coordinator:** register revision 2 of this task to this reviewer as a bounded delta against `9c1c92b`.
   Untouched parts of the family are still judged against `25858ad` and the carried conditions.
3. **After acceptance only:** the builder binds the acceptance and receipt, authors the intake dependency-seal successor
   (section 3), completes the schema-descriptor and checkout bindings, and submits the transaction composition for its
   bounded review. The intake seal stays non-final until currentness is accepted.
4. **Throughout:** the S3 and S4 items travel unchanged. Nothing here authorizes tests, SQL, installation, a push or
   deployment.
