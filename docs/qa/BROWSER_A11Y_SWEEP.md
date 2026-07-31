# Browser and accessibility regression sweep

Lane H. Verification pass against the live production site.

- Target: https://xeniostechnology.com
- Date: 2026-07-31
- Base commit: `c4085616c1cb88ea054993003647f6346aecea3a`
- Method: in-app browser driving the real production SPA, plus HTTP probes of the
  served shell, headers, sitemap, public JSON APIs, and every JS chunk in the
  deployed bundle. No sign-in was attempted. No form that writes data was
  submitted. No credentials were entered anywhere.

Production is a client-rendered SPA with no server-side rendering, so every path
returns the same 200 HTML shell. "Renders" below therefore means the route was
driven in a real browser and the mounted view was inspected, not that the status
code was 200.

## Summary

The site is in good shape. Route coverage is complete, there are no dead internal
links, no console errors on any public route, the responsive system holds at every
breakpoint but one, and the truthfulness sweep is clean: no `$0`, no fabricated
inventory or COA claim, no clinician name, and no supplier cost or margin field
anywhere in a public payload or in the shipped client bundle.

Five defects are recorded. Four of them sit in files this lane is not permitted to
touch and are reported with an exact location and a recommended fix. One sits
inside `client/src/care/**` and is fixed in this candidate.

| ID | Severity | Finding | Owner |
| --- | --- | --- | --- |
| P1-1 | P1 | Hero and CTA "ghost" links render at 2.05:1 on six pages because the class `btn-ghost-on-dark` does not exist | PR #182 lane, not fixed here |
| P1-2 | P1 | The skip link does not move keyboard focus, so it does not bypass the header | protected `components/`, not fixed here |
| P2-1 | P2 | Research section keeps a stale `document.title` after client-side navigation | protected `research/layout.tsx` and `research/section.tsx`, not fixed here |
| P2-2 | P2 | `/book` scrolls horizontally at a 320px viewport | protected `pages/Book.tsx`, not fixed here |
| P2-3 | P2 | Research `meta robots` drifts from `noindex` to `index,follow` on client-side navigation | protected `research/section.tsx`, not fixed here. Mitigated in production by the `x-robots-tag` header |
| FIXED | P2 | Care eligibility state-code validation was not programmatically tied to its input | fixed in this candidate |

## 1. Public route matrix

All routes were driven in a real browser at 1280x900 unless noted. Console errors
were captured per route. Every route below rendered real content; none returned an
empty SPA shell.

### Core marketing

| Route | Renders | H1 | Console errors |
| --- | --- | --- | --- |
| `/` | yes | The AI workspace for serious coaches. | none |
| `/product` | yes | One operating system for the coach's day. | none |
| `/how-it-works` | yes | Five steps. One operating system. Your voice on every surface. | none |
| `/for-coaches` | yes | Scale the relationship, not the admin. | none |
| `/for-clients` | yes | A pocket coach that knows you. | none |
| `/storefront` | yes | The commerce rail your practice deserves. | none |
| `/network` | yes | Coordination, not capture. | none |
| `/ecosystem` | yes | Connected to the proactive health stack. | none |
| `/for-practitioners` | yes | Built for the people doing the work upstream of disease. | none |
| `/for/:slug` (25 slugs) | yes | per category | none |
| `/manifesto` | yes | Infrastructure as serious as the work. | none |
| `/about` | yes | The operating layer for proactive health relationships. | none |
| `/careers` | yes | Build the operating system behind proactive health. | none |
| `/careers/:slug` (3 roles) | yes | per role | none |
| `/waitlist` | yes | Apply for the founding group. | none |
| `/contact` | yes | Talk to us. | none |
| `/security` | yes | Trust is a product requirement. | none |
| `/compliance` | yes | Honest posture. Clear boundaries. | none |
| `/investors` | yes | The operating layer for proactive health. | none |
| `/press` | yes | Press, media, podcast, and creator inquiries. | none |
| `/privacy` | yes | We send the email you would want to receive. Nothing else. | none |
| `/terms` | yes | Terms of service. | none |
| `/disclosures` | yes | The things we want you to know, in plain language. | none |
| `/early-interest` | yes | Early interest | none |
| `/book` | yes | Book a call | none |
| `/concepts` | yes | Early concepts | none |
| `/mvps` | yes | xenios MVP Lab. | none |
| unmatched path | yes | That page is not here. (404 view) | none |

