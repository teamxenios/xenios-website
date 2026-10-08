# Quick Order currentness head integrity `f581b6b` / `30085a6`: bounded successor review against doc 49 section 5

**SOURCE ACCEPT WITH LIMITS.** The successor implements every item doc 49 section 5 asked for, and nothing else
changed. Specifically:
- the install transaction seeds one HELD head, and the lazy insert is gone;
- an absent head is refused;
- three validated `ON DELETE RESTRICT` foreign keys link the head to the revisions;
- `ENABLE ALWAYS` triggers refuse revision edits, deletes and truncates and head removal;
- a row trigger refuses any epoch decrease;
- the reader stays constant and unavailable;
- the fingerprint excludes internal triggers in all three scripts;
- the pre and postcheck require a held head whose references resolve;
- the rollback permits only the untouched seed and drops the head before the revisions.

The nineteen-row predecessor list is unchanged. The intake family and all runtime code are untouched. No guard, commit
body or decision-inputs column exists. The definition hash, 66-entry receipt and 55-entry bindings recompute equal.
Two lenses with adversarial verifiers found no P0, P1 or P2; the findings are P3 test-discrimination and records
notes. Everything is NOT RUN, the window is expired, hosted state is NOT PROVEN, and this acceptance installs,
qualifies or authorises nothing. Lens output archived as `hl12/50_head_integrity_lens_findings.json`.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Method: read-only Git object reads in the builder checkout,
hash recomputation, a full read of the 577-line diff by me, and two read-only lenses with adversarial verifiers.
Nothing was executed: no SQL, psql, Docker, verifier, test, build, server, browser or resource check. The
qualification window remains expired. Nothing here installs, registers, qualifies or approves anything.

## 1. Identity and delivery (verified)

| Item | Value |
| --- | --- |
| Handoff | coordinator `DOC49_NEXT_REVIEW_HANDOFF_20261008.md`, committed at coordinator `33415f62…` (local; the working file equals the committed blob, sha256-lf `3aedd139…`); delivered through Samuel |
| Source | `f581b6bd42b5c32cb7791677159522ddf6274aaa`, tree `9efb20d52e253027b2d3b803a5e11d5ff8ca7541` ("fix(quick-order): protect held currentness authority integrity", 2026-10-08 09:06:17 -0500), parent `7f8edd75…` (local builder records whose implementation equals accepted `3e82154`) |
| Records | `30085a641a2101d6578d26fb42a7468a16c8351e`, tree `b559e6ad…`, parent `f581b6b`: packet `DOC49_CURRENTNESS_REVIEW_PACKET_20261008.md`, `evidence/doc49-currentness-records-20261008.json`, `evidence/doc49-currentness-source-f581b6b.json`, `evidence/sql-currentness-source-receipt-f581b6b.json`, registries and handoff |
| Remote | both commits are local in `C:/Users/sboad/.codex/worktrees/389a/xenios-website`; the remote builder branch is still `1631323` |
| Implementation delta `7f8edd7..30085a6` under `supabase/`, `server/`, `client/`, `shared/` | exactly the five currentness paths; the intake candidate family, its verifier and every runtime path are unchanged |
| Authority | Samuel's source-only approval `dc3329b` for packet `1d4f2c3`, whose scope (`:136-141`) specifies a monotonic `writer_epoch` and immutable revisions for these two relations; doc 42 §5A; doc 49 section 5 |

Five files at `f581b6b` (all LF, zero CR bytes):

| Path | Lines | sha256-lf |
| --- | --- | --- |
| `supabase/candidates/20261006_research_health_quick_order_currentness.sql` | 400 | `5b0b2cd9…` |
| `….precheck.sql` | 126 | `f5572b43…` |
| `….postcheck.sql` | 127 | `c9f3b563…` |
| `….rollback.md` | 157 | `75dfe2d2…` |
| `supabase/verification/research_health_quick_order_currentness_local.mjs` | 538 | `9b676300…` |

## 2. Retained evidence (independently recomputed)

