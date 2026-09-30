# Claude independent review: Codex successor slice `93b0183` (HL-01 public entry)

## Identity

- **Subject:** `93b018304ce7f63cd02e8abc64da3523115fd2bd`, tree `6fa160f3da6dda522c296dc78e0719cddf2a2204`, branch
  `codex/xenios-health-launch-implementation-20260930`.
- **Records-only tip:** `8c163a2ee7a4cd2f03ea8cc864d2f1f5fe9a4b37`, tree `9afdf865f3ddd7256fd96bb43a8effc7ba8aae64`,
  adding the handoff and slice doc.
- **Base:** `8e0271e9`, verified as an ancestor.
- **Runtime paths changed:** only `client/src/clarity/pages.tsx` and `client/src/clarity/pages.test.tsx`.
  `package.json` and `package-lock.json` are unchanged.
- **Reviewed:** 2026-09-30 11:53-12:00 CT by `claude-health-launch-review-20260930`.
- **Environment:** checks worktree `C:/xenios-wt/closeout-review`, detached at `93b0183`, private Node v20.19.0.
  npm scripts ran through the global npm 11.11.0 on Node 20, because the bundled 10.8.2 fails silently on this host
  (R-21).

## Checks run by Claude

| Check | Result |
| --- | --- |
| Focused tests: `pages.test.tsx`, `App.routes.test.ts`, `PageShell.test.tsx`, `StatusPage.test.tsx` | 4 files, 47 passed |
| Mutation check: the slice's new test run against the *old* `pages.tsx` from `8e0271e` | **Fails** as it should (1 failed, 5 passed). Restored clean afterwards. |
| `tsc` | exit 0 |
| `npm run build` with the source and build no-em-dash gates | Pass. Source: 1,332 files, 0 forbidden forms. Build: 224 files, 0 forbidden forms. The new copy is present in the bundle. |
| Browser, the real bundle at `93b0183` served by `scripts/preview-early-access.ts` (public pages are faithful), `/products` at desktop | The hero primary action is "Browse Research Catalog" → `/research/early-access`. The research tile → `/research/early-access`. **0 self-links in `<main>`.** Truthful "A request is not a paid order" copy. No em dash. |
| 320x700 viewport (proxy, **not zoom**) | `scrollWidth` 320 equals `clientWidth` 320. No overflowing controls. No button-style link under 44 px. The primary action is above the fold (top 405 of 700). |
| Keyboard | "Skip to content" → Enter → the first Tab lands on "Browse Research Catalog". It is `:focus-visible`, fully below the 69 px header. |
| True 200%/400% zoom | NOT RUN (tool limit) |

## Disposition

- **The slice itself: PASS** for the code it changes. No P0, P1 or P2 in the diff.
- **HL-01 as a whole:** see "HL-01 residual" below. It is not closed by this slice alone.

## HL-01 residual (independent workflow)

**Method:** two read-only lenses (consumer regressions, HL-01 completeness), each adversarially verified. The key
items were re-checked by Claude.

**Disposition: HL-01 PARTIAL at `93b0183`.** The `/products` loop is closed in source. Reaching the catalog still
depends on the unverified production state, and the landing states are not newcomer-safe.