### Research, public access family

The whole `/research` tree is currently behind the "This area is under review"
gate in production, so the pages below are the reachable public set.

| Route | Renders | H1 | Console errors |
| --- | --- | --- | --- |
| `/research` | yes | Xenios Research | none |
| `/research/apply` | yes | Applications are being prepared. | none |
| `/research/apply/status` | yes | Status unavailable | none |
| `/research/sign-in` | yes | Sign in. | none |
| `/research/privacy` | yes | Privacy Policy | none |
| `/research/terms` | yes | Terms of Service | none |
| `/research/support` | yes | How to reach us | none |
| `/research/policies/:policy` | yes | per policy | none |
| `/research/partners` | gated | This area is under review. | none |
| `/research/member` | gated | This area is under review. | none |

`/research` correctly presents only Apply and Member Login. There is no catalog
call to action anywhere on the gateway.

### Care

Every Care API fails closed in production (`/api/care/status` reports
`state: disabled`, and the eligibility, appointments, prescriptions, and pharmacy
endpoints all return `503 care_disabled`). Every Care surface renders the honest
disabled state, and **no clinical action control is rendered at all**: the sweep
found zero buttons and zero inputs inside `main` on all five Care routes.

| Route | Renders | H1 | Status shown | Action controls |
| --- | --- | --- | --- | --- |
| `/care` | yes | Care is being prepared with the right boundaries in place. | Care is being prepared. | none |
| `/care/eligibility` | yes | Care availability begins with your current location. | Care is not yet available. | none |
| `/care/consent` | yes | Consent must be exact, current, and informed. | Care consent content has not been activated. | none |
| `/care/appointments` | yes | Scheduling stays connected to verified Care coverage. | Clinician-guided scheduling is being prepared. | none |
| `/care/prescriptions` | yes | Your clinician remains the source of every prescription. | (disabled state) | none |
| `/care/pharmacy` | yes | Pharmacy operations remain unavailable. | Pharmacy operations are disabled. | none |

### Link integrity

Every internal link on every public page was harvested (56 unique paths) and then
driven. **Zero dead links.** 47 in-app routes were checked for the 404 view and
none matched; `/llms.txt`, `/sitemap.xml`, `/site.webmanifest`, `/favicon.png`, and
the OG image all return 200 with the correct content type.

The sitemap lists 53 URLs and correctly contains no `/research`, `/care`, or
`/admin` path. `/research/*` is additionally protected by a real
`x-robots-tag: noindex, nofollow` response header.

### Responsive

Horizontal overflow was measured as `max(scrollWidth) - clientWidth` on every
route at each breakpoint, with the specific bleeding element captured when found.

| Breakpoint | Result |
| --- | --- |
| 320 | one failure, `/book` (see P2-2). All other routes clean |
| 375 | clean across all 34 routes tested |
| 768 | clean |
| 1024 | clean |
| 1440 | clean |

## 2. Findings

### P1-1. Six "ghost" CTAs render at 2.05:1 because their CSS class does not exist

**Severity: P1.** WCAG 2.2 SC 1.4.3 Contrast (Minimum), Level AA. Fails at less
than half the required ratio.

**Owner: the PR #182 lane. Verified as still live in production, deliberately not
fixed here.**

Six calls to action use the class `btn-ghost-on-dark`. That class is **not defined
anywhere in `client/src/index.css`**. The design system defines the on-dark ghost
variant as two composed classes, `btn-ghost btn-on-dark` (`client/src/index.css:339`),
not one hyphenated class. Because the selector never matches, no colour is applied
and the anchor falls back to the user agent default unvisited link colour
`rgb(0, 0, 238)` on the near-black `#0e0e0e` band.

Measured in production, all six identical:

| Route | CTA text | Colour | Background | Ratio | Required |
| --- | --- | --- | --- | --- | --- |
| `/` | See How It Works | `rgb(0,0,238)` | `rgb(14,14,14)` | **2.05:1** | 4.5:1 |
| `/about` | View Careers | `rgb(0,0,238)` | `rgb(14,14,14)` | **2.05:1** | 4.5:1 |
| `/about` | Request Early Access | `rgb(0,0,238)` | `rgb(14,14,14)` | **2.05:1** | 4.5:1 |
| `/product` | Join the Founding Cohort | `rgb(0,0,238)` | `rgb(14,14,14)` | **2.05:1** | 4.5:1 |
| `/for-coaches` | Founding Coach Cohort | `rgb(0,0,238)` | `rgb(14,14,14)` | **2.05:1** | 4.5:1 |
| `/for/:slug` | All categories | `rgb(0,0,238)` | `rgb(14,14,14)` | **2.05:1** | 4.5:1 |

