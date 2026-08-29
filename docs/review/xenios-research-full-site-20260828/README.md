# Xenios Research full-site release candidate — evidence packet

Captured: 2026-08-29T00:43:39.920Z → 2026-08-29T00:58:27.089Z · candidate code SHA `679564fc8cb29289e2277836eb32e2deac3d8bec` · final branch HEAD `the commit that contains this packet — its SHA is recorded in the RC document identity table, the release graph and CONTROL/HANDOFFS/CLAUDE-FINAL-HANDOFF.md` · reviewer `claude-lead-takeover-20260828`

**What this is.** Real-browser and raw-HTTP evidence over the INTEGRATED production build of the frozen candidate — not a component harness. `node script/build.mjs` output served by `scripts/preview-research.mjs` on `127.0.0.1:5184` with **placeholder** Supabase credentials (host `127.0.0.1:54321`, never reachable): no production system, database, provider, customer, or real account was touched, and every data-dependent surface renders its truthful unavailable/denied state. Browser: chromium 149.0.7827.55 driven over raw CDP (`scripts/evidence/lib/cdp.mjs`, repo `ws` package, no new dependency). Every result is `AUTOMATED_PASS` / `AUTOMATED_PASS_WITH_NOTES` / `AUTOMATED_FAIL`; the tooling never emits a reviewer PASS. The complete artefact set (473 runs, every PNG, rendered text, console and network records) lives outside Git at `CONTROL/EVIDENCE/browser-679564fc8cb29289e2277836eb32e2deac3d8bec/`; this packet carries the JSON evidence and a size-bounded screenshot subset.

## Coverage

- Routes: 43 surfaces (`scripts/evidence/routes.public.json`): public Research documents, policies (incl. the Accessibility Statement draft), Early Access, sign-in, account tabs (denied without a session), member catalog, Care, admin, `/`, `/hino`, and the authoritative-404 probe.
- Widths: 1440 / 1024 / 768 / 430 / 390 / 375 / 360 / 320 CSS px, plus the 200 % zoom equivalent (200pct = 720 CSS px at DPR 2).
- Media variants at 390 px: `prefers-reduced-motion: reduce` and `forced-colors: active` (with its own focus walk).
- Per run: horizontal overflow, clipped text, 44×44 targets, landmarks, duplicate ids, h1, labels, alt, aria references, `html[lang]`, a real Tab-key focus walk (order, trap, `:focus-visible` indicator), console and network cleanliness, full-page PNG + rendered text.
- Raw HTTP per route: status, `X-Robots-Tag`, raw `<title>`/canonical/OG/meta-robots, JSON-LD types, sitemap parity, authoritative-404 probe (`http-evidence.json`, raw documents under `CONTROL/EVIDENCE/.../raw-html/`).

## Summary

| Metric | Value |
| --- | --- |
| Browser runs | **473** — 385 AUTOMATED_PASS · 44 with notes · 44 AUTOMATED_FAIL |
| Failing assertion ids (all classified below) | CONSOLE_CLEAN, NETWORK_CLEAN, TARGETS_44x44, ARIA_REFERENCES_RESOLVE |
| Raw HTTP records | 43 — 43 pass · 0 fail |
| Public→private→public metadata restoration | /research/about -> /research/account -> /research/about: PASS (private noindex: True) |
| Evidence PII/secret scan | 1001 text files scanned; findings: 0; screenshots listed for manual review: 473 |

## Per-route results

