# Transaction composition (`121d098` / `dcf8963`): source review

**CORRECTIONS REQUIRED: one P1 and ten P2. No P0.**

The disabled barriers hold end to end, and several of them block a save independently:
- **The app.** `App.tsx` passes the literal `intakeEnabled={false}`.
- **The server.** Containment is unconditional and ahead of the body parsers (`server/index.ts:287-290`).
- **The handler.** It is never mounted.
- **The production factory.** `productionReady` and `enabled` are literal false, and `beginAttempt` refuses because
  the digest, limits and recipient are null.
- **The transport.** It allows only the replay RPC.
- **Notifications.** They are enqueue-only.

**Other things that hold:**
- **Server-side context.** The four-field private context stays on the server.
- **The entry clock.** The HTTP-entry stamp follows the agreed `enteredAtMonotonicMsFor` contract: set once, never
  refreshed, with recovery first.
- **The commit body.** It keeps the stock existence rule, the shared-gate try-lock, head FOR SHARE last, the two
  strict-reader calls and the five atomic writes.
- **The dependency seal.** It binds the doc 82 definition.

But the commit would persist a wrong canonical value (TC-1), and ten source, control and records gaps remain. The
corrections go to the existing owners in one consolidated pass. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task `QUICK-ORDER-DISABLED-INTEGRATION-SOURCE-REVIEW-20261011`
revision 2, acknowledged at `12b0db1`.

**Target:**
- **Source:** `121d0987ed138f7377dd00ecc6ff1c6c26cf2deb` (tree `f57044e8…`).
- **Records:** `dcf896356892ef670b72a9aaaf124f176f7d9b83` (records only on top of the source).
- **Scope:** the 21 paths, covering the intake family and its verifier, the adapter, production, ports and handler,
  the nine integration paths and the regression tests.
- **Context, not re-reviewed:** the doc 82 currentness family.

**Lineage.** After the authorized fixed assembly `3f86463`, every code change is inside the 21 paths, except the doc 82
accepted currentness verifier (`264e6af`).

**Method.** Five read-only lenses, each with an adversarial verifier, then a critic:
- the intake transaction;
- the intake verifier;
- the adapter, handler and production;
- the integration, session and root;
- the records and bindings.

I confirmed TC-1 in the bytes myself.

**Disclosures.** Behaviour is reasoned, NOT RUN. Raw hashes were not recomputed; Git blob IDs and sizes match. Output
is archived as `hl12/83_transaction_composition_findings.json`.

## 1. Corrections (stage S2)

**Builder (`01a10d78`)**

| ID | Sev. | Defect | Smallest fix |
| --- | --- | --- | --- |
| **TC-1** | **P1** | **The commit persists the raw stored session hash into the canonical `early_access_session_hash` column** (`intake.sql:789-792`). Canonical writers store `sha256(sessionId)` (`express.ts:178-181`, `:200-202`), and the ownership check compares that value (`bridge migration:738`). Once enabled, an Early Access customer could not find their own request, and the private session lookup key would be copied into the broad requests table. This is a wrong persisted value, not a refusal, so it does not fail closed | Store `pg_catalog.encode(extensions.digest(pg_catalog.convert_to(context->>'rawStoredSessionHash','UTF8'),'sha256'),'hex')`, which equals the viewer's hash, or NULL under a registered decision. Record whether `events.actor_id` intentionally differs. Rebind the intake digest and receipts. Add controls showing an Early Access viewer can read back their own request and the raw key never appears in the request row |
| TC-2 | P2 | The precheck and postcheck keep the old blanket refusal of the commit and guard names, and lack the currentness dependency gate, so neither can pass in a valid state | Remove the refusal. Apply the install's exact dependency gate in both branches. Accept exactly the five intake signatures when present |
| TC-3 | P2 | The carried CC-15-TYPES condition is unmet in the intake SECURITY DEFINER readers, the validator, the fingerprint and the DO blocks. This is the doc 80 CS-2 class: a temporary shadow domain could run code as the owner | Qualify every non-keyword type and cast as `pg_catalog.*`, and rebind |
| TC-4 | P2 | Carried CC-10 is not closed for non-retryable definite refusals. Every non-conflict outcome becomes the 503 "could not confirm", so the unchanged page locks the same key even for refusals that recur on every retry. `INTO STRICT` absences raise unmarked errors | Apply the mapping ruled in section 2. Replace `INTO STRICT` absences with explicit checks raising closed `DEFINITE_REFUSAL` markers |
| TC-5 | P2 | The concurrency and try-lock controls don't discriminate. The two-commit race isn't forced to overlap, and doc 75's queued-writer and shared-only try-lock controls are absent | Make the race deterministic, and add the missing try-lock controls |
| TC-6 | P2 | Readback of a real commit isn't compared with the submission (contact, addresses, agreements, lines, event, companion, obligation and outbox recipient), and the no-other-effect check covers five relations only | Assert the exact readback against the payload and the outbox recipient, and snapshot the additional relations |
| TC-7 | P2 | Most setting, identity, private-context and eligibility refusals have no one-value negative control. This is the doc 80 CS-12 precedent | One negative per refusal class beside its positive twin, plus recovery under `lock_timeout='0'` and without set role |
| TC-11 | P2 | Both receipts, including the FINAL currentness receipt, omit five baseline files the verifiers load: the disposable bridge bootstrap and four quote migrations. The handoff claims nothing is missing. This fails closed | One records successor adding the five rows to both receipts, marked records-only to the FINAL currentness receipt for my byte confirmation. Re-seal the intake dependency. Correct the handoff, and check every consumed-path list |

