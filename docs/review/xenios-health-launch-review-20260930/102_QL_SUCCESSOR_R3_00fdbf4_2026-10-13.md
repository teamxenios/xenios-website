# Existing-wizard QL correction successor, revision 3 (`00fdbf4`): source review

**CORRECTIONS REQUIRED: one P1 (QS-1), with a two-line fix plus tests. Everything doc 99 asked for is in.**

- **QL2-1 corrected.** The in-flight marker is persisted before every POST, cannot be overwritten by the write-through
  effect while a request is outstanding, restores as uncertain with the same key and `acceptedAt`, and the stamp is
  released only on a definitive refusal observed by the live page before any uncertain outcome. The conflict branch now
  persists uncertainty too (QL2-6). The remedy's regression exists and fails at `7a2bf753`.
- **QL2-2 corrected.** Both forbidden strings now give the status/support direction or the enter-again direction,
  promise no same-request retry, invent no URL. The pinned assertions are replaced by name. `EarlyAccessRoute.tsx` and
  its sweep are byte-identical to the base.
- **QL2-3: source half corrected, record half pending.** The `draft-store.ts` header is accurate. The operating
  disclosure exists (hash verified) with the right content, but it binds itself to `3a03ad6`, lives outside the
  candidate tree, and no runbook-in-force attestation exists. That is a release condition (QS-2), not a source blocker.
- **The two guard commits beyond doc 99's remedy** (lifecycle generation, ownership preflight, late-completion
  suppression) introduce no false success, no new duplicate path and no blocked legitimate first submission. They
  remove a latent base defect: a dead page's late success used to write a credential across the privacy sweep and
  clear a newer attempt's draft. They also introduce QS-1.
- **Evidence binds the bytes.** All five receipt groups name candidate `00fdbf4a` and tree `7658adc8`, Node 20.19.0
  with the pinned binary, exit 0 throughout. The full suite R3 is a genuine unfiltered aggregate: 18,064 passed, 85
  skipped, 0 failed, 965 files passed and 6 skip-only; all 85 skips are pre-existing environment-gated skips identical
  at the deployed base, none in the changed files.

Nothing was executed here. Reviewer: this session, `claude-fable-5-1`. Board task
`DOC96-EXISTING-WIZARD-QL11-QL12-DELTA-REVIEW-20261012` revision 3 (registered 2026-10-12T23:24:23Z), acknowledged at
`1c38150`. Controlling: doc 99 (`fa0228e`).

**Target:** `00fdbf4a971752e9b9182b1404adad2dd1e7e675` (tree `7658adc8…`), the tip of
`codex/assisted-order-doc99-followup-20261012`; five commits on the reviewed base `7a2bf753`; exactly four paths:
`AssistedOrderPage.tsx`, `AssistedOrderPage.test.tsx`, `draft-store.ts`, `draft-store.test.ts`. Records: packet
`80eebec5` (sha256 `a87f1dde…` verified), executed addendum `7594b1fd` (`6698bffd…` and `run.log` `3cfdbc9e…`
verified).

**Method.** Three read-only lenses (QL2-1 and the guards; QL2-2, QL2-3 and scope; evidence binding), each with an
adversarial verifier, then a critic. I walked the QS-1 row myself. Output is archived as
`hl12/102_ql_successor_r3_review.json`.

## 1. The P1

**QS-1. A restored, unstamped page whose storage writes fail from its mount onward drops its own committed success.**
- **The row.** A page restores a draft `{K, acceptedAt: null, "none"}` (a previous page in the same tab wrote it). Its
  mount write-through fails (`sessionStorage.setItem` throws: quota, or a private-browsing mode that reads but refuses
  writes), so `storeFailed` is true while `storedOnce` stays false and `lastPersisted` stays null, because those refs are
  initialised to `false`/`null` regardless of the draft the page read (`AssistedOrderPage.tsx:460-465@00fdbf4a`). The
  ownership preflight passes (the store holds `{K, null}`, equal to the page). The closure stamps `now`; the pre-POST
  write fails; the store still holds `{K, null}`. The POST commits. At `:971`, `attemptOwnsStoredDraft` compares
  `{K, null}` with `{K, now}` and returns false; the fallback requires `lastPersisted !== null` and returns false. The
  closure returns before `storeAssistedOrderReceipt`, `clearAssistedOrderDraft` and `navigate`, and sets no copy. The
  form re-enables silently; the next click shows the store-lost copy; a refresh restores `{K, null, "none"}`, re-stamps,
  and the server answers `idempotency_conflict`.
- **Why P1.** A committed request with no client receipt, no message and no navigation, where the base navigated
  (`:836-847@7a2bf753`), and the code's own comment at that spot says a quota or privacy failure must never
  reinterpret an accepted request as a failed one. The customer's only recovery is staff lookup by contact and time.
