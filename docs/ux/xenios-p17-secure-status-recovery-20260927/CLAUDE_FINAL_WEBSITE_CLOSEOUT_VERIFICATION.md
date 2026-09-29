# Claude final website closeout verification

Reviewer: Claude Code, 2026-09-29. First pass: no runtime source edited, nothing deployed, no migration applied, no real email sent. The private founder archive is not referenced or copied here.

## Candidate identity (verified from Git)

| Role | SHA | Tree / note |
| --- | --- | --- |
| Independently reviewed parent | `fef7b313c23ac0e12046420041aa51a3a6e3c2d6` | `55bdc57d…` |
| **Final runtime** | `899395c4980cc554f9a2c6bdb3eb3d14e63ee65a` | `a09ffdf6f52537e0c289875a05f825c8a40ad75a` (verified) |
| Test-only tip | `cfba43d5115580b8603af0e52b52c2032f466472` | tests only |
| Release-control tip | `9b1d51417b5b1764f5596d9b7f693f9202e6d33d` | `package.json` scripts + `scripts/acceptance/verify-no-em-dash.mjs` |
| Generated record | `8b0556f7b4261712240b44f01299d8b19bd0ab2b` | site record |
| Docs/handoff tip reviewed | `7d1c6ff98cb3fcc73a0ce03b1f220872ba1da0c5` | docs/records only |
| Production | `79414143d4355d5d3d14cd5fe6e5a536dc68d99d` | not re-observed by Claude; no mutation performed |

Ancestry `fef7b313 → 899395c → 7d1c6ff` verified. After `899395c`, the only non-test, non-doc paths changed are `package.json` (build now runs the gate before and after `script/build.mjs`; `render-build` calls `npm run build`) and the gate script; application source under `client/`, `server/`, `shared/`, `supabase/` is byte-identical between `899395c` and `7d1c6ff` except eight test files. The packet's "starting branch tip" `42c627b342095f…` is a typo for `42c627b02adf97ec…` (P3, documentation only).

Runtime commits since the parent: `263df23` and `91f834a` (+ merge `c6a6ca7`) change only `client/src/clarity/pages.tsx`; `899395c` is the copy/punctuation commit (57 files) plus the stated unavailable-state correction (placeholders "—" → "Not available"; two Care labels "Pharmacy…" → "Provider…"). P-17 source (`server/research/status-recovery/**`, `shared/research/status-recovery/**`, outbox, `server/index.ts`, `server/routes.ts`) and `supabase/migrations/**` are unchanged since `fef7b313` apart from added tests. Committed migration bytes at both SHAs: SHA-256 `98cce457db8d82c72a399223117dcf4d98488dc153f3d1883e65a07e95220292`.

## Runtime and evidence levels

- **Node:** `C:/Users/sboad/AppData/Local/Temp/claude/…/scratchpad/node20/node-v20.19.0-win-x64/node.exe`, `v20.19.0`; archive `node-v20.19.0-win-x64.zip` SHA-256 `be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`, matching the official `SHASUMS256.txt`.
- **npm:** bundled npm `10.8.2` exits 1 with no message on every command in this session's environment (even `npm config list`), so the lockfile-exact install used the global npm `11.11.0` running on Node 20.19.0. The lockfile is unchanged since `fef7b313`. Build, gate, tests and harness all executed on Node 20.19.0.
- **Evidence levels:** source inspection; gate unit tests + independent gate probes; exact production build (Node 20.19.0); independent source/build scans; exact-build browser via a local review harness. The harness serves the candidate's own `dist/public` with `serveStatic` plus the candidate's real status-recovery HTTP/service/crypto/notification code over its shipped in-memory store, and a stub of the existing assisted-order status endpoint that accepts exactly one fixture token for one reference. SQL was not re-run because the migration is byte-identical to the one qualified in `CLAUDE_INDEPENDENT_REVIEW.md` (Supabase PG17, apply-twice, 80 adversarial checks, race).
- **Not established:** managed staging, managed parity, external delivery.

## R-01, R-02, R-03