**Integrator (`01a0e098`)**

| ID | Sev. | Defect | Smallest fix |
| --- | --- | --- | --- |
| TC-8 | P2 | The disabled-factory control proves nothing beyond its own null stamp, because `beginAttempt` is never reached. `production-deps.ts:138` writes a literal `maximumDelayMs: 0`. That is a refusal sentinel, not an operating value, but it needs a disposition under doc 78 C-1. The factory also supplies a real context and clock, against C-11 "supplies nothing" | Drive the composed ports with a valid stamp, and assert no armed attempt, no context call, a refused commit and only replay RPCs. Remove the runtime from the disabled composition, or keep the zero sentinel. **Ruling: a zero delay that only forces refusal is not a C-1 operating literal**, provided a comment states it and a control proves it refuses |
| TC-9 | P2 | Access-token expiry discards the same-account held attempt and rotates the idempotency key (`App.tsx:91-98`, `:110-115`). That contradicts the stated contract ("rotate on logout or account change, not access-token refresh") and loses same-key recovery, so a duplicate request becomes possible | On expiry, keep refusing transport but keep the in-memory key and attempt until sign-out, password recovery or a different user. Add the expiry-then-refresh control |

**A scope decision for you or the coordinator**

| ID | Sev. | Defect | Options |
| --- | --- | --- | --- |
| TC-10 | P2 | Accepted Quick Order client controls are missing from the composition tree, and the records don't disclose it: the operator readback block in `AdminAssistedOrderSession.test.tsx` and the disabled route contract in `App.routes.test.ts`. The renderer they covered is byte-identical to the accepted base, so what's lost is regression detection, not behaviour. Both files are outside the nine-path approval | **(1)** Restore the readback block, adapted to the approved `App.tsx`. **(2)** A records-only disposition naming the replacement controls. **Recommendation:** (1) for the readback block, which protects authorized operator readback, a core customer outcome; and (2) for the route contract, which the composition test already partly covers. Either needs a narrow additional path approval or the records disposition |

## 2. Ruling on TC-4 (extends doc 75's CC-10 ruling)

This is a design ruling, not business policy. It uses only response contracts the unchanged page already handles:

| Refusal class | Mapping |
| --- | --- |
| Catalog, price, offer, witness or estimate drift | 409 `catalog_changed` |
| Agreement-pair drift | 409 `terms_changed` |
| Input validation, eligibility or verified-link refusal | 422 `invalid_input`. Definite, so it clears the attempt and key and the customer isn't trapped |
| Quick Order held, authority or currentness unavailable | The existing 503 `temporarily_unavailable` with the key kept. A same-key retry is safe and may succeed after re-activation |
| Confirmed-abort retryable refusals (doc 75) | 503 with the key kept, unchanged |
| Anything after transmission without a confirmed abort | OUTCOME_UNCERTAIN with the key kept, unchanged |

Each class needs a distinct closed SQL marker. If the page's 422 wording would misstate an eligibility refusal, that
wording change is separate, scoped work. Until then the mapping must not trap the key.

## 3. Precision and later stages (P3)

**S2, fold in where cheap:**
- **TC-12.** The admission privilege check is any-of and incomplete.
- **TC-13.** The same budget-exhausted condition is non-retryable at admission and retryable at the gate.
- **TC-14.** SQL precision: a GUC-sensitive LIKE and constant predicates.
- **TC-15.** Stale pre-doc 82 wording.
- **TC-16 and TC-17.** Verifier, adapter and root assertions that cannot fail, and missing classification rows.
- **TC-18.** `session()` admits actor forms the SQL refuses.
- **TC-19.** The nine-path authority, lease provenance and protected-seam item are not bound in the composition
  records.

**S3:**
- **TC-20.** Relations first opened after `decisionAt` can still wait on relation locks.
- **TC-21.** The FINAL dependency seal is unreachable until the descriptor is bound, and must be re-bound then.
- **TC-22.** Unreachable verifier controls and held timing cases.
- **TC-23.** Deadline granularity.
- **TC-24.** The actual bridge-enabled root and the real Auth client are unqualified.
- **TC-25.** Protected-seam dispositions for `server/index.ts`, `root-composition.test.ts` and `App.tsx`.
- **TC-26.** The schema and checkout binding step has no explicit disposition.

**S4:**
- **TC-27.** Install and rollback timer admission.
- **TC-28.** No operator signal for uncertain outcomes.

**Rejected:**
- **ID-9:** refuted.
- **ID-1 at P1:** re-rated to P2, as TC-10.
- **IC-1 as a browser privacy leak:** no JSON builder reads the column; it is kept as TC-1's persisted-value defect.
- **Several lens statuses:** corrected to PARTIAL.

## 4. What this does and does not settle

- **Source and composition:** CORRECTIONS REQUIRED, as above.
- **Qualification (S3):** the transaction's mandatory cases still need execution under their own approval. Those are
  a durable save, same-key concurrency and recovery, conflict refusal, rollback, authorized readback and unauthorized
  denial. TC-5 to TC-7 make the authored controls able to prove them.
- **Configuration and installation (S4):**
  - the real Health legal and configuration artifacts;
  - the limits-setting values and anchor;
  - the descriptor binding;
  - an installer;
  - the protected-seam and GATE-01 dispositions.
- **Live operation:** not ready, and not evaluated here.

**Next step:** one consolidated correction from each owner (builder: TC-1 to TC-7 and TC-11; integrator: TC-8 and
TC-9), your decision on TC-10, then revision 3 registered for a bounded delta check. Nothing here authorizes tests, SQL,
installation, a push or deployment.