| Record | Result |
| --- | --- |
| Definition hash (sha256 over the `$currentness_install$` and `$currentness_fingerprint$` blocks, LF) | `cab02e549fe17ce9836e67ce41c1e77e12e86fbe5e1ef825d87d2614ff9e0ac9` at `f581b6b`, equal to `currentnessDefinition` in `evidence/doc49-currentness-bindings-20261008.json`; it changed from `cc19d43d…`, as it must, because the install text and fingerprint changed |
| `evidence/sql-currentness-source-receipt-f581b6b.json` | `sourceCommit` `f581b6b`; 66 entries; all 66 sha256-lf equal the Git blobs; the receipt does not contain itself |
| `evidence/doc49-currentness-bindings-20261008.json` | `review` `d9809c10…`; 55 inventory entries, all equal at base `18bfbcd` |
| Historical evidence | no file under `docs/health-launch/quick-order-20261005/evidence/` was modified or deleted between `7f8edd7` and `30085a6` |
| Held objects | no `research_health_quick_order_guard_source_write`, no `research_health_quick_order_commit` and no decision-inputs column exist at `f581b6b`; `normalized_decision_inputs` appears only as the pre-existing artifact kind in the publication envelope |

## 3. Spec items (inspected source at `f581b6b`)

| Doc 49 section 5 item | Result | Anchor |
| --- | --- | --- |
| Seed one HELD head at install | PASS | `insert … authority_head(singleton) values(true)` inside the hashed install text (`.sql:203-204`); column defaults give epoch 0, `held`, null references and reason; reapply verifies the seal and does not re-insert; `integrity()` requires exactly one singleton row (`:217-219`) and the install's closing check requires it held (`:392-394`) |
| No lazy creation; absent head refused | PASS | the `on conflict … do nothing` insert is deleted; `publish_revision` (`:297-299`) and `revoke_revision` (`:324-326`) raise 55000 "Quick Order authority head unavailable"; `revoke_revision` keeps 22023 only for a missing revision; nothing else inserts a head |
| Three `ON DELETE RESTRICT` foreign keys | PASS | `research_health_quick_order_head_{active,published,revoked}_revision_fk` (`:150-155`), immediate and validated; `integrity()` asserts name, columns, `confdeltype 'r'`, `confupdtype 'a'`, validated, not deferrable (`:220-237`); `publish_revision` inserts the revision before updating the head, so the immediate check sees it |
| Revision immutability and head-removal refusal | PASS | one statement-level `BEFORE UPDATE OR DELETE OR TRUNCATE` trigger on revisions (type 58) and one `BEFORE DELETE OR TRUNCATE` trigger on the head (type 42), both `ENABLE ALWAYS`, sharing `research_health_quick_order_currentness_refuse_mutation()` (`SECURITY INVOKER`, `search_path ''`, revoked from every role); statement level is stricter than the row level doc 49 suggested because it also fires on zero-row statements |
| Monotonic epoch | PASS | row-level `BEFORE UPDATE` trigger (type 19) refusing a null or smaller `writer_epoch` (`:178-186`); equal is allowed; the seed insert does not fire it |
| Reader stays constant | PASS | the `read_current_authority` block is byte-identical to `3e82154` |
| Fingerprint excludes internal triggers | PASS | `where not t.tgisinternal` in the candidate, precheck and postcheck; the constraint clause still records the three foreign keys by name; the two new trigger functions fall under the `currentness_%` predicate, so the fingerprint and the ACL loop cover them |
| Pre and postcheck | PASS | both call the sealed `integrity()` (head count, foreign-key shape, three exact user triggers, every non-null reference resolving) after the seal check, then assert a held singleton and the constant reader; the precheck still permits absence |
| Pristine rollback | PASS | refuses any revision, a missing or extra head, or a head differing from epoch 0, `held`, null references and null reason; audit columns excluded by design; drops the head before the revisions, then the two trigger functions; no CASCADE |
| Nineteen-row list unchanged; nothing else changed | PASS | mechanically equal in all three SQL files and the verifier constant; no change to ACL, seal, refusal or lock logic beyond the spec |
| Verifier coverage | PASS | seeded head after install, reapply and reinstall; absent-head refusal of publish and revoke; each immutability refusal; epoch decrease and reset refused, same and increase allowed; each foreign key refusing a dangling reference and a restricted delete; pristine rollback allowed and non-pristine refused; seal stable across reinstall despite new RI trigger OIDs; HELD list, exit codes, argv, receipt confinement, Docker flags and cleanup unchanged. Fixtures disable only the candidate's own triggers inside transactions that fail or roll back, then re-assert trigger types, enablement and seal; they do not weaken the candidate |

## 4. Lens findings (verified)

Two lenses with adversarial verifiers, four agents. Eight findings upheld at P3; one (records dirty state) refuted as
superseded by the builder's later clean commits.