Source locations:

- `client/src/pages/Home.tsx:170`
- `client/src/pages/About.tsx:100`
- `client/src/pages/About.tsx:101`
- `client/src/pages/Product.tsx:152`
- `client/src/pages/ForCoaches.tsx:127`
- `client/src/pages/IcpPage.tsx:55`

Reproduction:

1. Open https://xeniostechnology.com/ in a browser.
2. Scroll to the dark early-access band at the foot of the page.
3. "See How It Works" renders in default link blue on near-black.
4. In the console: `getComputedStyle(document.querySelector('.btn-ghost-on-dark')).color` returns `rgb(0, 0, 238)`.

Recommended fix (one line each, in the PR #182 lane): change
`className="btn btn-ghost-on-dark"` to `className="btn btn-ghost btn-on-dark"` at
the six locations above. That resolves to `color: var(--paper)` on the dark band,
which measures 19.3:1. Worth adding a guard test that asserts no rendered element
carries a class with no matching CSS rule, since this failure mode is silent.

### P1-2. The skip link does not move focus, so it does not bypass the header

**Severity: P1.** WCAG 2.2 SC 2.4.1 Bypass Blocks, Level A.

**Owner: protected `client/src/components/`. Not fixed here.**

`PageShell` renders a correct, visually-hidden-until-focused skip link pointing at
`#site-main`, and `<main id="site-main">` exists. But `<main>` carries no
`tabindex="-1"`, so activating the link scrolls the page and sets the hash without
moving keyboard focus. Chrome resets focus to `BODY`. The next Tab press therefore
walks back into the ribbon and the primary nav, which is exactly what the skip link
exists to avoid. A keyboard user must still tab through roughly 30 header controls
on every page.

Source: `client/src/components/PageShell.tsx:15` (the link) and
`client/src/components/PageShell.tsx:20` (the target).

Reproduction, in the production console on any page:

```js
const s = document.querySelector('.skip-link');
s.focus(); s.click();
document.activeElement.tagName;            // "BODY", expected "MAIN"
document.querySelector('main').hasAttribute('tabindex'); // false
```

Recommended fix: add `tabIndex={-1}` to the `<main id="site-main">` element in
`PageShell.tsx`. No CSS change is needed; the existing
`.skip-link:focus-visible` outline is already correct, and `main:focus` will not
show a ring because `-1` focus is programmatic.

### P2-1. The research section keeps a stale document title after client-side navigation

**Severity: P2.** WCAG 2.2 SC 2.4.2 Page Titled, Level A.

**Owner: protected `client/src/research/layout.tsx` and
`client/src/research/section.tsx`. Not fixed here.**

The research gate view and the research not-found view render no `SeoHead`, so
they inherit whatever `document.title` the previously visited research page set.
Screen reader users, browser tab labels, bookmarks, and history entries all get the
wrong page name.

Reproduction:

1. Load https://xeniostechnology.com/research/support. Title is
   "Support, xenios research". Correct.
2. Navigate in-app to `/research/member`. The gate view renders
   "This area is under review." The title is still **"Support, xenios research"**.
3. Navigate in-app to `/research/definitely-not-a-page`. Same gate view, title is
   still **"Support, xenios research"**.

The same happens from any starting page, for example after `/research/policies/shipping`
the title stays "Shipping Policy, xenios research" on both views.

Sources:

- gate view: `client/src/research/layout.tsx:91`, no `SeoHead`
- not-found view: `client/src/research/section.tsx:120` (`ResearchNotFound`), no `SeoHead`

Recommended fix: render a `SeoHead` in each of those two views with its own title
(for example "Under review, xenios research" and "Not found, xenios research") and
`robots="noindex, nofollow"`. Both files are pinned to other lanes, so this needs
to be picked up by whoever owns them.

### P2-2. `/book` scrolls horizontally at a 320px viewport

**Severity: P2.** WCAG 2.2 SC 1.4.10 Reflow, Level AA.

**Owner: protected `client/src/pages/Book.tsx`. Not fixed here.**

At a 320px viewport the document is 336px wide, producing 16px of horizontal
scroll on the whole page. The cause is our own inline style, not Calendly's script:
the embed container hardcodes `minWidth: "320px"` while sitting inside
`.container-x`, which applies 16px of padding on each side. The available content
box is 288px, so the 320px minimum overflows by exactly 32px minus the 16px the
body already absorbs.

Source: `client/src/pages/Book.tsx:69`

```
style={{ minWidth: "320px", minHeight: 700 }}
```

Measured in production at 320x720:

```
clientWidth 320, scrollWidth 336, overflow 16
.calendly-inline-widget  x:16  width:320  right:336
parent .container-x      x:0   width:320  paddingLeft:16px paddingRight:16px
```

Clean at 375 and above, so this only affects the smallest supported phones.

Recommended fix: drop the hardcoded `minWidth` and let the widget be fluid, or set
`minWidth: 0` with `width: "100%"`. The "LIVE on the waitlist" ribbon text also
extends past the viewport but its parent is `.truncate` with `overflow: hidden`, so
it is correctly clipped and is not a defect.

### P2-3. Research `meta robots` drifts from noindex to index on client-side navigation

**Severity: P2**, defence in depth only. Not currently exploitable.

**Owner: protected `client/src/research/section.tsx`. Not fixed here.**

`ResearchSection` sets `meta[name=robots]` to `noindex, nofollow` in a mount effect
with an empty dependency array (`client/src/research/section.tsx:144`). Every
research page also renders `SeoHead`, and **no research page passes the `robots`
prop**, so each one writes the site default
`index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1`.

On first load the child effect runs before the parent effect, so the section wins
and the tag is correct. On client-side navigation within `/research/*` only the
child re-runs, so the page overwrites the section and the tag flips to indexable
and never flips back.

Reproduction:

1. Hard load https://xeniostechnology.com/research. `meta robots` is `noindex, nofollow`. Correct.
2. Navigate in-app to `/research/apply`. `meta robots` is now `index,follow,...`.
3. Navigate in-app to `/research/sign-in`. Still `index,follow,...`.

**This is not currently a live exposure.** Production sends a real
`x-robots-tag: noindex, nofollow` header on every `/research` path, which is
authoritative, and the sitemap excludes the whole tree. The meta tag is the
belt-and-braces layer and it is the layer that has drifted.

Recommended fix: make the section effect re-apply on location change, or have it
observe the tag, or pass `robots="noindex, nofollow"` from every research
`SeoHead`. The first is the smallest change but lives in a pinned file.

## 3. Accessibility, what is working

Recorded because these were checked and are correct, and should not regress.

- **Landmarks.** Every core-site page exposes `header`, `nav[aria-label="Primary"]`,
  `main#site-main`, `footer`, and four labelled footer navs. No unlabelled duplicate
  landmarks.
- **Headings.** No skipped heading levels on any page checked. Exactly one `h1` per
  page, verified on all core-site, Care, and public research routes.
- **`lang`.** `<html lang="en">` is present.
- **Form labelling.** Zero unlabelled interactive controls found on any public
  route. The research sign-in form uses real `<label for>` pairs plus
  `autocomplete="email"` and `autocomplete="current-password"`. The Care
  eligibility form uses `<label for>` plus `autocomplete="address-level1"` and
  `aria-describedby`.
- **Images.** Zero `<img>` without an `alt` attribute on any public route.
- **ARIA reference integrity.** All `aria-labelledby` and `aria-describedby`
  targets resolve, on both the Care and research surfaces.
- **Mobile menu.** Genuinely well built. `aria-expanded` toggles correctly, the
  overlay is `role="dialog"` with `aria-modal="true"`, focus moves into the dialog
  on open, `body` overflow is locked, Escape closes it, and focus returns to the
  triggering button.
- **Colour contrast.** A full computed-style scan of every text node against its
  resolved background found exactly one failure site-wide, P1-1 above. All other
  text, including `--ink-mute` at `#6b6b6b` and `--pulse` at `#7c3aed` (5.70:1 on
  white), passes AA.
- **Console.** Zero console errors across every public route.

Two minor nits not worth a finding: the Menu button's `aria-controls` points at
`nav-mobile-overlay`, which does not exist while the menu is closed (harmless in
practice, but the referenced element should exist for strict ARIA validity); and
the lazy-route Suspense fallback is an empty `div` with `aria-busy="true"` and no
accessible text, so a screen reader announces nothing during chunk load.

## 4. Truthfulness sweep

Method: downloaded the production entry bundle and transitively fetched **all 117
JS chunks** (2.2 MB total), then grepped the whole set. Separately scanned the
rendered text of every public route.

| Check | Result |
| --- | --- |
| Roster surnames `Nahm`, `Baluch`, `Fatuyi`, `Khaleghi` | **zero occurrences** in any of the 117 chunks |
| Any clinician name pattern (`Dr. X`) in rendered public text | **none** |
| `$0` price | **none.** The only `$0` byte sequences in the bundle are the minified Radix Toast variable `$0="toast.swipeStart"`, not a price |
| Supplier cost or margin fields (`supplierCost`, `cost_basis`, `unitCost`, `marginPct`, `grossMargin`, `multiplier`, `wholesaleCost`, `landedCost`, `markup`) | **zero occurrences** in any chunk |
| COA, purity, endotoxin, sterility strings | present only in `LotCoasAdmin-*.js`, which is reachable only from `adminx-section-*.js` (`/admin/research`). Not in any public chunk, and not rendered on any public route |
| Inventory quantities (`in_stock`, `quantityAvailable`) | present only in `ProductAdminDetail-*.js` and `InventoryLotsAdmin-*.js`, both admin-only chunks. Not on any public route |
| Public API payloads | `/api/waitlist/count` returns a real count (`{"count":556}`), matching the "LIVE 556" badge. Not a fabricated number. All `/api/care/*` endpoints fail closed with `care_disabled` |

One item flagged for the owner rather than as a defect: `/press` and `/` state
"$710M+ in prior exits" and related founder-history claims. That is a business
claim outside this sweep's scope and this lane has neither confirmed nor
disconfirmed it. Noting it only so the owner can confirm it is substantiated.

## 5. Fixed in this candidate

**Care eligibility state-code validation was not tied to its input.** WCAG 2.2 SC
3.3.1 Error Identification, Level A.

`client/src/care/EligibilityPendingPage.tsx`

When a user submitted a state code that was not two letters, the message "Enter the
two-letter code for your current state." was written into `actionError`, which
renders in a `role="alert"` card **outside and below the entire status section**.
The input itself was never marked `aria-invalid`, and its `aria-describedby` kept
pointing only at the standing help text. A screen reader user who tabbed back to
the field heard no indication it was in error, and a sighted keyboard user got
feedback far from the control that caused it.

The fix separates field validation from request failure:

- a dedicated `fieldError` state holds the two-letter validation message
- the message renders immediately under the input, inside the form, with
  `id="care-state-error"` and `role="alert"`
- the input gets `aria-invalid="true"` and
  `aria-describedby="care-state-error care-state-help"`, error first, so the
  problem is read before the instruction
- editing the field clears both the message and the invalid state
- `actionError` is untouched and still carries request failures ("We could not
  save your location. Nothing was submitted. Try again.") as a separate
  action-level announcement

This changes no Care flag, no network behaviour, and no truthfulness claim. The
form is not reachable in production today because Care is disabled server-side; the
fix matters for when it is enabled.

Covered by `client/src/care/eligibility-field-error.test.tsx`, four tests:
the invalid input is marked and described; an invalid code is never submitted to
the network; editing clears the error and the invalid state; and a request failure
stays a separate action-level alert without marking the field invalid. Reverting
the source change fails two of the four, so it is a real regression guard.

## 6. Not covered

- Authenticated surfaces. The research member area, the partner portal, and both
  admin trees are gated in production. This lane did not sign in, did not create an
  account, and did not attempt to bypass the gate, so those surfaces were not swept
  in the browser. Static review shows 84 member, partner, and admin page components
  render no `SeoHead`, which means the stale-title behaviour in P2-1 very likely
  extends across those areas too. Worth a follow-up sweep by a lane that has a test
  account.
- Native 200 percent browser zoom reflow. Measured via viewport width only.
- Real assistive technology. All checks here are computed-style and DOM based, not
  a NVDA or VoiceOver pass.
- Any form submission, since no route may write data during this sweep.
