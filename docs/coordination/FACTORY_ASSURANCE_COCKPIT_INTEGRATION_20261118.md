# Guarded advisory cockpit source integration — 2026-11-18

The accepted core source `586ad7e6a0d3755a3b69f1effa1318e25cab8e9b` passed67/67 actual pinned Node20.19 tests and all five hosted gates, plus independent Codex and CLAUDE-3 source acceptance (KAN-234/13453 and13470). PR503 merged into the existing Root integration branch at `517152a1f2ed24c8cccd6404988cee5137766f96`; this is source integration, not a controller/daemon deployment.

Cockpit source `32545fe218ced1fc90f8791ff4bdcc6a2ef8c2a9` passed31/31 actual pinned Node20.19 reader/control tests,0fail/skip, after a finite calendar-invalid timestamp correction. The earlier f55 28/28 receipt remains historical. It extends the existing Node cockpit with one guarded GET and advisory view; it does not create a Python server or per-GET subprocess.

This integration explicitly runs all four supplied Node test files in hosted CI: core67 plus cockpit31, expected98 cases. They are not silently delegated to the separate Vitest collection. All Node setup steps pin20.19.0, matching the package/runtime toolchain. Hosted execution of this assembled revision remains pending until its actual run completes.

The fixed server-owned source port defaults to unavailable. A qualifying JSON string is not issuer authentication: Root must supply a separately qualified coherent export of the adopted existing authority. Capture timestamps never replace absent/stale authority timestamps; invalid calendars remain unknown. The view exposes no permission, deployment or worker authority. Historical operator observations remain observations, with current authentication/native execution unknown.

No current export binding, cockpit listener, daemon, seat, registry, provider or production application setting is changed here. Coordinator repair still requires actual runtime qualification and Root's explicit adoption barrier for legacy/direct writers and old-worktree wrappers. The first36-case coordinator attempt safely refused its initial owner observation; that failure is not a passed repair. Actual authenticated native task/handoff/interruption/resume and a frozen real learning evaluation remain separate completion gates.

## Actual hosted platform finding

First exact integration `0a8641bd6623ac0031d922a137fd7c3f1160d0c7`, run44366424187, actually executed the98 Node cases on Ubuntu:97PASS/1FAIL. The existing control HTTP refresh test correctly rejected runtime compatibility because the Windows helper looked for npm beside the Node executable; the Linux distribution stores npm under lib. Raw log SHA256 `98a5e16651e1536ed3705105ed9cdc44e7737a0c24fb5987f81a2792ea38084c` is preserved. No guard or test assertion is weakened.

The successor runs the full98-case namespace in a dedicated Windows hosted job on20.19.0, matching the actual cockpit target. It needs no repository dependency installation. Required CI completion depends on that job as well as the four existing execution jobs and rejects failure/skips. There are now six total required jobs including the completion gate. Application Vitest/typecheck/build/protection remain on Ubuntu; all Node setup steps pin20.19.0.