| Route | Surface | HTTP | X-Robots-Tag | pass / notes / fail | failing assertions |
| --- | --- | --- | --- | --- | --- |
| `/research` | public-research-homepage | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/access-hub` | access-hub | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/early-access` | early-access | 200 | noindex,nofollow,noarchive | 0 / 11 / 0 | CONSOLE_CLEAN, NETWORK_CLEAN |
| `/research/early-access/order-request` | order-flow | 200 | noindex,nofollow,noarchive | 0 / 11 / 0 | CONSOLE_CLEAN, NETWORK_CLEAN |
| `/research/apply` | access-hub | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/sign-in` | account-overview | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/support` | support | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/about` | public-research-homepage | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/how-it-works` | public-research-homepage | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/faq` | support | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/quality` | quality-testing | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/testing` | quality-testing | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/lots/XR-EVIDENCE-NEGATIVE-LOT` | public-lot-lookup-negative-state | 404 | noindex,nofollow,noarchive | 0 / 11 / 0 | CONSOLE_CLEAN, NETWORK_CLEAN |
| `/research/documents` | documents | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/policies` | public-research-homepage | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/contact` | support | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/privacy` | public-research-homepage | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/terms` | public-research-homepage | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/partners` | partners | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/organizations` | partners | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/affiliates` | partners | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/account` | account-overview | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/account/orders` | orders | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/account/subscription` | membership | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/account/care` | care-account | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/account/documents` | documents | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/account/support` | support | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/member` | account-overview | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/member/catalog` | catalog | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/care` | care | 200 | noindex,nofollow,noarchive | 0 / 0 / 11 | ARIA_REFERENCES_RESOLVE, CONSOLE_CLEAN, NETWORK_CLEAN, TARGETS_44x44 |
| `/care/appointments` | tebra-scheduler | 200 | noindex,nofollow,noarchive | 0 / 0 / 11 | ARIA_REFERENCES_RESOLVE, CONSOLE_CLEAN, NETWORK_CLEAN, TARGETS_44x44 |
| `/admin/research` | admin-critical | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/admin/research/fulfillment` | research-fulfillment | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/this-route-does-not-exist-xr-evidence` | not-found-error | 404 | noindex,nofollow,noarchive | 0 / 11 / 0 | CONSOLE_CLEAN, NETWORK_CLEAN |
| `/` | warm-silver-homepage-reconciliation | 200 | index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1 | 0 / 0 / 11 | ARIA_REFERENCES_RESOLVE, CONSOLE_CLEAN, NETWORK_CLEAN, TARGETS_44x44 |
| `/hino` | hino | 200 | — | 0 / 0 / 11 | CONSOLE_CLEAN, NETWORK_CLEAN, TARGETS_44x44 |
| `/research/policies/accessibility` | public-research-homepage | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/policies/research-use` | public-research-homepage | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/policies/shipping` | public-research-homepage | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/policies/returns` | public-research-homepage | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/account/profile` | orders | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/account/security` | orders | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |
| `/research/account/interests` | orders | 200 | noindex,nofollow,noarchive | 11 / 0 / 0 | — |

## Findings classification

- **CONSOLE_CLEAN** — HARNESS / BY DESIGN — the preview serves the production build with placeholder Supabase (127.0.0.1:54321, unreachable): data-backed endpoints answer 5xx and the client logs them (Early Access, order request, lot lookup); the 404 probe logs its own 404; Google Fonts requests are refused by the Care self-only CSP (Lane 05 finding 1, by design). No candidate-owned script error. Recorded, not a candidate defect.
  - routes: `/research/early-access` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/research/early-access/order-request` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/research/lots/XR-EVIDENCE-NEGATIVE-LOT` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/care` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/care/appointments` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/research/this-route-does-not-exist-xr-evidence` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/hino` (1440)
- **NETWORK_CLEAN** — HARNESS / BY DESIGN — failed requests are the placeholder-Supabase API calls (5xx), the 404 probe's own document status, and Google Fonts blocked by the Care self-only CSP; no candidate-owned asset fails.
  - routes: `/research/early-access` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/research/early-access/order-request` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/research/lots/XR-EVIDENCE-NEGATIVE-LOT` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/care` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/care/appointments` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/research/this-route-does-not-exist-xr-evidence` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/hino` (1440)
- **TARGETS_44x44** — GLOBAL SHELL / HINO — founder review item, not a Research-owned defect. Attribution from the run audits: on /care and /care/appointments every undersized target is global-shell markup rendered around the Care content (skip link, announcement dismiss button, header wordmark, footer links) — 0 Care-owned offenders; on / the page-owned offenders are the Home.tsx hero CTA ghost buttons. NOTE: Home.tsx is a hard-tripwire file that differs from production by exactly one class-name change on that CTA (btn-ghost-on-dark -> btn btn-ghost btn-on-dark, e551082, Codex lineage); the 29 px height comes from the unchanged global .btn-ghost rule in index.css and no production capture exists for comparison, so this is classified as global-shell style on a candidate-touched CTA — founder review. On /hino the offenders are the static Hino microsite header/nav (byte-identical to production). Every Research-owned surface passes. Decision recorded in XENIOS_RESEARCH_HUMAN_ONLY_BLOCKERS_2026-08-28.md.
  - routes: `/care` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/care/appointments` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/hino` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768)
- **ARIA_REFERENCES_RESOLVE** — GLOBAL SHELL — founder review item: the single unresolved reference on /, /care and /care/appointments is the shell mobile-nav button aria-controls=nav-mobile-overlay (overlay not mounted until opened) inside the Navbar, which is blob-identical to production. Research surfaces pass.
  - routes: `/care` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/care/appointments` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768); `/` (1024, 1440, 200pct, 320, 360, 375, 390, 390/forced-colors, 390/reduced-motion, 430, 768)

