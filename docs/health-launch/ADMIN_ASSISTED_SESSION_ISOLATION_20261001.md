# Assisted-order admin session isolation

Status: reproduced defect, local correction implemented; qualification in progress. Not independent acceptance, server authorization proof or release approval.

Session: `codex-xenios-health-launch-implementation-20260930`.
Branch: `codex/xenios-health-launch-implementation-20260930`.
Task: `HEALTH-ADMIN-ASSISTED-SESSION-ISOLATION-20261001`.
Base records/handoff: pushed `ccaf555ac42871eeb4d24a0ddd814ec95eb57406`.
Base runtime: `ed5c5ad50585bf05c43b22134e196d49b8d98456`, tree `7a694e71c5d7f6ed3fee2c31fd8a616a3f1de326`.

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

The next bounded financial slice needs an allowlisted admin-only read projection backed by a new additive, locally tested migration. ADP03's integrity fingerprint covers all assisted-order functions and relations: adding a new function without an intentional reviewed seal transition would invalidate the authority. Do not bypass that seal through an unrelated function prefix or edit the existing migration. No financial read migration or new financial endpoint is included here.

Supabase guidance was used to preserve canonical session/API authority and least privilege, rather than adding a parallel role or granting database access. Current [function privilege guidance](https://supabase.com/docs/guides/database/functions) and [API exposure guidance](https://supabase.com/docs/guides/api/securing-your-api) were checked; no hosted configuration was inspected or changed. The official changelog also warns that newer client releases drop Node20 support; this task retains the user-required verified Node20.19.0 and existing locked dependencies, with no library upgrade. That compatibility policy is a separate release consideration, not permission to change the pinned toolchain.

## Continuing release limits

HL01's exact browser evidence remains for its own production client, not this successor. The existing loopback previews remain available but do not qualify these new admin pages. No native zoom, real JWT/managed RLS/PostgREST, live admin/browser or independent Claude result is claimed here.

Protection remains held: static hard-hash mismatch, three seam differences and the separate broad-branch out-of-zone failure. No gates or manifest bytes are weakened. Earlier failed/timed-out/skipped runs and ADP03's19,357 pass/1 fail/85 skip aggregate remain separate; a fresh resource-controlled release aggregate is still required at integration.

F1 operational evidence-source/grant decisions, governed void/refund/dispute/current-uncertainty and historical reconciliation, exact HL11 independent acceptance, remaining public/admin/supplier journeys and safe reviewed image integration remain open. No new P0/P1/P2 census is asserted. The existing Claude reviewer and image/media lane ownership are preserved.

No deploy, merge, managed migration, hosted configuration, price release, real account grant, real email, money, procurement or clinical action occurred.