| Check | Result | Evidence |
| --- | --- | --- |
| R-01 valid-looking `CARE-VALID1234` | PASS: "Care status is handled separately…", links Start Care (`/care`) and Care support; 0 recovery calls | harness browser |
| R-01 unknown / lowercase / bare `CARE-` | PASS: identical text and links; 0 recovery calls; no existence or status disclosure | harness browser |
| R-02 signed-out | PASS: no "View account orders" | harness browser |
| R-02 signed-in active member | PASS: shown only when `/api/research/member/me` with the Supabase bearer returns `ok` and `member.status === "active"`; hidden on 401/403; removed on sign-out; href `/research/account/orders` | source + candidate tests |
| R-02 same-browser status | PASS: valid stored token for that exact reference is verified by the existing server status endpoint, then navigates to `/research/early-access/order-request/<ref>` with no recovery call; stale token → server refuses → neutral recovery; token stored for another reference → not used | harness browser |
| R-02 typed email creates no authority | PASS | source |
| R-03 initial email-link load | PASS | candidate tests + prior review |
| R-03 same-tab hash navigation | PASS: token gone from the URL by the next tick; `View status` shown; 0 exchange calls on hash/GET | harness browser |
| R-03 history | PASS: entries `/`, `/status`, `/status`; no entry holds the token | harness browser |
| R-03 explicit POST exchange | PASS: POST exchange then status (Payment pending, correct reference); End session works | harness browser |
| R-03 replay / malformed | PASS: replay shows the safe alert **with focus moved to the alert**; malformed fragment scrubbed, form shown, no `View status` | harness browser |
| R-03 no raw token persisted | PASS: not in localStorage, sessionStorage or DOM | harness browser |

## Em dashes

| Measure | Result |
| --- | --- |
| Candidate gate (`npm run build`: source pass + build pass) | PASS on Node 20.19.0 |
| Gate unit tests (`npm run test:no-em-dash`) | 8/8 PASS |
| Claude probes of the gate | Detects literal U+2014 in JSX text, string, template literal (with and without substitution), JSON value and aria-label; `&mdash;`, `&#8212;`, `&#x2014;`, `\u2014`. Passes comments and approved punctuation. Excludes test files. Build scan detects a customer string and passes only the allowlisted Supabase debug string |
| Rendered text on 22 public routes (text, aria-label, title, placeholder, alt, meta description) | **0** em dashes |
| Production build raw U+2014 | 3, **none customer-facing**: server-bundle regex `/[–—]/g` that *removes* em dashes in normalisation; Supabase auth-js debug log (allowlisted); `sw.js` code comment |
| Customer-facing production-build em dashes | **0** |
| Runtime source outside comments (`client/`, `server/`, `shared/`) | 0 customer-facing. Remaining non-comment hits are multi-line CSS/JSX comments, a Markdown packet, and normalisers that strip em dashes (`normalize.ts`, `publication.ts`) or render them as `--` in e-sign PDFs (`pdf.ts`, pre-existing) |
| **Admin UI via runtime config (outside gate roots)** | **24 rendered labels** (see F-01) |
| Copy quality | PASS: 95 changed lines use periods, colons, semicolons, commas or "Not available"; 0 spaced-hyphen or `--` substitutions; meaning preserved (for example "This is an inquiry. It doesn't create an account or approve anything."); tracking lines keep carrier and number |
| Historical/immutable records rewritten | None observed in the runtime commit |

## Zoom

| Item | Result |
| --- | --- |
| True 200% | REVIEWED CODEX EVIDENCE. Outer 640 CSS px against inner 319 (ratio 2.01, consistent with real Chrome zoom); client/scroll width 304/304; overflow 0; clipped 0; focus described. No screenshot committed in the packet |
| True 400% | NOT RUN (Codex: three documented attempts; its controlled Chrome did not change inner width. Claude: tools cannot set real browser zoom) |
| Proxies | Not used as zoom evidence. Earlier 320/640 CSS-width reflow proxies (prior review) remain proxies only |

## Security, authority, business boundaries

- P-17 token lifecycle, canonical recipient, neutral response, scanner-safe exchange, status-only session, owner isolation, notification/outbox: **unchanged source** since `fef7b313` (qualified in the prior review); live re-check through the harness confirmed request, exchange, status, end and replay.
- Account authority: server-confirmed only (member `active`). Care boundary: Care references never enter P-17; no Care data surfaced.
- `commerceEnabled`: untouched (no server/config change). Native commerce dark: unchanged.
- Brand, claims, products: public brand Xenios; 0 Eon/Infinity; 0 product cards, counts or unapproved prices; 0 unverified clinician/pharmacy/testing/shipping/response claims; no practice ordering, public Care commission, wholesale, numeric commission terms or named roles (sweep of 22 routes).