## Screenshot index (`browser/`, 68 files, 11.7 MB)

Selection rule: 1440 and 390 default renders for every surface, the 200 % zoom equivalent for the Research homepage, and reduced-motion / forced-colors renders for the Research homepage, the Care scheduler page, the account overview and /hino. File names follow `<surface>--<state>--chromium--<width|200pct>[-<variant>]--01.png` and never contain names, emails, order references or tokens.

| File | Route | Width / variant | Verdict |
| --- | --- | --- | --- |
| `public-research-homepage--default--chromium--1440--01.png` | `/research` | 1440 | AUTOMATED_PASS |
| `public-research-homepage--default--chromium--390--01.png` | `/research` | 390 | AUTOMATED_PASS |
| `access-hub--default--chromium--1440--01.png` | `/research/access-hub` | 1440 | AUTOMATED_PASS |
| `access-hub--default--chromium--390--01.png` | `/research/access-hub` | 390 | AUTOMATED_PASS |
| `early-access--default--chromium--1440--01.png` | `/research/early-access` | 1440 | AUTOMATED_PASS_WITH_NOTES |
| `early-access--default--chromium--390--01.png` | `/research/early-access` | 390 | AUTOMATED_PASS_WITH_NOTES |
| `order-flow--default--chromium--1440--01.png` | `/research/early-access/order-request` | 1440 | AUTOMATED_PASS_WITH_NOTES |
| `order-flow--default--chromium--390--01.png` | `/research/early-access/order-request` | 390 | AUTOMATED_PASS_WITH_NOTES |
| `access-hub-apply--default--chromium--1440--01.png` | `/research/apply` | 1440 | AUTOMATED_PASS |
| `access-hub-apply--default--chromium--390--01.png` | `/research/apply` | 390 | AUTOMATED_PASS |
| `account-overview-sign-in--unauthorized--chromium--1440--01.png` | `/research/sign-in` | 1440 | AUTOMATED_PASS |
| `account-overview-sign-in--unauthorized--chromium--390--01.png` | `/research/sign-in` | 390 | AUTOMATED_PASS |
| `support--default--chromium--1440--01.png` | `/research/support` | 1440 | AUTOMATED_PASS |
| `support--default--chromium--390--01.png` | `/research/support` | 390 | AUTOMATED_PASS |
| `public-research-homepage-about--default--chromium--1440--01.png` | `/research/about` | 1440 | AUTOMATED_PASS |
| `public-research-homepage-about--default--chromium--390--01.png` | `/research/about` | 390 | AUTOMATED_PASS |
| `public-research-homepage-how-it-works--default--chromium--1440--01.png` | `/research/how-it-works` | 1440 | AUTOMATED_PASS |
| `public-research-homepage-how-it-works--default--chromium--390--01.png` | `/research/how-it-works` | 390 | AUTOMATED_PASS |
| `support-faq--default--chromium--1440--01.png` | `/research/faq` | 1440 | AUTOMATED_PASS |
| `support-faq--default--chromium--390--01.png` | `/research/faq` | 390 | AUTOMATED_PASS |
| `quality-testing--default--chromium--1440--01.png` | `/research/quality` | 1440 | AUTOMATED_PASS |
| `quality-testing--default--chromium--390--01.png` | `/research/quality` | 390 | AUTOMATED_PASS |
| `quality-testing-testing--default--chromium--1440--01.png` | `/research/testing` | 1440 | AUTOMATED_PASS |
| `quality-testing-testing--default--chromium--390--01.png` | `/research/testing` | 390 | AUTOMATED_PASS |
| `public-lot-lookup-negative-state--unavailable--chromium--1440--01.png` | `/research/lots/XR-EVIDENCE-NEGATIVE-LOT` | 1440 | AUTOMATED_PASS_WITH_NOTES |
| `public-lot-lookup-negative-state--unavailable--chromium--390--01.png` | `/research/lots/XR-EVIDENCE-NEGATIVE-LOT` | 390 | AUTOMATED_PASS_WITH_NOTES |
| `documents--default--chromium--1440--01.png` | `/research/documents` | 1440 | AUTOMATED_PASS |
| `documents--default--chromium--390--01.png` | `/research/documents` | 390 | AUTOMATED_PASS |
| `public-research-homepage-policies--default--chromium--1440--01.png` | `/research/policies` | 1440 | AUTOMATED_PASS |
| `public-research-homepage-policies--default--chromium--390--01.png` | `/research/policies` | 390 | AUTOMATED_PASS |
| `support-contact--default--chromium--1440--01.png` | `/research/contact` | 1440 | AUTOMATED_PASS |
| `support-contact--default--chromium--390--01.png` | `/research/contact` | 390 | AUTOMATED_PASS |
| `public-research-homepage-privacy--default--chromium--1440--01.png` | `/research/privacy` | 1440 | AUTOMATED_PASS |
| `public-research-homepage-privacy--default--chromium--390--01.png` | `/research/privacy` | 390 | AUTOMATED_PASS |
| `public-research-homepage-terms--default--chromium--1440--01.png` | `/research/terms` | 1440 | AUTOMATED_PASS |
| `public-research-homepage-terms--default--chromium--390--01.png` | `/research/terms` | 390 | AUTOMATED_PASS |
| `partners--default--chromium--1440--01.png` | `/research/partners` | 1440 | AUTOMATED_PASS |
| `partners--default--chromium--390--01.png` | `/research/partners` | 390 | AUTOMATED_PASS |
| `partners-organizations--default--chromium--1440--01.png` | `/research/organizations` | 1440 | AUTOMATED_PASS |
| `partners-organizations--default--chromium--390--01.png` | `/research/organizations` | 390 | AUTOMATED_PASS |
| `partners-affiliates--default--chromium--1440--01.png` | `/research/affiliates` | 1440 | AUTOMATED_PASS |
| `partners-affiliates--default--chromium--390--01.png` | `/research/affiliates` | 390 | AUTOMATED_PASS |
| `account-overview--unauthorized--chromium--1440--01.png` | `/research/account` | 1440 | AUTOMATED_PASS |
| `account-overview--unauthorized--chromium--390--01.png` | `/research/account` | 390 | AUTOMATED_PASS |
| `orders--unauthorized--chromium--1440--01.png` | `/research/account/orders` | 1440 | AUTOMATED_PASS |
| `orders--unauthorized--chromium--390--01.png` | `/research/account/orders` | 390 | AUTOMATED_PASS |
| `membership--unauthorized--chromium--1440--01.png` | `/research/account/subscription` | 1440 | AUTOMATED_PASS |
| `membership--unauthorized--chromium--390--01.png` | `/research/account/subscription` | 390 | AUTOMATED_PASS |
| `care-account--unauthorized--chromium--1440--01.png` | `/research/account/care` | 1440 | AUTOMATED_PASS |
| `care-account--unauthorized--chromium--390--01.png` | `/research/account/care` | 390 | AUTOMATED_PASS |
| `documents--unauthorized--chromium--1440--01.png` | `/research/account/documents` | 1440 | AUTOMATED_PASS |
| `documents--unauthorized--chromium--390--01.png` | `/research/account/documents` | 390 | AUTOMATED_PASS |
| `support--unauthorized--chromium--1440--01.png` | `/research/account/support` | 1440 | AUTOMATED_PASS |
| `support--unauthorized--chromium--390--01.png` | `/research/account/support` | 390 | AUTOMATED_PASS |
| `account-overview-member--unauthorized--chromium--1440--01.png` | `/research/member` | 1440 | AUTOMATED_PASS |
| `account-overview-member--unauthorized--chromium--390--01.png` | `/research/member` | 390 | AUTOMATED_PASS |
| `catalog--unauthorized--chromium--1440--01.png` | `/research/member/catalog` | 1440 | AUTOMATED_PASS |
| `catalog--unauthorized--chromium--390--01.png` | `/research/member/catalog` | 390 | AUTOMATED_PASS |
| `care--default--chromium--1440--01.png` | `/care` | 1440 | AUTOMATED_FAIL |
| `care--default--chromium--390--01.png` | `/care` | 390 | AUTOMATED_FAIL |
| `tebra-scheduler--disabled--chromium--1440--01.png` | `/care/appointments` | 1440 | AUTOMATED_FAIL |
| `tebra-scheduler--disabled--chromium--390--01.png` | `/care/appointments` | 390 | AUTOMATED_FAIL |
| `admin-critical--unauthorized--chromium--1440--01.png` | `/admin/research` | 1440 | AUTOMATED_PASS |
| `admin-critical--unauthorized--chromium--390--01.png` | `/admin/research` | 390 | AUTOMATED_PASS |
| `research-fulfillment--unauthorized--chromium--1440--01.png` | `/admin/research/fulfillment` | 1440 | AUTOMATED_PASS |
| `research-fulfillment--unauthorized--chromium--390--01.png` | `/admin/research/fulfillment` | 390 | AUTOMATED_PASS |
| `not-found-error--error--chromium--1440--01.png` | `/research/this-route-does-not-exist-xr-evidence` | 1440 | AUTOMATED_PASS_WITH_NOTES |
| `not-found-error--error--chromium--390--01.png` | `/research/this-route-does-not-exist-xr-evidence` | 390 | AUTOMATED_PASS_WITH_NOTES |

Every screenshot was rendered from placeholder/synthetic state and carries `piiPhiReview: MANUAL_PENDING` in `browser-matrix.json`; the Lead inspected the account, admin and Care captures included here before commit and found no real customer, provider, or product-interest data (there is none in the harness).

## Files

- `README.md` — this document
- `evidence-manifest.json` — schemaVersion-2 manifest merged by `scripts/evidence/generate-evidence-manifest.mjs` (no reviewer verdict is set by tooling)
- `browser-matrix.json` — run index, tool versions, summary, metadata restoration
- `http-evidence.json` — raw HTTP head evidence per route
- `pii-scan.json` — scan of every text artefact and file name in the evidence set
- `browser/*.png` — screenshot subset
