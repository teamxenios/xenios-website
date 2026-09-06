# ASTRA-B full-suite serial verification — 2026-09-05

## Exact source

- Branch under test: `codex/xenios-seth-revenue-launch-20260905`
- Candidate tree under test: `096d70c17c823fa6ad3fefc7a7d72f91edd54a39`
- Working tree: `C:\\Users\\sboad\\.codex\\worktrees\\f36a\\xenios-website`
- Observed locally: `2026-09-05T23:12:03-05:00` (run started at `22:58:52`)

## Command

```text
npm test -- --reporter=dot --testTimeout=120000 --no-file-parallelism --maxWorkers=1
```

This is a local, single-worker Vitest run. It performs no deployment, migration,
price activation, production configuration change, external communication, or
provider/database mutation.

## Result

```text
Test Files  876 passed | 5 skipped (881)
Tests       13507 passed | 59 skipped (13566)
Failures    0
Duration    780.75s
```

The skipped tests are the suite's declared skips. This evidence supersedes the
earlier parallel host-contention observation for the full-suite assertion gate;
browser, authenticated production, payment, supplier, and production-authority
gates remain separate and are not claimed by this run.

