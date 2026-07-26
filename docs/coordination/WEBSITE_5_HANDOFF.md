# Website 5 — Care PR 1 production handoff

## Release unit

- Session: WEBSITE 5 — XENIOS CARE FOUNDATION
- Feature domain: Care rail separation, Care roles and authorization, and a
  truthful public Pending shell
- Base branch/SHA: `main` at
  `48cb57250c1ec54fe8714e59fa1071a9eb27f867`
- Feature branch: `feature/website-5-care-foundation`
- Pull request: `https://github.com/teamxenios/xenios-website/pull/46`
- Current frozen SHA: recorded in PR #46 and issue #44 after this committed
  handoff is pushed.
- Full seven-PR staging snapshot:
  `feature/website-5-care-sequence-staging` at
  `1a8dbf8172df37ab7a5941fd340305c00d962c81`

PR #46 is intentionally PR 1 only. The former broad head `1a8dbf8` and
superseded review head `a002fed` are not mergeable. Later intake, clinician,
pharmacy, instruction, supply, labs, messaging, and adverse-event work remains
preserved only on the staging branch for focused follow-on PRs.

The complete requirement-by-requirement reconciliation, exact planned branches,
files, owners, acceptance tests, release outcomes, and PR 2–7 sequence are in
`docs/coordination/WEBSITE_5_REMAINING_SCOPE.md`. The broad staging branch is
source material only and must never be merged as a unit.

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
- A polished responsive `/care` Pending shell using the existing Xenios
  `PageShell`, global header/footer, typography, tokens, buttons, cards, rules,
  and responsive utilities, with no form, clinical action, provider claim,
  availability claim, price, product, or launch date.
- Explicit fail-closed status loading and retryable error states, plus
  decorative card numbering using the accessible existing purple token.
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

### Shared mobile header correction

Required 375px evidence exposed a pre-existing global header overflow on current
`main`: the later `.btn` rule overrides Navbar's `hidden` utility, so the
desktop `Request Early Access` action remains visible below `sm` and extends the
document from 360px to 435px. PR #46 does not edit the shared Navbar.

Website 2 should change this existing class in `client/src/components/Navbar.tsx`:

```tsx
// Current
className="btn btn-primary hidden sm:inline-flex"

// Corrected
className="btn btn-primary !hidden sm:!inline-flex"
```

With that shared correction present, browser verification measured equal
`scrollWidth` and `clientWidth` at 320px, 375px, and 430px.

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
provides no authenticated write policy. Active role grants use a partial unique
index, so grant → revoke → re-grant creates a new lifecycle row while two
simultaneous active grants fail. It creates no clinical or Research record.

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

- Focused Care/shared/client tests: 6 files, 24 tests passed.
- Repository-wide `npm test`: 141 files, 3,121 tests passed.
- `npm run check`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Disposable Postgres migration dry-run: applied twice with
  `ON_ERROR_STOP=1`; one canonical `care:disabled` row remained, all three
  expected tables existed, and all three reported RLS plus forced RLS.
- Disposable role lifecycle proof: grant → revoke → re-grant passed, a second
  simultaneous active grant raised `unique_violation`, and the test transaction
  rolled back to zero role rows.
- Card numbering: decorative with `aria-hidden="true"` and the retained visual
  Xenios purple token measures 5.70:1 against the white card background.
- Locked-file isolation: final base-to-head diff contains no
  `client/src/App.tsx` or `server/index.ts` edit.
- Production migration: not applied by Website 5; Website 2 owns coordinated
  production migration and release.
- Live/mobile/accessibility smoke: pending Website 2 integration and Render
  deployment because the route and server wiring are intentionally excluded
  from this PR.

Current production snapshot on 2026-07-25:

- `GET https://xeniostechnology.com/api/health`: HTTP 200.
- `GET https://xeniostechnology.com/api/care/status`: HTTP 404.
- `GET https://xeniostechnology.com/care`: the generic SPA document is served,
  but the focused Care client route is not registered.

This evidence is why the release remains `NOT YET MERGED`, not `LIVE`.

## UI consistency evidence

The production home page and local global UI system were used as the visual
baseline. The Care shell now uses `PageShell` rather than a duplicate header,
and reuses `container-x`, `display-m`, `display-s`, `body-l`, `body-m`,
`mono-cap`, `mono-label`, `text-pulse`, `text-ink-2`, `text-ink-mute`, `btn`,
`btn-primary`, `btn-secondary`, `btn-ghost`, `card`, and `rule-*`.

Removed from the earlier shell:

- Care-only mint/green palette
- radial gradient
- Georgia typography
- custom 16–18px rounding
- custom shadow
- duplicate Care wordmark/header
- separate Care button, card, status, and spacing systems

Browser evidence captured:

- Production baseline at desktop.
- Care loading at desktop with `aria-busy=true`.
- Care authoritative `disabled` state at desktop.
- Care unavailable/error state with one labeled retry action at desktop.
- Care unavailable/error state at 375px.
- Overflow checks at 320px, 375px, and 430px with the shared Navbar correction
  above; `scrollWidth === clientWidth` at every width.
- Computed Care surface: white background, graphite text, Inter Tight headings,
  JetBrains Mono labels, restrained `--pulse` emphasis, thin borders, no
  gradient, and no shell shadow.

There is no populated or empty clinical-data state in PR 1 because this release
creates no clinical records or workflow. The truthful authoritative disabled
state is the approved Pending production surface.

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS

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

## Remaining scope and next exact action

Care PR 1 is the first of seven focused release units. After Website 2 accepts,
merges, migrates, and deploys this unit, Website 5 must:

1. Verify the disabled `/care` shell and `/api/care/status` on production.
2. Record the deployment evidence in issue #44.
3. Branch `feature/website-5-care-eligibility-intake` from the then-current
   `main`.
4. Selectively recover only PR 2 eligibility/intake/consent work from
   `feature/website-5-care-sequence-staging`.
5. Add its focused repository, route, migration, authorization, RLS, state,
   mobile, accessibility, and no-fabrication proof.

The exact PR 2–7 implementation plan and all external activation blockers are
maintained in `docs/coordination/WEBSITE_5_REMAINING_SCOPE.md`.

PRODUCTION STATUS: NOT YET MERGED
