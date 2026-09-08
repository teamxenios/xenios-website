# Affiliate recommendation links and QR export — rendered walkthrough, 2026-09-08

**PASS for the bounded checks below: 21 steps, 0 failures, exit 0**, observed
2026-09-08T02:31:34Z. Author: Claude, as the available test owner during the
Codex outage. **This is Claude's own run, not an independent review**; it
closes the "no rendered browser proof" gap for the QR export, and nothing
more.

## What ran

`qr-links-walkthrough.mts` (beside this file; SHA-256
`a0dd6fe265263898c84f775ce43da96b7de6e04b8fdd8967decf791113ca5581`) on the
pinned Node 20.19.0 against the candidate's **built client** (341 files,
tree hash `e088a130…`) at branch head `60d6d393…`, runtime freeze `bf7b5fe`.
Chromium 149.0.7827.55 (Playwright build 1228), headless, real
`Input.dispatchMouseEvent` clicks and `Input.insertText` typing over CDP — no
React internals, no injected session storage. Network boundary enforced to
the loopback origin: **zero violations**, zero external requests.

Server composition: the **real** `registerReferralV1Api` +
`createReferralV1Service` (route file SHA-256 `51f865c3…`) over the **real**
`createSupabaseReferralV1Store`, with the RPC replaced by a schema-valid fake
that answers `listOwn` for one active affiliate persona. Everything else is
the existing Resource Hub preview composition, untouched. The public URL and
its token were therefore derived by the real service from the real HMAC
scheme, not typed into a fixture.

## What was proven, in order

1. Signed-out `/research/partners/links` offers **Sign in** with the exact
   return `returnTo=%2Fresearch%2Fpartners%2Flinks` and the notice that
   signing in does not enroll anyone as an affiliate.
2. Rendered sign-in as `affiliate@preview.invalid` returns to the Links page
   and lists the recommendation link.
3. The shareable link shown equals the server-derived public URL exactly.
4. The fake RPC was reached only through the real store: `authority` then
   `execute/listOwn`.
5. **Preview print card** opens a modal dialog whose SVG path equals a QR
   generated independently in Node from the same URL (37×37 modules,
   viewBox `0 0 45 45`), and whose text carries the exact URL.
6. **jsQR decodes the rendered code back to the exact URL** — an independent
   read of the pixels, not a comparison of strings.
7. Close preview closes the dialog.
8. **Download QR (SVG)** produces a real Chromium download,
   `xenios-recommendation-qr.svg`, 9,571 bytes, SHA-256
   `d5dcf148…`, **byte-identical** to the expected SVG; the page shows the
   honest status "QR download requested. Your browser controls whether the
   file was saved."
9. Width sweep 320, 390, 768, 1024, 1440: links page and open print card
   both have `scrollWidth === innerWidth` at every width; ten captures.
10. Rendered **Sign out** from the account page; the Links page is signed out
    again and shows no link.
11. Negative control: `member@preview.invalid` (no partner) signs in and is
    told referral access is not active, with **no export controls** rendered.
12. `GET /api/research/partner/links` without a session answers **401**.

Console: only Chromium's deprecation warning for
`apple-mobile-web-app-capable`, three times; no page errors. Fifteen captures
and the downloaded SVG are hashed in `qr-links-walkthrough-captures.sha256.txt`;
the full step record with timings is `qr-links-walkthrough-60d6d39.json`.

## Visual inspection

Claude looked at `03-print-card-1440.png` and `04-links-320.png`. The print
card shows the code, the URL beneath it, the partner-compensation
disclosure, the no-guarantee line and the expiry date. At 320 px the link
card stacks its controls without overflow. One cosmetic observation, not a
defect: at 320 px the destination `<select>` clips its own caret glyph inside
its box. The other thirteen captures were measured, not individually
inspected.

## What this does not prove

- SQL eligibility, issuance, revocation and attribution: the fake RPC answers
  a fixed `listOwn`; those have separate 2026-09-04 rehearsal evidence
  (`docs/ux/referral-v1-20260904/`) that predates the QR export.
- Real accounts, database, Storage, email or production configuration.
- Scanning the printed code with a phone camera; jsQR on the rasterized SVG
  is the stand-in.
- Any launch of the referral programme. `RESEARCH_REFERRAL_V1_ENABLED` and
  the affiliate flags in production are not represented here.
- Independent review: a reviewer other than Claude has not accepted this.
