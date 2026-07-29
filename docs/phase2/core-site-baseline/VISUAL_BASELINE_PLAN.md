# Visual regression baseline for the protected core site

Status: **SPECIFIED, NOT CAPTURED.**

Task: XCA-W17-CORE-PROTECTION
Manifest baseline: `766f19fce3b67cd9b940ea66fe075281c2d8bdf8`

## Why nothing is captured yet

Screenshot regression needs a headless browser harness. This repository has none:
`package.json` carries `vitest`, `jsdom`, and `supertest`, and no browser driver
(no Playwright, no Puppeteer, no `@vitest/browser`, no `vitest-image-snapshot`).

Adding one is a `package.json` and `package-lock.json` change, and both files are
protected by `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json`. Dependency changes
are leased to another owner, and this task is new-files-only. Installing a harness
here would have been the first violation of the very invariant this task exists to
protect, so it was not done.

**Blocker:** no browser harness in the repo, and adding one is a `package.json`
change that requires a dependency lease. Nothing else is missing. The route list,
the viewports, the thresholds, and the storage layout below are decided; the work
is a single afternoon once the lease exists.

Until then, the checkable coverage is:

- `functional-baseline.json` in this directory: real, live, per-route HTTP evidence.
- `scripts/acceptance/verify-core-site-protection.mjs`: path and content tripwires
  that catch a protected-file edit before it can ever reach a screenshot.

Neither of those catches a purely visual regression caused from inside an allowed
zone (for example a global CSS custom property redefined in a Research stylesheet
that cascades onto the marketing pages). That gap is exactly what this plan closes.

## The tool that fits this stack

**Playwright, driven by `@playwright/test`, run against the production build.**

Reasoning, against the alternatives:

- The app is Vite plus React 19 plus wouter, client-rendered. Every route needs a
  real browser and a hydration wait. `jsdom`, already present, cannot rasterize, so
  it is not an option.
- `@vitest/browser` would reuse the existing vitest config, but its screenshot
  story is thinner and it still pulls a browser provider, so the dependency cost is
  the same while the assertion story is worse.
- Playwright ships its own image comparison (`toHaveScreenshot`) with pixel and
  ratio thresholds, per-project viewports, deterministic animation freezing, and a
  built-in update flow (`--update-snapshots`). No second image-diff dependency.
- Percy, Chromatic, and Applitools are hosted and would put xenios page images on a
  third-party service. The site is pre-launch and carries unreleased positioning, so
  keep the images in the repo.

Install as a devDependency only, and pin the browser download to Chromium:

```
npm i -D @playwright/test
npx playwright install --with-deps chromium
```

## Viewports

Four projects, one per required width. Heights are the standard companions; the
captures are full-page, so height only sets the initial fold.

| Project      | Width | Height | Scale | Why |
| ------------ | ----- | ------ | ----- | --- |
| `mobile-320` | 320   | 640    | 2     | The narrowest layout the site claims to support. Overflow bugs show here first. |
| `mobile-375` | 375   | 812    | 3     | The most common real phone width. |
| `tablet-768` | 768   | 1024   | 2     | The Tailwind `md` boundary, where the nav and grid switch. |
| `desktop-1440` | 1440 | 900   | 1     | The design target for the marketing pages. |

Capture in both `light` and `dark` if the site ships a theme toggle at capture time
(`next-themes` is a dependency; confirm whether any protected page exposes it before
doubling the image count).

## Route list

Exactly the 64 concrete protected paths that
`scripts/acceptance/capture-core-site-baseline.mjs` already expands from the
manifest. Do not hand-maintain a second list: import
`concreteProtectedPaths(manifest)` from that module so the visual suite and the
functional suite can never disagree about what "protected" means.

That is 26 static pages, 24 `/for/:slug` ICP pages, 3 `/careers/:slug` roles,
9 internal redirects, `/kairos`, and `/mvps`.

Notes on specific routes:

- The 9 redirects and `/kairos` should assert the landing URL, not an image. A
  redirect has no appearance of its own.
- `/admin` renders a lazy chunk behind an auth wall. Capture the unauthenticated
  state only. Never authenticate in a visual suite.
- `/for/:slug` pages share one template. Capture all 24 anyway; the whole point is
  that content data feeding a shared template is exactly where silent drift hides.
- Do **not** capture `/research*` or `/care*`. Those surfaces are expected to change
  and would produce constant noise.

## Storage

```
docs/phase2/core-site-baseline/visual/
  <project>/            mobile-320 | mobile-375 | tablet-768 | desktop-1440
    <route-slug>.png    "/" -> root.png, "/for/creators" -> for-creators.png
  MANIFEST.json         route -> file, viewport, sha256, capturedAt, commit sha
```

Commit the PNGs. At 64 routes by 4 viewports the set is roughly 256 images; keep
them lean by capturing at the scale factors above and letting Playwright write
optimized PNGs. If the set later exceeds about 50 MB, move to Git LFS rather than
dropping viewports.

`MANIFEST.json` records the commit the baseline was captured at, so a reviewer can
always tell whether a diff is against a current baseline or a stale one.

## Diff threshold

```ts
expect(page).toHaveScreenshot(`${slug}.png`, {
  fullPage: true,
  animations: "disabled",
  caret: "hide",
  maxDiffPixelRatio: 0.001,   // 0.1 percent of the page may differ
  threshold: 0.2,             // per-pixel YIQ tolerance, Playwright default
});
```

`maxDiffPixelRatio: 0.001` is deliberately tight. A font hinting difference or a
one-pixel antialias shift stays under it; a moved section, a changed colour, or a
altered font size does not. Start here and only loosen with a written reason in the
pull request. Never loosen a threshold to make a build pass, per the repo rules.

Determinism, all required or the suite will flake:

- Run against the production build (`npm run build`, then serve `dist`), never the
  dev server. Dev-only overlays and the Replit dev banner plugin are not in the
  deployed page.
- Freeze animations (`animations: "disabled"`) — `framer-motion` and the `Reveal`
  component animate on scroll.
- Wait for fonts: `await page.evaluate(() => document.fonts.ready)`.
- Pin the timezone and locale in the Playwright config so any date rendering is
  stable.
- Stub or block third-party requests (analytics, Turnstile) so a network hiccup
  cannot change a frame.
- Run in Docker or one CI image. Baselines captured on Windows will not match Linux
  rendering. Capture and compare on the same platform, always.

## Where it plugs into the gate

Add to `package.json` (both lines are part of the same dependency lease):

```
"test:visual":        "playwright test --config playwright.visual.config.ts",
"test:visual:update": "playwright test --config playwright.visual.config.ts --update-snapshots"
```

Then the full core-site protection check for a Research or Care candidate is:

1. `node scripts/acceptance/verify-core-site-protection.mjs` — no protected path or
   protected file content changed.
2. `npx vitest run server/core-site-protection.test.ts` — the manifest still matches
   the real routes.
3. `npm run test:visual` — no protected page moved a pixel.

Step 3 is the one that is not yet runnable. Steps 1 and 2 are.
