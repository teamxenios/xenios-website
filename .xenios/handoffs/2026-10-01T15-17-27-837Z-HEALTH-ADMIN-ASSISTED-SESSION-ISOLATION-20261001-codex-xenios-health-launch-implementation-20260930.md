# Assisted-order admin session isolation

Status: reproduced defect corrected; bounded local qualification complete. Not independent acceptance, server authorization proof or release approval.

Session: `codex-xenios-health-launch-implementation-20260930`.
Branch: `codex/xenios-health-launch-implementation-20260930`.
Task: `HEALTH-ADMIN-ASSISTED-SESSION-ISOLATION-20261001`.
Base records/handoff: pushed `ccaf555ac42871eeb4d24a0ddd814ec95eb57406`.
Base runtime: `ed5c5ad50585bf05c43b22134e196d49b8d98456`, tree `7a694e71c5d7f6ed3fee2c31fd8a616a3f1de326`.

## Exact successor and results

- Runtime: `6d64d3e5d90fef9e49d3414244f77f486231b59e`.
- Runtime tree: `10c6783e01a7b2fe9b1b60693ab501a6a5229ba4`.
- Test-only: `7a35394e68add4066dee6c0c83425996405f4f5a` (26 new mounted component cases).
- Release controls inherited unchanged: `edf8526bdefc34b8e87fa6e46585573535dba6cd`.
- Clean build/control revision: `47074f2c1043e847be8213285a4f4c3bc638a312`, tree `ff2722b663c43814e91725e8e3489efb67459c6d`.

Six executions are preserved separately in `evidence/admin-assisted-session-isolation-20261001/raw-checks-final.json`, SHA256 `f9cb3c7665db030c1cbf6d2a4b330982dca82bd3cdf4c9f2a828efb51be286e7` (187,673 bytes). The archive contains exact raw log bytes, receipts, commands, dirty states, hashes and the collector source. Every log hash matched its own terminal receipt. No timeouts or signals occurred in these six runs.

| Run | Result | Wrapper seconds | Start revision |
| --- | --- | --- | --- |
| `admin-session-repro` | 2 FAIL, 0 SKIP, exit1 | 23.916 | `ccaf555`, unchanged runtime; new test/records dirty |
| `admin-session-focused` | 114 PASS, 5 files, 0 SKIP, exit0; Vitest9.35s | 10.383 | `ccaf555`, frozen corrected runtime/tests dirty |
| `admin-session-typecheck` | PASS, exit0 | 28.131 | same frozen precommit files |
| `admin-session-build-final` | PASS, exit0; 1,353 source and226 build files, zero forbidden forms | 49.786 | clean `47074f2` |
| `admin-session-protection-final` | FAIL, exit1;37 hard hashes pass, static mismatch,3 seam warnings and inherited out-of-zone branch changes | 0.699 | clean `47074f2` |
| `admin-session-routes-final` | PASS, exit0;462 registrations/453 call sites | 5.430 | clean `47074f2` |

All use the verified private Node `v20.19.0`, npm `10.8.2`; official Windows archive SHA256 `be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`. The focused run used one worker, no file parallelism and the real catalog dataset environment (the focused cases do not themselves constitute whole-catalog coverage). Its sampled runner, child and worker all report the pinned executable. Sampling is bounded, not continuous. Build sampling sees runner/npm but not grandchildren behind the command shell; the process-local PATH is pinned. The subsecond protection run has no snapshot. No complete child-process attestation is claimed.

From the repository root, with the private Node directory prepended only to the current process PATH and `XENIOS_MASTER_OFFERINGS_DATASET` set to the generated member-safe dataset:

```powershell
$node20 = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe'
& $node20 node_modules/vitest/vitest.mjs run client/src/research/assisted-order/AdminAssistedOrderSession.test.tsx client/src/research/assisted-order/api.test.ts client/src/research/pages/adminx/admin-sign-out.test.tsx server/research/assisted-order/http-e2e.test.ts server/research/assisted-order/financial-projection.test.ts --maxWorkers=1 --no-file-parallelism
& $node20 node_modules/typescript/bin/tsc --noEmit
& $node20 C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js run build
& $node20 scripts/acceptance/verify-core-site-protection.mjs
& $node20 --import tsx scripts/acceptance/verify-route-uniqueness.ts
```

The exact executed argument arrays and environment dataset are in each receipt. The build retains existing mixed-import and large-chunk warnings. No dependency changes or new full-suite aggregate were made for this bounded prerequisite.

## Why this prerequisite

While preparing an authorized financial reconciliation screen, source inspection found that the mounted assisted-order detail ignored canonical session state and retained customer contact/address/document data after sign-out. A document-download promise could also open its result after sign-out. These pages are mounted directly behind Suspense in the existing admin route family; there is no enclosing AdminScreen that unmounts their contents on a session change. The queue hid its UI while signed out but retained results and accepted obsolete asynchronous responses, allowing old data to return under a successor session.