| ID | Sev | Finding | Smallest correction |
| --- | --- | --- | --- |
| HI-1 | P3 | A plain `TRUNCATE` of the revisions table is refused by PostgreSQL's foreign-key check with 0A000 before the 55000 guard fires; the guard is reached only by a truncate that includes the head or uses CASCADE. The refusal holds either way; only the SQLSTATE differs from doc 49's wording. The verifier already accounts for it. | One sentence in `rollback.md`, in the next records delta (re-pin bindings and receipt). |
| HI-2 | P3 | Both guards share one function and one message, so a refusal of `truncate revisions, head` cannot be attributed to the revisions guard by its error; the revisions guard's TRUNCATE event is proven structurally (trigger type 58 in `integrity()` and the verifier), not behaviourally. | Optional: put `TG_TABLE_NAME` and `TG_OP` in the error detail (changes the definition hash; re-pin), or record the structural proof. |
| HI-3 | P3 | The epoch guard refuses only decreases, so ordinary owner DML can still rewrite state, references or reason at the same epoch; within spec, and mitigated by the constant reader, the held checks and the pristine rollback. | Record that the future currentness and commit protocol must require a strict epoch increase on every authority-changing head write. |
| HI-4 | P3 | The new absent-head branches in `publish_revision` and `revoke_revision` are shadowed by `integrity()`, which runs first and raises the same message, so the verifier's absent-head cases exercise `integrity()`; the branches are defence in depth, reachable only under a concurrent removal that requires disabling an ALWAYS guard. | A verifier comment or records note. |
| HI-5 | P3 | The pre and postcheck delegate reference resolution to the installed `integrity()`, whose body is bound through the sealed fingerprint; sound under the declared owner-trust model. | Optional inline check in the two scripts (re-pin). |
| HI-6 | P3 | With internal triggers excluded, neither the seal nor `integrity()` observes the enablement of the foreign keys' internal RI triggers; a superuser could disable one undetected. Compensated by `integrity()`'s explicit reference check and the ALWAYS revisions guard. | Optional OID-independent check: every `pg_trigger` row whose `tgconstraint` is one of the three foreign keys has `tgenabled = 'O'`. |
| HI-7 | P3 | Header comment typos at `.sql:3` ("scope1d4f2c3"; "dc3329" for `dc3329b`), outside the hashed blocks. | Fix with the next change to the file (file hash only; re-pin). |
| HI-8 | P3 | Records lag the source: the README still headlines `3e82154` and doc 48 as current, and `SQL_CANDIDATE_DRAFT_STATUS_20261006.md:87-89` still says no immutability triggers or foreign keys exist; only the handoff is current. | One dated doc 49 and doc 50 pointer in the README and a status correction in the next records delta. |
| HI-9 | P3 | Carry-forward of doc 49 Q-8: the receipt directory's line-ending attributes do not cover JSON, so an autocrlf checkout rewrites the `f581b6b` receipt and the verifier's raw-hash check fails closed. | Pre-admission raw-hash check in the qualification manifest. |

Information the verifier recorded, not findings against this subject: the builder checkout has moved on to
`90f4ebd` (the qualification supervisor and manifest) and `6d0fe86` (a handoff); the five subject paths, the bindings,
the receipt and the `30085a6` records are byte-identical there. `90f4ebd` is a separate, unreviewed subject and is
next in the queue after the 5C design. A disposable run must pair the intake receipt at `3e82154` with the currentness
receipt at `f581b6b`; the old currentness receipt at `3e82154` is superseded (61 of 66 entries now differ).

## 5. Disposition

- Subject: `f581b6bd42b5c32cb7791677159522ddf6274aaa` (tree `9efb20d5…`) with records `30085a6`.
- **SOURCE ACCEPT WITH LIMITS.** Limits: everything NOT RUN, including every verifier case, the seal value and
  reinstall seal equality; hosted state and ownership NOT PROVEN; findings HI-1 to HI-9, all P3.
- **What this unlocks:** the currentness family at `f581b6b` replaces the `3e82154` version as the accepted source for
  any future disposable verifier run, and the B-8 reader preconditions from doc 46 are now present in source.
- **What stays held:** the decision-inputs column, its validator and digest rule (doc 49 5C-3, under review in the
  corrected design); the writer-guard function and trigger set and the commit body (doc 42 §5C, doc 49 section 3);
  installation, registration and any execution, each under its own authority; the push of these local commits, which
  needs its own payload authority.
- **Next in the review queue:** the corrected 5C design (separate record), then the supervisor and manifest at
  `90f4ebd` once it is handed over with its exact identity.
