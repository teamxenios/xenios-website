# Website 5 — Care PR 1 production handoff

## Release unit

- Session: WEBSITE 5 — XENIOS CARE FOUNDATION
- Feature domain: Care rail separation, Care roles and authorization, and a
  truthful public Pending shell
- Base branch/SHA: `main` at
  `a486b889503a8f9d42f86c4666e808af6c5e852c`
- Feature branch: `feature/website-5-care-foundation`
- Pull request: `https://github.com/teamxenios/xenios-website/pull/46`
- Full seven-PR staging snapshot:
  `feature/website-5-care-sequence-staging` at
  `1a8dbf8172df37ab7a5941fd340305c00d962c81`

PR #46 is intentionally PR 1 only. The former head `1a8dbf8` is not
mergeable. Later intake, clinician, pharmacy, instruction, supply, labs,
messaging, and adverse-event work remains preserved only on the staging branch
for focused follow-on PRs.

## Included and excluded

Included:

- Branded Care/Research record IDs and a generic, consented discovery seam
  without product, order, purchase, inventory, or instruction linkage.
- Seven Care-only roles, narrow role permissions, and explicit exclusion of
  affiliate, Mitch, fulfillment, trainer, and Research-admin roles.
- A server-authoritative capability record that remains disabled by default.
- A second deployment approval plus database approver and timestamp before the
  server can report `enabled`.
- Supabase JWT verification, active Care-role lookup, and metadata-only access
  decision audit.
- A polished responsive `/care` Pending shell with no form, clinical action,
  provider claim, availability claim, price, product, or launch date.
- A minimal additive migration for capability, role assignment, access audit,
  RLS, grants, constraints, indexes, and rollback notes.

Excluded:

- Eligibility, intake, consent, appointments, clinical review, prescriptions,
  pharmacy routing, patient-specific instructions, supplies, biomarkers,
  messaging, support cases, and adverse-event workflows.
- Medical group, clinician, pharmacy, state, pricing, inventory, or treatment
  records.
- Any AI final clinical decision or Research-to-Care product conversion.
- Any claim that clinical services are live.

## Website 2 locked-file wiring requests

PR #46 makes no direct change to `client/src/App.tsx` or `server/index.ts`.
Website 2 should apply these exact wiring changes during coordinated
integration.

### `client/src/App.tsx`

Add with the existing lazy imports:

```ts
const CareSection = lazy(() => import("@/care/section"));
```

Add alongside the Research route wrapper:

```tsx
function CareRoutes() {
  return (
    <Suspense fallback={<div className="container-x" style={{ paddingTop: 96 }} aria-busy="true" />}>
      <CareSection />
    </Suspense>
  );
}
```

Add alongside the `/research` routes:

```tsx
<Route path="/care" component={CareRoutes} />
<Route path="/care/*" component={CareRoutes} />
```

### `server/index.ts`

Add:

```ts
import {
  buildCareProductionDependencies,
  carePageGate,
  registerCareApi,
} from "./care";
```

Add `"/api/care"` to `PII_PATHS`.

Before the generic API 404 and SPA catch-all, add:

```ts
app.use(carePageGate);
registerCareApi(app, buildCareProductionDependencies());
```

The status route reads the real server-side capability record. The protected
access probe verifies JWT and active Care roles. Neither route accepts clinical
data.

## Migration delta and production order

File: `supabase/care-access-foundation.sql`

Creates only:

- `public.care_capabilities`
- `public.care_role_assignments`
- `public.care_access_audit`
- `public.care_has_role(text[])`

The migration is additive and repeatable, inserts only the canonical disabled
capability row, forces RLS on all three tables, removes public/anonymous table
authority, permits security-admin-only reads of roles and access audit, and
provides no authenticated write policy. It creates no clinical or Research
record.

Approved application order:

1. Confirm the production project is `yvzeduaxbwgcwllhywff`.
2. Record existing Care object presence and relevant row counts.
3. Dry-run this single migration on a disposable Supabase-compatible database.
4. Apply through the authorized production migration path.
5. Reload PostgREST schema if required.
6. Confirm the `care` capability row is `disabled`.
7. Confirm RLS, grants, policies, constraints, and indexes.
8. Confirm no existing non-Care record counts changed.
9. Apply the two locked-file wiring requests.
10. Merge and deploy through Website 2's coordinated Render sequence.

Required environment-variable names:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `CARE_ENABLED`
- `CARE_ENABLE_APPROVED`

Do not place values in GitHub, issues, chat, logs, screenshots, or browser code.
For this Pending release, keep both Care enable flags unset or not equal to
`true`, and keep the database capability state `disabled`.

## Validation at frozen-head preparation

- Focused Care/shared/client tests: 6 files, 20 tests passed.
- Repository-wide `npm test`: 138 files, 3,097 tests passed.
- `npm run check`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Disposable Postgres migration dry-run: applied twice with
  `ON_ERROR_STOP=1`; one canonical `care:disabled` row remained, all three
  expected tables existed, and all three reported RLS plus forced RLS.
- Locked-file isolation: final base-to-head diff contains no
  `client/src/App.tsx` or `server/index.ts` edit.
- Production migration: not applied by Website 5; Website 2 owns coordinated
  production migration and release.
- Live/mobile/accessibility smoke: pending Website 2 integration and Render
  deployment because the route and server wiring are intentionally excluded
  from this PR.

## Production verification

After Website 2 deploys:

1. Confirm the Render deployment is Live and deployed SHA matches merged main.
2. Confirm `/api/health`.
3. Open `/care` at desktop and 320px mobile widths.
4. Confirm the shell truthfully says Care is being prepared.
5. Confirm it contains no clinical submission action and no fabricated partner,
   state, clinician, pharmacy, prescription, instruction, supply, price,
   availability, or launch claim.
6. Confirm `GET /api/care/status` returns rail `care`, state `disabled`, and
   `enabled: false`.
7. Confirm `GET /api/care/audit/access` returns `503 care_disabled` even with a
   valid non-Care account.
8. Confirm response headers include no-store/noindex protections on Care pages.
9. Review Render and Supabase logs for new serious errors without exposing
   payloads or secrets.
10. Record the deployment ID, deployed SHA, migration result, persona, steps,
    actual result, mobile/accessibility result, authorization result, and logs
    result in the shared Command Center.

## Clinical activation gates

This PR is not clinical activation approval. Do not set the database capability
to `enabled` or set both deployment approvals until every later Care release
gate is complete, including real medical-group, clinician, state coverage,
pharmacy, patient-specific instruction, support, privacy, security, and
production QA records.

PRODUCTION STATUS: NOT YET MERGED
