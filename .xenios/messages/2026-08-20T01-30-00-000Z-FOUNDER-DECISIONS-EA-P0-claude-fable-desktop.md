# FOUNDER DECISIONS — EARLY ACCESS P0 (2026-08-20, binding for all lanes)

From: claude-fable-desktop (Session 1, lead). Source: founder message 2026-08-20.
Every open question from the dispatch packets is now DECIDED. Build against these,
not against the alternatives your lane prompt asked you to design.

## 1. One-code gate → NARROW EARLY ACCESS ROUTE EXEMPTION (S2)

- DECIDED: narrow exemption. `RESEARCH_PUBLIC=true` is REJECTED as the solution
  (it opens the broader Research surface).
- Desired behavior: `/research/early-access` → no outer Research password → one
  Xenios Genesis code → EA customer ordering surface. The outer wall stays for
  every other route that has it today.
- LEAD FINDING (verified in source): the narrow exemption ALREADY EXISTS
  structurally. `/research/early-access*` renders `EarlyAccessRoute` directly in
  `client/src/research/section.tsx` with NO Gateway wrapper, and every EA
  customer API door is individually admitted through the /api/research wall
  (`EARLY_ACCESS_OPEN_READ/WRITE_PATHS` + anchored order/cart/assisted-order
  regexes in `server/research/index.ts`). Do NOT rebuild it.
- S2 remaining scope: (a) unlock-screen copy displays "Xenios Genesis" (the code
  itself, `XeniosGenesis`, is customer-entered — plaintext NEVER committed,
  bundled, logged, or stored in browser storage); (b) hash tooling so the lead
  can set `RESEARCH_EARLY_ACCESS_PASSWORD_HASH` for the new code (scrypt format
  per `private-access-config.ts`); (c) wall-admission regression TESTS pinning:
  every EA journey door answers without the outer research cookie AND
  admin/member/supplier/finance/Care routes remain walled. The env change itself
  is lead-owned at release.

## 2. Catalog → full 426 rows, retail-only (S3, S4)

- Proceed with the 426-row reconciliation. Source: MASTER CATALOG → Suggested
  Sell Price. Target: 426 rows, 424 numeric retail prices, 2 "Price on request"
  (BAM15 500 mcg; Syringes & Alcohol Swabs). NEVER show $0.
- Customer surfaces show retail ONLY. Never wholesale/supplier/cost/margin/
  markup/benchmark/internal notes.

## 3. Six-row delta adjudication (S3) — DECIDED per row

- Retatrutide 60 mg → add/reconcile as exact variant at $249 IF identity unambiguous.
- MOTS-C 40 mg → add/reconcile at $129 IF identity unambiguous.
- Glutathione 600 mg → add/reconcile at $69 IF identity unambiguous.
- CJC-1295 + Ipamorelin WITH DAC → do NOT invent the component split. Keep
  visible with a truthful non-direct-purchase state until the exact formulation
  is confirmed. Retail target $99 for the exact approved identity.
- Oxytocin 10 mg → NO duplicate. Map to the existing canonical variant; use the
  workbook retail target.
- Hexarelin 5 mg → NO duplicate. Map to the existing canonical variant; use the
  workbook retail target.
- Kisspeptin-10 10 mg → existing match (GRP-0308) is VALID. Include in the
  retail reconciliation at $65.
- No guessed mappings. No duplicate variants.

## 4. Quantity (S5, and every lane touching quantities)

- 100 units max per exact variant BY DEFAULT, reconciled across UI, shared
  contracts, server validation, EA order, cart, quote, canonical order, DB
  constraints, admin, tests. No hidden 20/50 caps. A real explicit lower
  product limit may remain.

## 5. Affiliate — KEEP IT SIMPLE (S6)

- Today's EA version: optional Affiliate Code field + preserve `?ref=` when
  present. Store the NORMALIZED code with the XRR request and the canonical
  order. Show in authorized admin. Founder matches codes to owners manually.
- Do NOT hold launch for onboarding/commission/payout/CRM/advanced attribution.
- Unknown code must NOT stop an order. The code can never change retail price,
  access, payment, product eligibility, or order ownership.

## 6. Emails — REQUIRED TODAY (S7)

- Every successfully persisted EA request/order enqueues BOTH: (A) customer
  confirmation, (B) Xenios admin/founder new-order email. Existing durable
  outbox; email failure never loses the order.
- Customer email: Xenios Research, reference, products/variants/quantities,
  RETAIL price/total or quote state, payment status, next step, safe
  status/support link.
- Admin email: reference, customer/contact summary, products/variants/
  quantities, RETAIL pricing, affiliate code, payment state, secure admin link,
  next action.
- Never include wholesale/supplier cost, margin, internal notes, credentials.
- Admin recipient is SERVER-side configured. Never hardcoded in frontend.
- No real sends in dev/tests; production sending activates only via the lead's
  release packet.

## 7. Product pathway (S3, S4)

- Show the full offering; do NOT make every priced product direct RUO commerce.
- Server-authoritative actions stand: BUY_NOW / ASSISTED_ORDER / REQUEST_QUOTE /
  CARE / TEMPORARILY_HELD / NOT_AVAILABLE. Clinical/provider products remain Care.

## 8. Integration order (all)

S2 gate → S3 catalog/retail → S5 order/qty100 → S6 affiliate → S7 emails →
S8 payment/canonical → S9 fulfillment → S4 storefront/mobile → S10 E2E/security.
Push proven slices immediately; the lead integrates continuously and owns all
production mutations. After EA P0 is green the fleet CONTINUES through
`.xenios/FULL_VISION.md` in dependency order — checkpoint, do not dissolve.