## Findings

| ID | Sev | Area | Expected | Actual | Reproduction | Recommended correction | Independently reproduced |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | P2 | Admin UI em dashes / gate scope | Closeout scope includes admin/operator UI; gate scans all runtime copy | `config/research/revenue-launch/seth-source-reconciliation-20260905.json` feeds `sourceProduct`/`sourceConfiguration` to `productLabel`/`configurationLabel` (`server/research/products-diagnostics/revenue-launch-reconciliation.ts:252-253`), rendered in the admin `ReconciliationReviewPanel` (via `ProductsAdmin`). 24 of 107 rows contain U+2014 (for example "Capsule — 100 mg"). `config/` is not a gate root and the JSON is read at runtime, so neither the source nor the build scan sees it | `node -e` walk of the JSON; `grep row.productLabel/configurationLabel` | Keep the source record unchanged; normalise the two labels at projection (" — " → ": " or ", ") and add `config/research` (or projected admin strings) to the gate | YES |
| F-02 | P3 | Gate exclusions | Runtime folders are never skipped | Any path segment named `history`, `historical`, `archive`, `archives` or `audit-evidence` is excluded; no runtime folder uses these names today | gate probe | Restrict exclusions to explicit evidence roots | YES |
| F-03 | P3 | R-01 UX | Another reference can be tried | After Care guidance the form is hidden until reload; "Start Care" points to `/care` (approved CTA target `/care/schedule`) | harness browser | Keep the form visible under the guidance; point Start Care to `/care/schedule` | YES |
| F-04 | P3 | Build/deploy identity | Deployed build runs the gate | Deploying exactly `899395c` builds without the gate (added in `c4396f3`); application bytes are identical at `9b1d514`/`7d1c6ff` | git diff | Deploy the release-control tip (same application bytes), or record that the gate ran separately | YES |
| F-05 | P3 | Staging checksum | Migration applied from pinned bytes | With `core.autocrlf=true` a Windows working copy hashes `c7892b36…` instead of the pinned `98cce457…` | sha256 of worktree vs `git show` | Apply the migration from committed bytes (`git show <sha>:path`) or an LF checkout | YES |
| F-06 | P3 | Packet accuracy | Exact starting tip | Packet says `42c627b342095f…`; actual `42c627b02adf97ec…` | git | Correct in docs | YES |
| F-07 | P3 | Tooling | Pinned npm usable | Bundled npm 10.8.2 fails silently in this session environment; npm 11.11.0 used for install | npm diagnostics | Record per-environment; not a candidate defect | YES (environment) |

The 12 P3 items from `CLAUDE_INDEPENDENT_REVIEW.md` that were not in scope remain deferred; R-08 (focus after exchange error) is now fixed.

## Full suite (Node 20.19.0)

See the appended result.

**Result (Node v20.19.0, docs tip `7d1c6ff`, application source identical to runtime `899395c`, `--testTimeout=60000`):** 987 files passed, 6 skipped; **18,180 tests passed, 85 skipped, 0 failed** (304 s). Typecheck (`tsc`, Node 20.19.0): PASS. Production build with both gate passes (Node 20.19.0): PASS.

## Readiness

- P0 0 · P1 0 · P2 1 (F-01) · P3 6 new (F-02 to F-07) plus the deferred backlog.
- **READY FOR MANAGED STAGING QUALIFICATION: NO**, for one missing evidence item: **true 400% Chrome page zoom on `/status`**. Required: Chrome's displayed zoom value of 400%, `innerWidth`, `innerHeight`, `document.documentElement.scrollWidth` and `clientWidth`, `devicePixelRatio`, horizontal overflow 0, no clipped or obscured controls, visible focus and logical Tab order, and a screenshot showing the zoom indicator.
- No source blocker for staging. F-01 (admin reconciliation labels) should be fixed before the production GO. It is a small projection-layer change and can be done while the 400% evidence is captured.
- Managed staging: NOT RUN. External delivery: UNVERIFIED. Production mutated: NO.
