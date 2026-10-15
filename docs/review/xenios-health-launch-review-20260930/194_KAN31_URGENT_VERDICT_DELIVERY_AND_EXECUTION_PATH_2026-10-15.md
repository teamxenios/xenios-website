# KAN-31 urgent delivery: verdict, a correction to Doc 193, and the execution path

**The verdict on `674f4ade` is unchanged: CHANGES REQUIRED** (Doc 193, `36fe6e5b`).

- **No new candidate since.** Core `770eb7a` is a separate source-only input-mechanism record and does not touch the
  reviewed bytes.
- **Not accepted.** Nothing is accepted to meet the deadline, and nothing can execute now.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only; no agents.
- **Request.** Samuel's urgent 60-minute M0 request.
- **Timing.** Prepared at 2026-10-15T21:30–21:31Z.
- **Delivery channel.** No Codex coordinator session is reachable from this session; `ListAgents` shows only offline
  Claude peers. Delivery is this pushed record plus Samuel's relay. KAN-31 cannot be written from here, so Root relays.

## Correction to Doc 193

**What Doc 193 said.** Section 2's last sentence said the fix changes "only the finalizer, plus its pins in the
launcher and supervisor `FIXED`."

**That is wrong.** `finalize-managed-evidence.UNAPPLIED.mjs` is not pinned by the launcher, the supervisor, the G0
entry or the harness; I checked by text search. The correction changes only the finalizer file, and later its own
finalizer-admission pins.

**What follows.**
- The finalizer defect does not block the browser HTTP/UI run or the Doc399 postcheck.
- It blocks only the final PASS determination.
- The finding itself stands as written.

## What can proceed, and in what order

### 1. The earliest blocking condition: an authority and evidence gap, not a code defect

There is no verified secure input mechanism and no local launch custodian.
- **Doc 403.** Not verified and not identified.
- **Core `770eb7a`.** The launcher only inherits a parent environment, and no injector or custodian exists.

**Smallest correction.** Samuel or Root must designate a real local launch custodian and an approved, nonsecret-named
injection method for the listed staging inputs (including the service-role key and session secret) into the exact
launcher process. No value may be retrieved or invented by reviewers or agents.

### 2. Also required before any browser run

None of these is a source defect:
- **Guard checks.** The new guard's offline companion actually executed. The G0 entry refuses without its receipt: 28
  passed, 0 failed, 0 provider calls, guard `4a8fd720`, companion `88cabcac`, Node 20.19.0.
- **Program checks.** Syntax, type and offline checks of the new programs.
- **Source7.** Custody, a fresh inventory (producer `e0c2d7b9`) and pins.
- **Exceptions.** Protected-copy, egress and config exceptions, plus materialization permission.
- **Grant.** Root's exact grant: resource, exclusivity and a finite window, with the `realStaging` flags and a
  `secureMechanismReference`.
- **Memory.** A fresh G0 with all three readings ≥ 2,048 MiB. The last two attempts saw about 1,623 and 1,700 MiB
  available, so a resource change is likely needed.
- **Approval.** Samuel's exact approval of the staging effects: one session, nonce exchange, agreement acceptance,
  limiter writes, and 3 retained synthetic requests and events.

### 3. After the run

The best status is `HTTP_UI_CLEANUP_COMPLETE_PENDING_INDEPENDENT_DB`. Then a separate Doc399 approval for the
populated query or substitution, and its single execution.

### 4. Before any PASS

The finalizer correction from Doc 193, and my re-review limited to the changed bytes. Then the finalizer run on the
actual pins, then my independent final-result review.

**Can be done now, in parallel and source-only.** The finalizer correction, and executing the offline guard companion
and syntax checks, once Root authorizes those local checks.

**Holds.** Staff, security (KAN-85), payment, phase A, the manifest and live verification stay OPEN. NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | Core 674f4ade (unapplied browser apparatus) | reviewer 6abf1edf | verdict unchanged CHANGES REQUIRED (doc 193); CORRECTION: finalizer is NOT pinned by launcher/supervisor/entry/harness, so its fix does not block the HTTP/UI run or Doc399 postcheck, only the final PASS | earliest blocker = no verified secure input mechanism/custodian (Doc403, Core 770eb7a) + 2048 MiB capacity; also guard-companion receipt, syntax/offline checks, source7 pins, exceptions, Root grant, Samuel's staging-effects approval | nothing executable now; finalizer fix + offline checks can proceed in parallel | doc 194.`

Not execution, admission, approval, push, deployment or production consent; not human approval.
