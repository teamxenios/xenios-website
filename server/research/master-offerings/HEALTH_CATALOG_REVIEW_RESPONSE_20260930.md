# Health catalog correction: exact-source handoff

Source commit: `3e47f92974d90c2a5d16903b0f72ef844519e131`  
Source tree: `4ceec05e1d9f8b17e6b4141cfe9a069752aaa229`  
Branch: `codex/xenios-health-launch-implementation-20260930`

This is a narrow response to Claude's `10_REVIEW_c9d638a_CARE_PRICE.md`. It does not assert independent review of this successor. No hosted environment, migration, email, price release, or payment was changed.

## Authority and presentation

The real generated catalog has 419 Research-visible rows. Product Control still carries 417 authoritative numeric prices and two genuine quote-only rows. The Research projection now asserts 175 numeric displayed prices, 242 intentionally withheld Care numeric prices, and the two quote-only rows. Thus the 244 `null` presentation prices are not characterized as 244 missing authorities. The coverage test retains exact identity, no-zero, submit-denial, and non-Care price fingerprint assertions. It explicitly enables the real dataset reader and walks every row.

FedEx Standard Overnight is excluded from merchandise by canonical GRP-0364 offering identity (`mo_003b0c272099eeb1f114`), not mutable category text. Its source row remains present and shipping treatment remains separate. A similarly labeled real merchandise fixture remains included.

## Runs, separately recorded

- First focused correction attempt: one ordering assertion failed; 15 tests passed. The assertion was corrected, not waived.
- Focused rerun: 2 files, 16 tests passed, exit 0.
- Affected master-offerings, assisted-order, shared contract, and client tests, single worker: 68 files passed, 1 skipped; 810 tests passed, 13 skipped; exit 0.
- Resource-controlled whole suite under private Node `v20.19.0`, npm `10.8.2`, real dataset reader, `npm test -- --reporter=dot --testTimeout=120000 --no-file-parallelism --maxWorkers=1`: 987 files passed, 6 skipped; 18,185 tests passed, 85 skipped; exit 0. Duration 1296.61 seconds. This is a new run at `3e47f92`, not a relabeling of any earlier timeout.
- `npm run check`: exit 0.
- Production `npm run build`: exit 0; source gate scanned 1,332 files with zero forbidden customer-facing em dashes, build gate scanned 224 files with zero; Vite emitted chunk/import warnings, not failures.
- `verify-route-uniqueness`: accepted 453 static Express API registrations across 444 call sites, exit 0.

The test environment set `XENIOS_MASTER_OFFERINGS_DATASET` to the worktree's `server/research/master-offerings/data/member-safe-master-offerings.generated.json`. Node and npm were invoked from the private `C:\Users\sboad\.codex\toolchains\node-v20.19.0-win-x64` toolchain with its directory prepended only to the child process PATH.

## Still open

This correction is not HL-12 payment integrity, HL-11 full intended-variant accounting, or a release approval. Claude's newer composed qualification reports a P1 free-text-paid defect and a separate P1 SQL `40001` retry loop (HL-26). Both remain open for the financial slice. No claim is made that Claude has reviewed this source commit.
