# Locked-gate evidence correction handoff

- Session: `codex-locked-gate-evidence-20260907` (coordinator-assigned isolated worker).
- Task: `RESOURCE-HUB-LOCKED-GATE-EVIDENCE-20260907`.
- Branch: `codex/resource-hub-locked-gate-evidence-20260907`.
- Worktree: `C:/Users/sboad/projects/xenios-locked-gate-evidence-20260907`.
- Base: `db0e5270afd0e943ae52bb0c84d5c786b92c78e7`.
- Pushed code SHA: `d95d2e4f0329881e4bbe25dbc48aab4a8eca029f`.
- Code paths: `docs/resource-hub/locked-gate-safety-bar.mjs`,
  `docs/resource-hub/LOCKED_GATE_ADMISSION_NOTE.md`, and
  `docs/resource-hub/locked-gate-safety-bar.test.mjs`.

The probe checks actual partner response bodies in memory and persists only bounded
metadata and privacy booleans. Known private field names and synthetic actor/token/review
values are checked; this is not a universal PII scanner. Both reachability reads, exact
fixture bytes, all fixture transitions, and downstream denials are asserted. Invalid
assertions, parsing, transport, setup or output failures produce a nonzero CLI exit.
An unlocked gate refuses before seeding; only loopback HTTP origins are accepted.

Evidence is explicitly `LOCAL_PREVIEW_ONLY`. Wrong-method/sibling requests are labelled
as containment by the preview boundary before the wall. Canonical JWT/recovery/member
linkage, production mount flags, HEAD, browser auth return and ledger state remain outside
this HTTP probe. The note corrects the original before result to 5 pass / 1 fail and
withdraws the original summary-only leak assertion as evidence. It records the Resources
sign-in return-link gap for the UI owner without changing any runtime seam.

Validation used only pinned Node 20.19.0 with injected fake fetch:

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' --test docs/resource-hub/locked-gate-safety-bar.test.mjs
```

Final result: **21 passed, 0 failed, 0 skipped**, 8.67 seconds. The clean synthetic
transport covers 34 asserted probe rows. Regressions inject body/actor/token leaks,
blocked admission, wrong bytes, failed/lying transitions, generic 404s and transport/output
errors. Actual CLI nonzero exit is tested against a refused origin before network access.
One intermediate run hit the child startup's original 5-second timeout under host load;
the explicit bounded startup allowance is now 30 seconds, and the final run passed.
`git diff --check` passed. No application runtime, install, build, typecheck, browser,
full suite, shared checkout, database or production action was started or changed.

Take the **code commit only** for integration. This continuity successor is an isolated
proposal for A, not an instruction to replace A's shared boards. Local registration and
claim succeeded without conflict; task is QA, lease is handoff, session is handoff_ready.
Root and B independent acceptance remain pending; no self-acceptance is claimed. Next:
review the three-file commit, rerun the bounded self-test, then run the corrected HTTP
probe on the fresh combined locked-gate preview when its runtime owner is ready.

No background process is owned. No unfinished code remains. No founder action is needed
for this local evidence correction. All active Fable/B worktrees and A's seams were preserved.
