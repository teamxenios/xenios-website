# Resource Hub admin denial and retry isolation

- Session: `codex-resource-hub-admin-denial-20260907` (isolated worker delegated by Astra B).
- Worktree: `C:\Users\sboad\projects\xenios-resource-hub-admin-denial-20260907`.
- Branch: `codex/resource-hub-admin-denial-20260907`.
- Base: `db0e5270afd0e943ae52bb0c84d5c786b92c78e7`.
- Code commit: `4f0384103bc57db35f23e90ca9bd133dbad6ba79`.
- Code tree: `ab1f81fdec88a9dea977e9466fdfc43abdd59011`.
- Push verified by `git ls-remote`: the branch pointed to the exact code commit before this records-only successor.
- Independent reviewer: requested from Astra B; pending. No self-acceptance.
- Production: not accessed or mutated; A remains sole integrator and production executor.

## Scope and behavior

The code commit changes exactly `client/src/research/pages/adminx/ResourceHubAdmin.tsx` and `client/src/research/resource-hub/admin-principal-isolation.test.tsx`.

The shared admin resource hook retains its old data after forbidden, unauthorized, unavailable, denied, and error results. The Resource Hub page formerly treated any loading state with retained data as authorized. After a failed load, another same-principal refresh or retry therefore exposed the old library and its controls. The prior action outcome also rendered outside the authorization boundary.

The page now owns a retained authorized snapshot. An ok result replaces it; loading preserves it; any other settled result clears it during the current render. Retry loading cannot recover it from the shared hook's stale data. Fresh ok is required to display the Hub again. Failed loads unmount the forms and discard draft fields. Outcomes live inside the boundary and clear on all failed-load states. Same-principal successful refreshes preserve unsaved upload text, review reasons, and current action outcomes. Account changes continue to remount the principal-keyed body. The shared auth hook is unchanged.

## Verification

Toolchain: `C:\Users\sboad\.codex\toolchains\node-v20.19.0-win-x64\node.exe` reported `v20.19.0`; installed Vitest `4.1.10`. Existing Fable `node_modules` was reused through a junction in the isolated worktree with Vitest caching disabled. No installation, full suite, server process, browser process, build, or production action ran.

Before the page fix, the new transition file ran against the unchanged base page: **10 failed / 11 passed**. Five failures specifically reproduced old metadata/controls returning during retry loading after each failed-load state. Five failures reproduced the prior action outcome still disclosing the resource title on each failed-load state. This was an intentional failing reproduction.

After the fix, the following focused command passed **2 files / 41 tests / 0 failures**, duration 11.18 seconds:

```powershell
& C:\Users\sboad\.codex\toolchains\node-v20.19.0-win-x64\node.exe node_modules/vitest/vitest.mjs run client/src/research/resource-hub/admin-principal-isolation.test.tsx client/src/research/pages/adminx/ResourceHubAdmin.test.tsx --maxWorkers=1 --fileParallelism=false --cache=false
```

Coverage includes real `useAdminResource` state transitions (only adapter I/O mocked), deferred retries, fresh successful recovery, the actual error retry button, outcome invalidation/recovery, late review completion after same-principal denial, same-account refresh preservation, account switch, logout, stale list completion, and preview/action principal isolation.

An initial invocation included the unsupported Vitest 4 option `--minWorkers=1` and exited before collecting tests. Removing that obsolete option produced the intentional red reproduction and final green command above. `git diff --check` and local continuity validation passed. Original Fable worktree remained Git-clean; A/B original worktrees were not edited. Full typecheck, full suite, build, and browser QA were not run because this worker is scoped to focused tests.

## Integration

Independently review and cherry-pick code commit `4f0384103bc57db35f23e90ca9bd133dbad6ba79` only. The next commit records this isolated worker's local registry/task/lease and handoff; it is not an integration requirement and should not replace A's shared continuity state. Re-run the focused command on the integrated tree. Scanner and locked-gate work belong to separate workers and are absent from this code commit.

No remaining implementation blocker is known. Acceptance of the exact code SHA is pending independent review. The isolated worktree is intentionally retained for reproduction, including its ignored dependency junction.
