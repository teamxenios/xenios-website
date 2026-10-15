# Applied phase A: original applied-byte and custody confirmation

**CONFIRMED. Application `47f49adf` matches the accepted source exactly. The manifest differs from the Doc 167
template only in the two permitted values.**

- **Application.** The application changes exactly the 40 accepted paths.
- **Fixed files.** The 39 fixed after-images match their reviewed pins.
- **Manifest.** It is the accepted template with only two fills: the actual lease and the actual authority record. The
  custody return stays PENDING.
- **Custody.** The cited grant, lease registration, receiving acknowledgment and control receipt all exist, match their
  pins, and fall in the Doc 167 order.

This is step 3 of the two-stage order: the original applied-byte confirmation. Nothing was run. It is not test,
typecheck, build, database, browser or release qualification. It is not a custody return, and it does not admit any
execution.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects,
committed blobs and the physical files in the application worktree. No tests, application parsing, patch application,
queries or agents. Accepted source (Docs 163–167) was not re-reviewed. Archive:
`hl12/168_applied_phase_a_byte_and_custody_confirmation.json`.

## 1. The application commit

- **Identity.** Commit `47f49adf` (tree `a2a8e79d`) has a single parent, `8e85daa` (tree `25507c2f`). It sits on
  `codex/mixed-request-intent-20261015` in `C:/xenios-wt/mixed-request-intent-20261015`, which has full history.
  - The worktree is clean at that commit.
  - No remote branch contains it.
- **Scope.** The full-tree diff against `8e85daa` lists exactly 40 paths, 29 added and 11 modified. They are exactly the
  paths of the confirmed index (`a935911b…`), and there is no 41st file.
- **Preimages.** The 11 modified paths' parent blobs equal the index before-blobs. All 29 added paths were absent at the
  parent.
- **Fixed after-images.** All 39 committed blobs match the index pins exactly: blob, SHA-256 and size.
- **Physical files.** All 40 files on disk are byte-identical to their committed blobs, and none contains CRLF. The
  CRLF resolution record (Doc 220, `f0a0856b`, 6,768 B, `792cf9c4…`) exists as cited. It changed no committed content.
  The parent tree stayed `25507c2f`.

## 2. The manifest

- **Applied file.** `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` is 99,604 B, sha256 `dd99bc37…`, blob `a3d6809c`.
- **Two fills.** Filling the Doc 167 template (`89c17ed3…`) in exactly two places reproduces the applied file byte for
  byte:
  - `lease=UNASSIGNED` becomes `lease=abb400e5-c7cb-45db-bc76-dcb83b008738`;
  - `authority=UNGRANTED` becomes
    `authority=b169c9dc…:docs/coordination/launch-coordination-20261005/DOC217_…json#sha256=370397a2…`.

  `custody-return=PENDING` is unchanged. The file parses, and the first byte that differs is inside the lease value.
- **Seam pins.** They are the accepted `server/index.ts` `1a3fb0b7…` and `server/research/index.ts` `000da4da…`, as the
  matching fixed blobs confirm.

## 3. Custody records, against the Doc 167 order

- **Decision.** The Doc 216 payload exists at `b169c9dc`.
  - Its identity recomputes to `16cb139e…` (SHA-256 of the payload as compact JSON).
  - It binds source `96aa00c8`, index `a935911b…`, cumulative patch `b8b77b7e…` and template `89c17ed3…`.
  - Its 40 after pins equal the index.
  - Its manifest procedure is the two-stage order, and it requires this confirmation.
- **Authority.** The Doc 217 record exists at `b169c9dc` (2,151 B, `370397a2…`). It records:
  - the human approval of that exact payload, local only;
  - Root's acceptance as registry, delegation and return custodian;
  - the first manifest fills, limited to lease and authority, with the return PENDING.

  I verified the record and its bindings. I cannot independently verify the human's answer beyond the IDs Root
  recorded.
- **Receiving acknowledgment.** Core's acknowledgment is dated 2026-10-15T01:28:18Z, before the lease claim and the
  source write. At that point it records the lease as not yet claimed.
- **Lease registration.** Registration commit `11f88f78` (tree `8d5abecb`) changes the registries only by adding
  rows:
  - one task row, `claimed`;
  - one lease, `abb400e5`, `active`.

  Each lists exactly the 40 paths. No existing task or lease row was removed or changed. The session registry moves
  only the Core session's pointers. No other active lease overlaps the 40 paths.
- **Order of events.**
  1. Grant, 01:24:45Z.
  2. Acknowledgment, 01:28:18Z.
  3. Lease claim, 01:29:00Z.
  4. Application commit, 01:36:15Z.
  5. Control receipt.
- **Control receipt.** Commit `2824e896` (tree `c7ecdfc0`) adds only `APPLIED_SOURCE_RECEIPT.json` (23,949 B,
  `6bf39afb…`). It records the commit, the 40 pins, the two fills, the active lease, the return PENDING and phase B not
  started.

## 4. Where custody stands

- **Phase A.** Lease `abb400e5` stays active. The custody return is PENDING. No finalizer lease, return or phase B
  exists, and none should be invented.
- **Next steps in the Doc 167 order.**
  1. Separately authorized qualification under this custody.
  2. The real return, with the receiving owner's acknowledgment.
  3. The finalizer, under its own valid authority, fills only the custody return, freezes and measures the manifest,
     and re-runs the protection and seam checks.
  4. My final-record confirmation.
- **Qualification note.** This worktree has `core.autocrlf=true`. The files on disk are correct now, but any
  re-checkout could turn them back into CRLF and break raw-byte hash checks. Verify the raw bytes before relying on
  such checks.
- **Not covered here.**
  - Doc 218's launch directive covers tests, typecheck, build, browser, security closure and rotation, database
    qualification and application, push, deploy, and live proof.
  - This confirmation neither verifies nor admits any of that. Each needs its own execution authority, limits and
    prerequisites.
- **Security.** Security authority is NONE. The pending staff-read scope stays unapproved until the exposed-credential
  condition is closed and service-role rotation is confirmed. Names stay deferred, as recorded.
- **Unchanged.** R8 and Docs 160–167 stay closed. Failed run `790af2ce` stays FAILED, and the payment and security
  holds stay open. 97 authored test declarations remain not run.

Not execution, qualification, push, deployment or production consent; not a custody return; not test credit.
