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

## Companion gates on the same tree

- `npm run check`: PASS (`tsc`)
- `npm run verify:route-uniqueness`: PASS — 427 static Express registrations
  across 418 call sites
- `npm run test:release-control-plane`: 51 passed, 1 intentional skip (52)
- `npm run build`: PASS — Vite transformed 2,265 modules; server bundle emitted
  (`dist/index.cjs` 1.6 MB), with only the existing dynamic-import and chunk-size
  warnings.
- `npm run site:record:check`: PASS — source SHA `f681afe6e19bede4de75fb4e7b811fa09a0bb339`,
  production SHA `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`, 219 routes, 15
  capabilities.

## Reconciliation artifact integrity

- Canonical reconciliation Git-blob SHA-256: `f4bc33e6e3ee45ec407adf795906d3149df44a17d738c705d717f3e8cd84af19`.
- Source reconciliation input SHA-256: `7e338d041a1889b6c3dbf25e474d5b0440cc8f72e70dc8e5119a175137094d93`.
- Production schema evidence Git-blob SHA-256: `9254b6d9b7e8717c42b23e9752cb2eaccf90d43d9f1812d77eac44990d21cf77`.

The working checkout is configured with `core.autocrlf=true`; hashes above are
computed from exact Git blobs, avoiding false drift from checkout line endings.

## Focused catalog and Product Control verification

On the exact A tree, the catalog/formulation/reconciliation/Product Control
focused set completed with **15 test files passed and 191 tests passed** in
4.96 seconds. It covered formulation holds, catalog reconciliation/diff and
completeness, price reads and tier guards, Product Control price review and
admin projections, the reconciliation route/adapter/panel, and quantity-tier
readiness. No activation or mutation path was invoked.

`node scripts/agentic/xenios-os.mjs validate` also returned `{ "ok": true }`.