- **Fix.** Seed both refs from the draft the page restored, immediately after the read at `:382`:
  `storedOnce = useRef(draft !== null)` and
  `lastPersisted = useRef(draft ? { idempotencyKey: draft.idempotencyKey, acceptedAt: draft.acceptedAt } : null)`.
  Walked consequences: the lagging own identity is forgiven on the receipt, refusal and uncertain paths; after a sweep
  the restored page is correctly disowned (store absent, `storedOnce` true); a fresh page is unchanged.
- **Proving tests (two).** (a) Restore a draft, make every write fail from the first render, submit, resolve the POST:
  expect the receipt stored, the draft cleared, navigation to the confirmation. (b) The same with a sweep before the
  late answer: expect no credential, no navigation. Both must fail at `00fdbf4a`.

No other source change is required for release.

## 2. Release conditions (P2; not source blockers)

- **QS-2. The QL2-3 record and runbook.** Carry the operating disclosure into the release record for the exact released
  SHA (verbatim or by verified hash), with `appliesTo` naming that SHA and tree; add a runbook-in-force attestation;
  correct its uncertainty sentence to cover the one path the successor deliberately trades receipt delivery for
  identity isolation (a 200 that answers a page already swept or lost is discarded; recovery is staff lookup by
  contact and time); name the store-lost copies.
- **QS-3. The database pre-check.** Doc 99 §4.5's check for existing `payment_pending` / `payment_review` rows had no
  record naming the request or the hold condition when the packet was frozen. Samuel has since approved one read-only
  production pre-check (saved query, 610 B, SHA-256 `4c2ad612…`, project `yvzeduax…`, one attempt within 30 minutes,
  ROLLBACK). Its registered result, with the approval and execution timestamps, is the evidence; the counts decide the
  runbook handling of any existing rows.

## 3. Named limits (P3)

**Successor behaviour:** QS-4, a terminal answer to a page that is alive but disowned leaves it silent until the next
click (practically unobservable, since each route sweep also unmounts the wizard); QS-5, the in-flight marker is set
before the `try`, so a synchronous throw while building the input would leave it stuck; QS-7, a stale comment at
`:538-540`, a generic refusal fallback without an after-uncertain arm, and the conflict-specific direction lost on
restore; QS-8, any non-sweep removal of the draft key ends ownership (re-entry under a new key, no duplicate), and a
failed pre-POST write followed by loss mid-flight leaves the first-attempt 403 copy unproven.

**Tests:** QS-6, one late-completion test cannot fail for the guard it names, the QL2-6 test stops one step short of
the remedy, three ownership rows are reasoned but not exercised through the page, and five same-commit controls have no
red receipt.

**Evidence and records:** QS-9, the registration still carries pre-R3 "incomplete" strings beside the R3 addendum, the
R1/R2 outcomes were supervisor process-observation failures rather than suite timeouts, R3's pass of one release-control
test depends on a runner-injected `core.autocrlf=true`, the follow-up runs used donor-copied `node_modules`, and two
records-only pushes made without exact approval are not carried; QS-10, `npm run check` does not type-check
`draft-store.test.ts` (tsconfig excludes `**/*.test.ts`), no real-PostgreSQL persistence test executed in R3 (every
such suite is among the 85 gated skips), and the build warnings and the "28 protected hashes" figure come from
summaries rather than attached logs.

**Carried from doc 99 unchanged:** QL2-4, QL2-5, QL2-7 (the five real-API cases prove the wrapper's mapping only),
QL2-8 to QL2-16 (server hold, admin UI, audit, payment-state rows), QL2-17 to QL2-19. QL2-20 (typecheck) is now closed
except for `draft-store.test.ts`.

## 4. Next steps

1. **Builder:** revision 4 with the QS-1 two-line fix and its two tests, and nothing else in the four files. Rebind the
   targeted pair, `npm run check`, protection CLI and companion, and the full suite to the new SHA under Node 20.19.0.
   The R3 result stands as context for the unchanged files, not as the gate receipt for the new commit.
2. **Coordinator:** register revision 4 for a narrow check (the two initialisers, the two tests, the receipts). Fix the
   QS-9 registration strings in the same revision.
3. **Release conditions, in parallel:** QS-2; QS-3's approved pre-check result; the browser lost-response journey per
   doc 99 §4.3 (submit, drop the response, change the catalog version, reload, resubmit, exactly one request); the
   admin PATCH refusing the three held states from the UI; route uniqueness; a render-build with the lockfile install
   and the served-version check; Samuel's current release authority.

Source acceptance of revision 4, when it comes, is not qualification, installation or deployment. Nothing here
authorizes tests, a push, integration or deployment.