The initial two-test mounted-component reproduction ran on unchanged runtime at `ccaf555`, with only the new test and continuity records dirty. Node v20.19.0/npm10.8.2, one worker, no file parallelism, real catalog reader enabled. `admin-session-repro`: two failures, no skips, exit1;20.82s Vitest/23.916s wrapper;2026-10-01T14:59:18.326Z through14:59:42.242Z. Log SHA256 `db4d188cd8fdadf92c16d071de07c698337aaaefab877c22ba05b2b3006045ec`. It reproduced both retained synthetic customer data and the attempted window.open for a synthetic document URL. This is synthetic mounted React evidence, not a claim that actual customer data was accessed or a live authorization bypass occurred.

## Narrow implementation

Only these runtime paths change:

- `client/src/research/assisted-order/AdminAssistedOrderSession.tsx` (new).
- `client/src/research/assisted-order/AdminAssistedOrderDetail.tsx`.
- `client/src/research/assisted-order/AdminAssistedOrderQueue.tsx`.

The new local presentation boundary consumes the existing canonical `useAdminSession`. It permits child rendering only with ready state and a nonempty token. An opaque monotonically increasing local generation remounts all child data and drafts when token or session state changes. Credentials do not become React keys, DOM attributes, URLs, logs or persistent storage. The generation prevents A-to-B-to-A from reviving A's initial continuations. A401/403 response synchronously latches denial for the current generation before rerendering; other pending operations cannot restore data or open a ticket afterward.

The detail now observes the route identity through the existing router, safely decodes it and remounts per request. GET/PATCH response request IDs must match. Reads, errors and finalizers are guarded by current scope; duplicate submits use an immediate ref guard. A read epoch prevents an older read from superseding a mutation. Document links open only after a successful result still belongs to the current mounted session/request; failures are handled. The queue clears prior results, suppresses query-mismatched snapshots during its existing debounce and ignores old query/session promises.

Server-side request authorization, verified admin identity, API paths/headers, finance grants, financial state and SQL are unchanged. A client session is never proof of admin authority. This correction cannot undo an already committed PATCH, revoke an already issued/opened signed URL or discover server-side revocation without an observed canonical session change or API denial.

## Financial work remains separate

The existing financial read exposes only `hasObservation` and `paymentVerified`. It is insufficient for a truthful reconciliation view of accepted quote economics, immutable capture/verification lineage and separate current fulfillment holds. Neither the customer-owner-bound quote RPC nor source-granted no-funds context should be repurposed as an admin diagnostic read.

The proposed financial read slice needs an allowlisted admin-only read projection backed by a new additive, locally tested migration. ADP03's integrity fingerprint covers all assisted-order functions and relations: adding a new function without an intentional reviewed seal transition would invalidate the authority. Do not bypass that seal through an unrelated function prefix or edit the existing migration. No financial read migration or new financial endpoint is included here.

During final qualification, reviewer branch `76607458e30a64746d227150ff1dbab3475dd64a` became locally available. Its complete report `24_REVIEW_8f24082_CORE_SUCCESSOR.md` was read. It closes F4 and HIST-02 at its exact `8f240828df93ad45f31609d85460bd9d111047ec` candidate, but confirms LENS-01 (legacy paid notices missing from the pre80 census) and provider ADP-G1 through ADP-G4 latent blockers. LENS-01 now takes priority over the proposed financial read UI. Those review results are not acceptance of this later admin/HL01/HL17 successor. Its two failed load-sensitive race runs remain failed; the isolated passing race run does not replace them.

Report24 also identifies SEAM-GOV-01: the restored Access Hub reverses the prior owner-approved B-1 redirect. The exact static/App hashes remain unamended and promotion stays blocked pending the founder's explicit product disposition. Technical safety review alone is not that decision. `server/index.ts` and the Research gateway were reviewed safe for a possible owner amendment, not authorized for one.

Supabase guidance was used to preserve canonical session/API authority and least privilege, rather than adding a parallel role or granting database access. Current [function privilege guidance](https://supabase.com/docs/guides/database/functions) and [API exposure guidance](https://supabase.com/docs/guides/api/securing-your-api) were checked; no hosted configuration was inspected or changed. The official changelog also warns that newer client releases drop Node20 support; this task retains the user-required verified Node20.19.0 and existing locked dependencies, with no library upgrade. That compatibility policy is a separate release consideration, not permission to change the pinned toolchain.

## Continuing release limits

HL01's exact browser evidence remains for its own production client, not this successor. The existing loopback previews remain available but do not qualify these new admin pages. No native zoom, real JWT/managed RLS/PostgREST, live admin/browser or independent Claude result is claimed here.

Protection remains held: static hard-hash mismatch, three seam differences and the separate broad-branch out-of-zone failure. No gates or manifest bytes are weakened. Earlier failed/timed-out/skipped runs and ADP03's19,357 pass/1 fail/85 skip aggregate remain separate; a fresh resource-controlled release aggregate is still required at integration.

F1 operational evidence-source/grant decisions, governed void/refund/dispute/current-uncertainty and historical reconciliation, exact HL11 independent acceptance, remaining public/admin/supplier journeys and safe reviewed image integration remain open. No new P0/P1/P2 census is asserted. The existing Claude reviewer and image/media lane ownership are preserved.

No deploy, merge, managed migration, hosted configuration, price release, real account grant, real email, money, procurement or clinical action occurred.