| Id | Severity | Finding | Evidence | Verdict |
| --- | --- | --- | --- | --- |
| HL-23 | **P2** | The open-access session limiter counts every anonymous session mint as a failure and never decays the count. Each client IP gets 30 new-browser sessions, then a 30-minute lockout, repeating (production-shape fixture values). Customers on shared carrier, office or campus IPs will be locked out periodically, and routing the public front door to this page multiplies mints. | `private-access-routes.ts:647-656` (`recordFailure` on every open-access mint); `:272-278,301-314` (sweep clears only expired locks; counter resets only when a lock trips); `register.ts:386-389` (key = `request.ip`); `server/index.ts:218` (`trust proxy` 2); `production-env-shape.fixture.json:22-23` (30/30). **Re-verified by Claude.** | CONFIRMED |
| HL-24 | **P2**, P1 if production open access is off | The new public CTAs lead to `/research/early-access`. With open access off, or on a transient session error (a proxy 5xx or a fetch exception), a newcomer gets "Invitation only / Enter the access password you were given" or invitee-addressed copy, with no request-access, support or back link in the page body. The route's own metadata says "A private ordering experience for approved Xenios Research members." and is `noindex`. | `EarlyAccessRoute.tsx:179-182,226-252,414-419,428-457` (skeptic-verified) | CONFIRMED |
| HL-25 | **P2** | "All products" appears only when the bridge is enabled **and** the cart-capability probe answers exactly 404. Any 5xx, network error or non-JSON 200 replaces the whole storefront, including the full catalog, with an error card. | `client/src/research/adapters/earlyAccessCart.ts:56-62`; `client/src/research/early-access/cart/EarlyAccessCartMount.tsx:52,67`. **Re-verified by Claude.** | CONFIRMED |
| HL-17 | P2 (unchanged) | The research-shell "Research" link, rendered on the catalog page itself, goes to `/research/access-hub`, which redirects to `/`. | `PublicEditorialNav.tsx:6`; `App.tsx:258`; `layout.tsx:151,300-306` | CONFIRMED |
| HL-01 residual | P3 | `/products/:slug` still always renders "We couldn't find that product." Its action returns to `/products`. | `App.tsx:196`; `pages.tsx:123-136` | CONFIRMED |
| R-meta | P3 | The client description for `/products` changed, but the raw-HTTP metadata and the evidence contract kept the old "Explore Xenios Care, research-product and practice pathways." The browser evidence contract would reject `/products`. (`/` was already drifted before this slice.) | `pages.tsx:102`; `raw-http-document-policy.ts:198-201`; `scripts/evidence/routes.public.json:62` | CONFIRMED |
| R-label | P3 | The label "Explore Products" now has two destinations on Home. Home hero, Navbar and Footer go to `/products`; the pathway tile goes to `/research/early-access`. `/products` also has two identical primary "Browse Research Catalog" buttons. | `Home.tsx:18,46,62,74,100`; `Navbar.tsx:16,27,147`; `Footer.tsx:5`; `pages.tsx:107,114` | CONFIRMED |
| R-copy | P3 | The catalog shows USD prices, but Home and `/individuals` say "No research-product price appears publicly until ... approved". | `Home.tsx:27`; `pages.tsx:83,409`; `AssistedOrderPage.tsx:198` | CONFIRMED |
| R-lock | P3 (process) | `client/src/pages/Home.tsx` is a hash-locked protected seam, but its rendered tile destination changed through `clarity/pages.tsx`. The protected-change gate did not see a change to protected rendered behaviour. | `CORE_SITE_PROTECTION_MANIFEST.json:687` | CONFIRMED |
| R-test | P3 | The main-scoped self-link assertion passes vacuously if `<main>` does not match (`?.[1] ?? ""`). | `pages.test.tsx:53-54` | CONFIRMED |
| R3 (overflow at 320px) | none | The predicted overflow of "Already have a reference? Check Status" at 320px is refuted, by the skeptic's glyph sum and by Claude's rendered measurement (no overflow, `scrollWidth` 320). | 320x700 render | REFUTED |

**Policy constraint for the fixes.** `docs/research/RESEARCH_HOME_CATALOG_POLICY.md:5-9` bans a catalog entry point
on the `/research` homepage. The `/research` overview therefore should not simply gain a catalog link; the founder
would have to change that policy.

**Smallest corrections:**
- **HL-23:** give the open-access mint limiter a time-decayed window, for example N mints per IP per rolling hour,
  kept separate from the password-guess counter. Add a test that ordinary traffic from one shared IP over a day is
  never locked.
- **HL-24:** give the locked and unavailable states newcomer copy with Contact Support, Check Status and Back to
  Products. Treat a transient session error as a retryable error, not "locked". Align the route metadata with the
  public entry, or keep the public CTA pointed at a public page.
- **HL-25:** treat a failed probe as retryable and fall back to the assisted "All products" rather than hiding it.
- **HL-17:** point the "Research" link to the real ordering entry.
- **Others:** sync the raw metadata and evidence contract, use one destination per label, and reconcile the
  public-price copy with what the catalog shows.

## Coordination issue found (sent to Codex, `eaa61c9`)

- The slice's "Next source work" item 1 says the three variants "remain excluded". That comes from reading this review
  branch at `1a4e863`, before Samuel's 11:32 CT reversal.
- The current founder decisions are in `05_FOUNDER_PRICE_CONFIRMATION_2026-09-30.md` at tip `0f7295e` or later:
  - include all product rows, including GRP-0421, GRP-0423 and GRP-0424;
  - Superpower and Mito Health shown as Coming soon;
  - the book display cents for the 17 rounding rows;
  - Hexarelin 6250 and Oxytocin 10750.
