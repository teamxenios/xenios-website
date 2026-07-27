# Test, Typecheck, Build, Security, Accessibility, and Browser Report

## Environment

- Host: Windows
- Repository runtime contract: Node `20.19.0`, npm `10.8.2`
- Validation host runtime: Node `24.14.1`, npm `11.11.0`
- Database verifier: disposable PostgreSQL 16 in Docker

The Node/npm variance did not cause a test, typecheck, or build failure, but CI and production must use the repository-pinned versions.

## Automated validation

| Gate | Result |
|---|---|
| Focused catalog/cart-selection/persistence tests | PASS, 46 tests |
| Focused member catalog tests | PASS, 17 tests |
| Full Vitest suite | PASS, 222 files; 3,772 passed; 1 intentionally skipped |
| TypeScript `npm run check` | PASS |
| Production build `npm run build` | PASS |
| Route uniqueness | PASS, 251 static Express API registrations |
| Migration DAG/checksums | PASS, four frozen-base nodes |
| Base-relative `git diff --check` | PASS after newline cleanup |
| Secret-pattern review | PASS with only explicitly fake test/doc markers |

## PostgreSQL 16 validation

### Persistent cart

- migration applies twice;
- committed verifier passes;
- four forced-RLS tables;
- zero browser policies/grants;
- service role has table `SELECT` only and reviewed RPC execution;
- direct DML denied;
- member/anonymous put, remove, claim, and expiry lifecycle passes;
- sequential and concurrent idempotent replay passes;
- price, product, required-input, and domain-readiness races fail closed;
- append-only redacted command/event evidence remains intact;
- rollback leaves zero residual objects/rows.

### Admin authority

- 25 disposable PostgreSQL checks pass;
- migration applies twice;
- forced RLS and direct-DML denial pass;
- fixed-search-path command RPCs pass;
- bootstrap, replay, and concurrent role assignment pass;
- preference optimistic version/idempotency passes;
- append-only audit passes;
- rollback zero passes.

## Build observations

- Main browser bundle: approximately 738.08 KB minified / 210.42 KB gzip.
- Build warns that `AdminResearchHome.tsx` is both statically and dynamically imported.
- Dormant Care chunks are still emitted because they exist in the frozen base; Care remains disabled and absent from Research navigation.
- Bundle splitting/performance refinement remains advisable before a high-traffic launch.

## Browser and accessibility matrix

Read-only local Vite validation of `/research` at 1440, 720, 375, and 320 pixels:

- exactly one `<main>` and one `<h1>`;
- one labeled password input;
- no document-width overflow;
- zero off-screen focusable controls;
- zero visible Care/clinical links;
- zero browser console warnings/errors.

This proves the signed-out Research gate only. Authenticated member/admin/catalog/cart/checkout and provider flows were not browser-tested because no real authorized session or real product records were fabricated.

## Control-plane note

`verify:production-state` correctly fails closed in the isolated branch without externally supplied expected production/head identities. The checked-in production record is historical evidence and was not falsified to match an undeployed takeover candidate.
