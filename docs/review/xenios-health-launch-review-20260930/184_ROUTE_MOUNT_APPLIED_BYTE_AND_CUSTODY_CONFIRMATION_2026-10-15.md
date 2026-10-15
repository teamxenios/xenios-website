# Route-mount correction: applied bytes and custody

**CONFIRMED.**

- **Applied bytes.** Application `e33c12a9` contains exactly the two after-images reviewed in Doc 183, byte for byte,
  on a single parent `84178ce1`. Nothing else in the tree changed.
- **Custody.** Custody conforms to the Doc 318 payload and the Doc 324 grant.

This is a source-only confirmation. It is not test credit, not a custody return and not admission.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only. No source review was reopened (Doc 183 at `66da5feb` controls); nothing run; no agents.
- **Packet.** Root `63f5ba3` DOC326 (3,678 B, `6372c54d…`).
- **Timing.** Reviewed at 2026-10-15T11:09–11:12Z.

Archive: `hl12/184_route_mount_applied_byte_and_custody_confirmation.json`.

## 1. Applied bytes (`e33c12a9`, tree `ab4415f0`, single parent `84178ce1`)

- **The raw diff against `84178ce1`.** It lists exactly two `M` entries, with both file modes still `100644`:
  - `scripts/acceptance/verify-route-uniqueness.ts`: blob `4f0a474a` → `84674e19`, 23,685 B, `157ac000…`;
  - `server/release-control-plane.test.ts`: blob `9ca5f3cc` → `ad3b131a`, 114,935 B, `f9518705…`.
- **Match to the proposal.** Both new blobs are identical to the `after/` images in proposal `503e5100`, and both old
  blobs are the patch's declared base blobs.
- **Nothing else changed.** No configuration, attributes, package, lock or third path changed. So runtime routes,
  mounts, guards, the manifest, Auth, SQL and payment are byte-identical to `84178ce1`.
- **Normalization.** The receipt records CRLF physical preimages of 19,359 B (`bf471e78…`) and 113,463 B
  (`41fcb90e…`). I recomputed these as the exact CRLF renderings of the LF `84178ce1` blobs: 527 and 2,723 newlines,
  hashes equal. The CRLF-to-LF replacement that Doc 318 expressly includes is therefore exact.

## 2. Custody against Doc 318 and Doc 324

- **Approval.** Root's DOC324 (`62b56409`, 8,171 B, `bc95ba0d…`) records the human answer "Approve exact two-path
  source/custody exception", call `…de89`, item 0, at 10:58:18Z.
  - The Doc 318 payload hash (SHA-256 of the compact `JSON.stringify` of the payload) recomputes to `87f09a42…`.
  - The answer is Root's record; I did not witness it and infer nothing beyond it.
  - DOC318's own `actualHumanApproval: PENDING` is its pre-answer state.
- **Sequence.** The approval (10:58:18Z) came first. Then:
  - Core's receiving ACK at 11:00:57Z;
  - the exclusive lease `7917fbba` at 11:01:33Z;
  - the control commit `a6a27ee3` at 11:04:22Z;
  - the application at 11:05:31Z;
  - the receipt at 11:07:06Z.
- **Registry (`a6a27ee3` against `c4c77214`).**
  - Only the four permitted `.xenios` files changed.
  - All 160 old leases, 105 old tasks and 57 foreign sessions are identical.
  - One lease and one task were added, each for exactly the two paths.
  - The own session changed only its heartbeat, its current task and lease pointers (with the previous values
    recorded), and an added `doc318BoundedSource` block.
  - The phase A lease `abb400e5` (40 paths) is still active and unchanged.
  - No other active lease covers either path, and `FILE_OWNERSHIP` is untouched.
- **Receipt.** Core `bd8170ae` holds `ACTUAL_SOURCE_APPLICATION.json` (9,290 B, `30c861bf…`, blob `9fe3d467`). It
  equals Root's DOC325 frozen copy, and Root 325 records independent verification.
- **Exclusions honoured.** No test, compiler, scanner, G0 or SQL was run. Nothing was pushed (`LOCAL_ONLY_NOT_PUSHED`).
  Hooks were disabled process-locally for the commit (`core.hooksPath=NUL`). That is consistent with the excluded
  test and compiler runs, and it is not a configuration-file change.

## 3. Limits and what remains

- **Still pending, and not invented.** The bounded two-path return and Root's receiving ACK, and the separate phase A
  40-path return.
- **Line endings.** The worktree files are now LF, and Git warns they will become CRLF. Future pins must be measured
  from the actual qualified root, not inferred from this worktree.
- **Regression.** Regression 309 stays FAILED (61 passed, 1 failed, 1 PG16 skip). The three new tests are NOT_RUN,
  and 445/454 is unmeasured.
- **Required before any credit.** A full new candidate, new pins, the reviewed 66-identity runner, and fresh, separate
  check and regression admissions. The old check credit does not transfer. The integrator's exact-tree reuse argument
  is not claimed here.
- **Holds.** The browser resource requirement, the Doc 247 DB, the security exposure, staff reads, the final manifest
  and live verification are unchanged. NOT LIVE.

Not execution, admission, write, push, deployment or production consent; not human approval; not test credit; not a
custody return.
