# Core site protection

Samuel's directive: **the main xenios website outside `/research` and `/care` must not
be redesigned, rewritten, or behaviorally modified.** Phase 2 adds a lot of Research
and Care surface area, and the risk is not a deliberate rewrite. It is drift: a shared
component "improved" in passing, a global CSS variable redefined, a nav item reordered,
a dependency bump that changes a font metric.

This document is how that invariant is enforced and what to do when the gate stops you.

## The three artifacts

| File | What it is |
| --- | --- |
| `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` | The authoritative record: protected routes, protected paths, allowed write zones, permitted seam files, and baseline content hashes. |
| `scripts/acceptance/verify-core-site-protection.mjs` | The executable gate. |
| `scripts/acceptance/capture-core-site-baseline.mjs` | Re-runnable live capture of the functional baseline. |
| `server/core-site-protection.test.ts` | Tests over the gate, plus anti-rot tests that fail if the manifest stops matching the real routes. |

The anti-rot tests are not decoration. They caught two real defects while this was being
written: a missing ICP slug in the manifest, and the fact that `"/careers"` starts with
the literal `"/care"`, which silently pulled the careers pages into the Care surface.

Supporting evidence lives in `docs/phase2/core-site-baseline/`:
`functional-baseline.json` (captured live) and `VISUAL_BASELINE_PLAN.md` (specified,
not captured — see that file for the blocker).

## Running the gate

```
node scripts/acceptance/verify-core-site-protection.mjs
```

Defaults to `origin/main..HEAD`. It resolves the merge base first, so a stale local
`origin/main` will not report unrelated files. Explicit refs:

```
node scripts/acceptance/verify-core-site-protection.mjs origin/main HEAD
node scripts/acceptance/verify-core-site-protection.mjs <base-sha> <head-sha>
```

Exit codes: `0` pass, `1` violation, `2` the gate could not run (missing or malformed
manifest, unresolvable git ref). A `2` is never a pass.

Run the tests too:

```
npx vitest run server/core-site-protection.test.ts
```

Both belong in every Research and Care candidate's evidence, before review.

## What the gate checks

**1. The changed-file set.** Every path changed between the base and the head is
classified as one of:

| Class | Result | What it covers |
| --- | --- | --- |
| `seam` | pass, **reported** | One of the five permitted seam files. Needs a lease. |
| `test` | pass, **reported** | Any `*.test.ts(x)` file, anywhere. |
| `allowed` | pass, silent | Inside a Research or Care write zone. |
| `infrastructure` | pass, silent | `docs/**` and `scripts/**`. |
| `violation` | **FAIL** | Everything else. |

Order matters. Seam is checked first, so a seam file that also sits under an allowed
prefix is still reported. Tests are checked second, so a test inside the Research zone
is still reported.

**2. The protected file hashes.** Twenty-one curated high-risk files (the HTML shell,
the global stylesheet, the shared layout and nav components, the two slug sources the
sitemap is pinned to, the public SEO files, the main server route table, the build
config) are re-hashed at HEAD. Any mismatch or deletion is an unconditional fail, even
if every changed path was allowed. This is what catches a change that arrived some way
other than a normal diff.

The hash is sha256 over the file content with CRLF normalized to LF, so it is the same
number on a Windows checkout (this repo sets `core.autocrlf`) and in the stored blob.

Seam files are hashed separately into `seamBaselineHashes` and a mismatch there is
**reported, not failed** — a leased seam edit is legitimate, and the changed-file check
has already flagged it.

## When the gate fails

**Do not widen the manifest to make it pass.** That is the one move that defeats the
whole mechanism. In order of likelihood:

1. **You edited a shared component instead of a Research or Care one.** The usual case.
   `client/src/components/**` is the main site's shared layer. Copy what you need into
   `client/src/research/` or `client/src/care/`, or add your component there and import
   the shared one read-only. Duplication is cheaper than a core-site regression.

2. **You edited a global style.** `client/src/index.css` is shared by every page. Scope
   the style inside the Research or Care subtree instead. Watch for the subtle version
   of this: a Tailwind theme token or a CSS custom property redefined inside an allowed
   file still cascades onto the main site. The path gate cannot see that; the visual
   baseline is what would, and it is not captured yet, so review it by hand.

3. **You genuinely need a seam.** Follow the lease procedure below.

4. **A hash mismatch you did not expect.** Someone changed a protected file. Find out
   who and why before doing anything else: `git log -p <base>..HEAD -- <path>`. If the
   change is legitimate and approved, the manifest baseline is re-cut deliberately, by
   the protection owner, in its own commit, with the approval referenced. Never as a
   line inside a feature branch.

