# Founder-directed PR #25 security-correction ownership

Date: 2026-07-20

Samuel directed CODEX to continue the existing PR #25 correction to its
secure review gate while the PowerShell session owns coordination documents
only. This is a transfer of implementation ownership for the existing branch,
not a new feature branch or pull request.

## Branch and pull request

- Branch: `claude/research-account-email-systems`
- Pull request: #25
- Starting head for this correction: `f48bda0befa35a9cb0abfe5dd1cb1d2b0d3e5026`
- Target: the same draft PR; do not merge or mark ready

## CODEX-owned correction files

- `client/src/lib/supabaseBrowser.ts`
- `client/src/lib/supabaseBrowser.test.ts`
- `client/src/lib/tracking.ts`
- `client/src/lib/tracking.test.ts`
- `client/src/main.tsx`
- `client/src/research/core.tsx`
- `client/src/research/layout.tsx`
- `client/src/research/pages/ResetPassword.tsx`
- `client/src/research/recovery-isolation.test.tsx`
- `client/src/research/recovery-route-isolation.test.tsx`
- `server/research/member-auth.ts`
- `server/research/members.test.ts`
- the PR #25 correction/status documentation

## Coordination boundary

Until the correction commit is pushed, no other session should edit the files
above. The PowerShell session may continue its docs-only integration work.
The Claude Desktop session remains an independent exact-head reviewer.

After push, both independent reviewers must inspect the new SHA and explicitly
cover tracking isolation, client recovery-session isolation, and server
recovery-purpose authorization. `READY` from both reviewers is required before
Samuel considers merge. CODEX must not merge PR #25.

## Later UI branch

The fresh `codex/research-access-ui-rebuild` worktree/branch remains blocked
until PR #25 is securely merged and Samuel explicitly confirms the merge. PR
#13 stays closed and superseded.
