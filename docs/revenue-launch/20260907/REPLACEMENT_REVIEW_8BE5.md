# Independent replacement review — exact 8be5 hardening

## Verdict

**ACCEPT WITH EXPLICIT SCOPE** for the pinned Resource Hub hardening candidate as an installation-only, disabled-feature release input.

This review is independent of ASTRA-A, ASTRA-B and Fable. It does not authorize deployment, migration execution, feature activation, account approval, notification, payment, fulfillment, clinical action, or broader Xenios platform completion.

## Exact binding

- Base: `3814c687ef9293f84f939c372fdbc01b278a9193`
- Application: `8be5d582586217e4cf531e718c65032b79152022`
- Application tree: `6fc71d0a896d31d0843dd1eb63fa6265a3da9d28`
- Managed API harness: `711bd4113b9a2458f7c9b46b50a088c8db728677` — 41 checks passed
- Browser host: `2873a333255c015789594920493e10c6b82461b8`
- Browser driver: `9d33ab5370b39cb6400e22db2e3026dbb3276d2c` — 15 steps / 45 captures passed

## Work performed

I created a detached review worktree at `C:\Users\sboad\.codex\review-worktrees\replacement-8be` pinned to the exact application SHA and verified its tree, clean state, and `git diff --check` against the stated base. The supplied pin verifier was run against the repository using Node 20.19.0. It recomputed the 51-path inventory, trusted policy digest, and ownership findings:

- Path inventory: `a6b6c4687bad3b984694ba14765d06fef5f9e0436ce15386b8cf40d728b0fdf8`
- Ownership findings: 37 `UNOWNED_FILE`, 0 `WRONG_LANE_OWNER`, 0 `OWNERSHIP_CONFLICT`
- Trusted base policy: `8f84c67cefa29dab41194fd9e6c6f574ca65c55d40b141803b06139ee26b6cce`

The supplemental exact-module review executed 24 checks with 24 passed, 0 failed and 0 skipped. The checked store and adapter Git blobs matched the pinned source. The recorded managed API and browser receipts were inspected and remain attributed to their stated harness/host; they were not relabeled as this reviewer's execution.

## Scope and findings

The reviewed hardening behavior covers upload winner binding, compare-and-swap review updates, exact timestamp preservation, NULL predicate handling, and provider-error separation. The 37 unowned paths are an explicit baseline-policy finding, not silently waived; there are no wrong-lane owners or ownership conflicts. The attestation JSON is the canonical record of those recomputed values.

The evidence supports bounded installation preparation while the Resource Hub remains disabled. It does not prove managed production Auth/Storage delivery, content/audience approval, real-user identity qualification, feature activation, mobile/role completeness, or full-platform completion. Existing limitations and failed evidence remain authoritative.

## Required next gate

A may consume this attestation only after validating the exact manifest against its bytes and current remote state. A remains the sole production executor. Any deployment, migration, flag change, activation or real-user effect requires the existing execution authorization and fresh prechecks; this review performs none of those actions.