5. **The manifest is genuinely out of date** because a protected route was legitimately
   added or removed under an approved change. `server/core-site-protection.test.ts` will
   also be failing. Same rule: re-cut the manifest in its own commit, referencing the
   approval.

## The seam lease procedure

Five files, and only five, may be touched by a Research or Care candidate:

| File | Permitted edit |
| --- | --- |
| `client/src/App.tsx` | Register or remove a `<Route>` for a `/research` or `/care` path, plus its lazy import and Suspense wrapper, following the existing `ResearchRoutes` / `CareRoutes` pattern. |
| `server/index.ts` | Import and call a `register*Api` / `*PageGate` for a Research or Care module, inside the existing registration block. |
| `server/research/index.ts` | Anything (it is inside the Research surface). |
| `server/care/index.ts` | Anything (it is inside the Care surface). |
| `shared/research/flags.ts` | Add a flag whose default is `false`. |

Explicitly forbidden in the two cross-cutting seams: changing any protected route, its
component, or its order relative to protected routes; the `ScrollToTop` behavior or the
provider tree in `App()`; middleware order, helmet or CSP configuration, session setup,
static serving, or error handling in `server/index.ts`; flipping an existing flag's
default to `true`.

To take a seam:

1. **Claim an exclusive lease** on the file, in the lane coordination channel, before
   editing. Two candidates editing `App.tsx` concurrently is the single most likely way
   a protected route gets clobbered by a bad merge. One holder at a time.
2. **Write the minimum diff.** A registration line. Not a reformat, not an import
   reorder, not a "while I was in here". The diff should be readable in one screen.
3. **Add a focused regression test** proving no unrelated behavior moved. For
   `App.tsx`, assert the protected routes still resolve to the same components (the
   idiom in `client/src/App.routes.test.ts` — read the router source directly). For
   `server/index.ts`, assert the middleware order and the untouched registrations.
4. **Release the lease** as soon as the change is committed.
5. **QA confirms** the diff contains no unrelated change, and records the confirmation
   in the pull request. The gate reporting the seam is what makes this step unmissable.

## Deliberate decisions

Three calls were made here that a reviewer should be able to challenge.

**1. `docs/**` and `scripts/**` pass silently.** Nothing under either is imported by the
client bundle, mounted by the Express app, or served to a visitor, so a change there
cannot redesign or behaviorally modify the website. Without this, the protection system
could not be added to the repo without the gate rejecting itself.

Note the singular/plural trap: **`scripts/` (plural) is tooling and is allowed;
`script/` (singular) is the production build** (`script/build.mjs`, referenced by
`package.json`'s `build` and `render-build`) **and stays protected.** There is a test
asserting exactly that pair.

**2. Test files pass, but are always reported, wherever they live.** They pass because a
test is never bundled or served. Refusing them would fire on ordinary Research work
(`origin/main`'s own persistent-cart change touches
`server/release-control-plane.test.ts`) and would push people toward widening this
manifest, which is the one move that defeats the whole mechanism.

They are reported because the repo rule *do not lower existing safety or regression
gates to make a build pass* is precisely the risk a silent test edit carries. Review
must confirm each touched test was **strengthened, not weakened**. A test inside the
Research zone is reported too, for the same reason.

**3. `server/core-site-protection.test.ts` lives in `server/`.** That is the repo's
existing home for acceptance tests: `server/release-control-plane.test.ts` sets the
precedent, `vitest.config.ts` includes `server/**/*.test.ts`, and `tsconfig.json`
excludes `**/*.test.ts` from `npm run check`. It is admitted by the same general test
rule as every other test, not by a special case naming itself, so the gate grants itself
no privilege it does not grant the rest of the repo.

## Known limits

- **No visual coverage yet.** A regression caused from inside an allowed zone (a global
  CSS token redefined in a Research stylesheet) passes this gate. See
  `docs/phase2/core-site-baseline/VISUAL_BASELINE_PLAN.md`.
- **The functional baseline is shell-level, not per-route.** The site is a
  client-rendered SPA, so every route returns the same `index.html`. The per-route
  signals that ARE real are the status code and the `x-robots-tag` header. Read the
  `interpretation` block in `functional-baseline.json` before citing its title or meta
  fields as per-route evidence.
- **The hash set is curated, not the whole tree.** It is a tripwire for an accidental
  edit to the highest-risk files, not a lockfile over `client/src/**`. The changed-file
  check is what covers the rest.
- **`/kairos` behaves differently in production than in the repo.** The deployed edge
  answers it with `307 -> /login?next=%2Fkairos` before the SPA router sees the
  `ExternalRedirect`. Recorded in `functional-baseline.json` under
  `observedDeploymentNotes`. Not a defect introduced here, but do not "fix" the client
  route on the assumption the redirect is broken.
