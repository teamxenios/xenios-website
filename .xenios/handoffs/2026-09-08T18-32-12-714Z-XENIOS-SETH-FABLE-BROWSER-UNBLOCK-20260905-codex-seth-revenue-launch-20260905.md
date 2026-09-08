# Fable browser/toolchain checkpoint

The existing evidence-tooling slice was revalidated from the current source on 2026-09-08 with its dedicated Vitest configuration:

```
node node_modules/vitest/vitest.mjs run --config scripts/evidence/vitest.config.mjs \
  scripts/evidence/lib/cdp-import-order.test.mjs \
  scripts/evidence/capture-synthetic-journeys.test.mjs \
  scripts/evidence/capture-browser-matrix.test.mjs
```

Result: 3 test files passed, 78 tests passed, zero failures, in 902 ms. The dedicated config is required because these tests are `.mjs` evidence-tooling tests and are intentionally excluded from the root TypeScript Vitest glob.

This confirms the lazy CDP import, synthetic journey capture contracts and browser-matrix validators at source level. It does not claim a new browser run: the actual corrected Resource Hub browser run is already recorded separately as 15 steps and 45 captures. No production credentials, service calls, migrations, application deployment or user effects occurred here.
