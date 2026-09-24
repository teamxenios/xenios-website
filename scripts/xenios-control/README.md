# Xenios Control Cockpit

This is a local-only, read-mostly browser cockpit for customer-launch verification. It binds to `127.0.0.1:4177` and exposes no production, database, Git-write or arbitrary-command surface.

## Start and stop

From PowerShell at the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/xenios-control/START_XENIOS.ps1
powershell -ExecutionPolicy Bypass -File scripts/xenios-control/STATUS_XENIOS.ps1
powershell -ExecutionPolicy Bypass -File scripts/xenios-control/STOP_XENIOS.ps1
```

Startup resolves exactly Node `20.19.0` and npm `10.8.2`, preferring `XENIOS_NODE_HOME`, then `%USERPROFILE%\.codex\toolchains\node-v20.19.0-win-x64`, and finally PATH only when both versions match. The pinned directory is prepended to the child PATH so cockpit actions use the same pair. Startup uses the full Express application only when `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SITE_URL` are all present. If any are absent, it starts the supported Vite client at `127.0.0.1:5000` and reports `CLIENT_ONLY`; it never invents or displays credentials. PID state is isolated per absolute worktree path under `%LOCALAPPDATA%\XeniosControl`.

The cockpit can also be started directly with `npm run xenios:control`, but direct starts are intentionally not claimed by the helper PID registry and therefore are not stopped by `STOP_XENIOS.ps1`.

## Bounded actions

The UI has a closed allowlist: customer route smoke, TypeScript check, production build, helper-owned app restart and sanitized committed-HEAD package generation. Requests require an in-memory CSRF token and exact loopback Host/Origin checks. Logs are size-bounded and redacted.

## Package

```powershell
powershell -ExecutionPolicy Bypass -File scripts/xenios-control/PACKAGE_XENIOS.ps1
```

This creates `%USERPROFILE%\Downloads\XENIOS-LAUNCH\xenios-website-<SHORT_SHA>.zip`, a launch handoff and operator helpers. It packages committed `HEAD`, removes prohibited paths and performs a filename/private-key marker scan before publishing the zip. Uncommitted changes are deliberately not presented as an exact-SHA archive.
